import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Store } from './store.mjs';
import { modelAction, validateProvider } from './providers.mjs';
import { createExperiment, observe, applyAction, intervene } from '../lab/engine.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function safeFailure(error) {
  const message=String(error?.message||'');
  if(/^Provider request failed \(HTTP [1-5][0-9]{2}\)$/.test(message))return message+'. Check your model, API key, quota and provider availability.';
  const allowed=new Set(['Provider response exceeded limit','Provider returned invalid JSON action','Provider action exceeded schema bounds','Invalid bounded action','Run storage limit reached']);
  if(allowed.has(message))return message+'. The run was stopped safely.';
  if(error instanceof TypeError)return 'Provider connection failed. Check runtime network access and provider availability.';
  return 'Model action could not be applied. Check provider settings and retry.';
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
async function body(request) {
  if(Number(request.headers.get('content-length'))>16384) throw fail('Request too large',413);
  if (!request.headers.get('content-type')?.includes('application/json')) throw fail('JSON content type required',415);
  const reader=request.body?.getReader(); if(!reader)throw fail('JSON body required');
  let bytes=0,text='';const decoder=new TextDecoder();
  while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384){await reader.cancel();throw fail('Request too large',413);}text+=decoder.decode(value,{stream:true});}
  try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected object');return value;}catch{throw fail('Invalid JSON object');}
}
function config(raw) {
  if(!raw || typeof raw!=='object')throw fail('Experiment config required');
  const value={arenaId:raw.arenaId,agentCount:raw.agentCount,seed:raw.seed,objective:raw.objective||'',maxSteps:raw.maxSteps??30,ruleChangeStep:raw.ruleChangeStep??null};
  if(!Number.isInteger(value.maxSteps)||value.maxSteps<1||value.maxSteps>100)throw fail('maxSteps must be 1–100');
  if(typeof value.objective!=='string'||value.objective.length>2000)throw fail('Objective too long (maximum 2000 characters)');
  if(value.ruleChangeStep!==null && (!Number.isInteger(value.ruleChangeStep)||value.ruleChangeStep<1||value.ruleChangeStep>value.maxSteps))throw fail('Invalid rule change step');
  return value;
}
export function createLabHandler(options={}) {
  const execution=options.execution||process.env.ARENA_EXECUTION||'hosted';
  if(!['hosted','local'].includes(execution))throw new Error('ARENA_EXECUTION must be hosted or local');
  const dir=options.dataDir||process.env.ARENA_DATA_DIR;
  const store=new Store(dir||join('.arena-data',execution)), active=new Map(), attempts=new Map();
  const transport=options.transport||modelAction;
  let closed=false;
  function throttle(key,limit) {
    const now=Date.now();
    for(const [key,item] of attempts)if(item.until<now)attempts.delete(key);
    if(attempts.size>10000)throw fail('Runtime busy',429);
    const entry=attempts.get(key)||{until:now+60000,count:0};
    entry.count++;attempts.set(key,entry);if(entry.count>limit)throw fail('Too many requests; retry in a minute',429);
  }
  function save(run){run.updatedAt=Date.now();if(JSON.stringify(run).length>2_000_000)throw fail('Run storage limit reached',429);store.saveRun(run);}
  async function execute(run,provider,controller) {
    const timeout=setTimeout(()=>controller.abort('time-limit'),120000);timeout.unref?.();
    try {
      while(run.status==='running'&&!controller.signal.aborted) {
        if(run.state.step>=run.config.maxSteps || run.usage.outputTokens>=8192){run.status='limited';break;}
        const slot='agent-'+((run.state.step%run.config.agentCount)+1);
        const result=await transport(provider,observe(run.state,slot),controller.signal,Math.min(512,8192-run.usage.outputTokens));
        if(controller.signal.aborted)break;
        if(!result.action || typeof result.action!=='object'||Array.isArray(result.action)||JSON.stringify(result.action).length>4096)throw new Error('Invalid bounded action');
        run.usage.calls++;
        run.usage.inputTokens+=Math.max(0,Math.min(100000,Number(result.usage?.inputTokens)||0));
        run.usage.outputTokens+=Math.max(1,Math.min(65536,Number(result.usage?.outputTokens)||512));
        run.state=applyAction(run.state,slot,result.action);
        if(run.config.ruleChangeStep && run.state.step===run.config.ruleChangeStep)run.state=intervene(run.state);
        if(run.state.status==='completed')run.status='completed';
        save(run);
      }
      if(controller.signal.aborted){run.status=controller.signal.reason==='time-limit'?'limited':'stopped';run.error=controller.signal.reason==='time-limit'?'Run time limit reached':undefined;}
    }catch(error){run.status=controller.signal.reason==='time-limit'?'limited':controller.signal.aborted?'stopped':'failed';run.error=controller.signal.reason==='time-limit'?'Run time limit reached':controller.signal.aborted?'Run stopped':safeFailure(error);}
    finally {clearTimeout(timeout);provider.apiKey='';active.delete(run.id);if(!closed)save(run);}
  }
  async function handle(request) {
    try {
      const path=new URL(request.url).pathname.replace(/^\/api\/lab\/?/,'').replace(/\/$/,'');
      const method=request.method;
      if(path==='health'&&method==='GET')return json({ok:true,execution,storage:{type:'sqlite',warning:dir?'Durability requires an operator-mounted persistent disk at ARENA_DATA_DIR.':'Default .arena-data storage; hosted data may be lost on restart or redeploy without a persistent ARENA_DATA_DIR.'}});
      if(/^auth\/(register|login)$/.test(path)&&method==='POST') {
        throttle('auth-global',60);
        const data=await body(request);
        if(typeof data.username!=='string'||!/^[a-zA-Z0-9_-]{3,40}$/.test(data.username)||typeof data.password!=='string'||data.password.length<12||data.password.length>128)throw fail('Use a 3–40 character username and 12–128 character password');
        const username=data.username.toLowerCase();throttle('auth:'+username,10);
        return json(path.endsWith('register')?store.register(username,data.password):store.login(username,data.password));
      }
      const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]||'';
      const user=token&&store.user(token);if(!user)throw fail('Sign in required',401);
      throttle('requests:'+user.id,240);
      if(path==='auth/me'&&method==='GET')return json({user});
      if(path==='auth/logout'&&method==='POST'){store.logout(token);return json({ok:true});}
      if(path==='runs'&&method==='GET')return json({runs:store.listRuns(user.id)});
      if(path==='runs'&&method==='POST') {
        const data=await body(request);if(data.execution!==execution)throw fail('Execution target does not match this runtime');
        let provider;try{provider=validateProvider(data.provider,execution);}catch(error){throw fail(error.message);}
        const settings=config(data.config);let state;try{state=createExperiment(settings);}catch(error){throw fail(error.message);}
        const runs=store.listRuns(user.id);if(runs.length>=100||runs.reduce((sum,r)=>sum+JSON.stringify(r).length,0)>20_000_000)throw fail('Account storage cap reached; delete inactive runs',429);
        if(runs.filter(r=>r.status==='running').length>=2||active.size>=10)throw fail('Concurrent run limit reached',429);
        throttle('runs:'+user.id,10);
        const run={id:randomUUID(),ownerId:user.id,execution,status:'running',provider:{id:provider.id,model:provider.model},engineVersion:'1',limits:{maxSteps:settings.maxSteps,maxOutputTokens:8192,maxRequestOutputTokens:512,maxTimeMs:120000},config:settings,state,usage:{inputTokens:0,outputTokens:0,calls:0},createdAt:Date.now(),updatedAt:Date.now()};
        save(run);const controller=new AbortController();active.set(run.id,controller);void execute(run,provider,controller);return json({run},201);
      }
      const match=path.match(/^runs\/([A-Za-z0-9-]+)(\/stop)?$/);
      if(match){const run=store.getRun(match[1]);if(!run||run.ownerId!==user.id)throw fail('Run not found',404);
        if(match[2]&&method==='POST'){active.get(run.id)?.abort('stop');if(run.status==='running'){run.status='stopped';save(run);}return json({run});}
        if(!match[2]&&method==='GET')return json({run});
        if(!match[2]&&method==='DELETE'){if(run.status==='running'||active.has(run.id))throw fail('Stop the run before deleting it',409);store.deleteRun(run.id);return json({ok:true});}
      }
      throw fail('Endpoint not found',404);
    }catch(error){return json({error:error.status?error.message:'Runtime request failed'},error.status||500);}
  }
  return {handle,store,close(){if(closed)return;closed=true;for(const controller of active.values())controller.abort('shutdown');store.close();}};
}
let singleton;
export async function handleLabRequest(request){singleton??=createLabHandler();return singleton.handle(request);}
