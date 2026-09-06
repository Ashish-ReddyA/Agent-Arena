// Deterministic mocked-model integration evidence. These tests make no live model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CATALOG } from '../lab/engine.mjs';
import { createLabHandler } from './lab-handler.mjs';
import { modelAction } from './providers.mjs';

const grid=['#######','#.....#','#.....#','#.....#','#.....#','#.....#','#######'];
function fixtureTransport() {
  const visited=new Set(),stack=[];
  return async(provider,o)=>{
    assert.equal(provider.model,'fixture/model');
    assert.ok(o.allowedActionSchema);
    let action;
    if(o.arenaId==='game-forge')action={type:'submit',grid};
    if(o.arenaId==='repair-bay')action={type:'repair',x:3,y:3,tile:'.'};
    if(o.arenaId==='game-runner'){
      assert.equal(o.artifact,undefined,'mock model sees only explored cells');
      const key=o.position.join(',');visited.add(key);if(!stack.length)stack.push(o.position);
      const directions=[['east',1,0],['south',0,1],['west',-1,0],['north',0,-1]];
      let direction=directions.find(([,dx,dy])=>o.explored[[o.position[0]+dx,o.position[1]+dy].join(',')]==='.'&&!visited.has([o.position[0]+dx,o.position[1]+dy].join(',')));
      if(direction)stack.push([o.position[0]+direction[1],o.position[1]+direction[2]]);
      else{stack.pop();const previous=stack.at(-1);assert.ok(previous);direction=directions.find(([,dx,dy])=>o.position[0]+dx===previous[0]&&o.position[1]+dy===previous[1]);}
      action={type:'move',direction:direction[0]};
    }
    if(o.arenaId==='escape-room'){
      assert.equal(o.privateClues,undefined,'other agents private clues are absent');
      if(!o.sharedClues[o.agent])action={type:'share'};
      else action={type:'unlock',code:Object.values(o.sharedClues).sort((a,b)=>a.position-b.position).map(c=>c.digit).join('')};
    }
    if(o.arenaId==='tiny-civilization'){
      const [project,p]=Object.entries(o.projects).find(([,p])=>p.food<p.requiredFood||p.material<p.requiredMaterial);
      action={type:'allocate',project,food:p.requiredFood-p.food,material:p.requiredMaterial-p.material};
    }
    if(o.arenaId==='relay-studio')action=!o.proposal?{type:'propose',grid}:!o.reviewer?{type:'review'}:{type:'publish'};
    return {action,usage:{inputTokens:15,outputTokens:25}};
  };
}
for(const execution of ['hosted','local'])test(`${execution}: all six HTTP run lifecycles complete, remain private and survive reopening (mocked model)`,async()=>{
  const dir=mkdtempSync(join(tmpdir(),'arena-all-'+execution+'-'));
  let app=createLabHandler({dataDir:dir,execution,transport:fixtureTransport()});
  const request=(path,body,token)=>app.handle(new Request('http://localhost/api/lab/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}));
  try{
    const owner=await(await request('session',{})).json();
    const outsider=await(await request('session',{})).json();
    const ids=[];
    for(const arena of CATALOG){
      const response=await request('runs',{execution,config:{arenaId:arena.id,agentCount:2,seed:17,maxSteps:80},provider:{id:execution==='local'?'ollama':'openrouter',model:'fixture/model',apiKey:'TEST-SECRET-NOT-PERSISTED'}},owner.token);
      assert.equal(response.status,201,arena.id);
      const {run}=await response.json();ids.push(run.id);
      let completed;
      for(let i=0;i<100;i++){
        const detail=await request('runs/'+run.id,null,owner.token);assert.equal(detail.status,200);
        completed=(await detail.json()).run;if(completed.status!=='running')break;
        await new Promise(resolve=>setTimeout(resolve,5));
      }
      assert.equal(completed.status,'completed',arena.id+': '+completed.error);
      assert.equal(completed.state.status,'completed');
      assert.ok(completed.state.checks.length&&completed.state.checks.every(c=>c.passed),arena.id);
      assert.ok(completed.state.artifact);
      assert.ok(completed.usage.calls>0);
      assert.equal(completed.usage.inputTokens,completed.usage.calls*15);
      assert.equal(completed.usage.outputTokens,completed.usage.calls*25);
      assert.equal(completed.provider.model,'fixture/model');
      assert.equal(completed.engineVersion,'1');
      assert.ok(!JSON.stringify(completed).includes('TEST-SECRET-NOT-PERSISTED'));
      assert.equal((await request('runs/'+run.id,null,outsider.token)).status,404);
    }
    assert.deepEqual((await(await request('runs',null,outsider.token)).json()).runs,[]);
    app.close();app=createLabHandler({dataDir:dir,execution,transport:fixtureTransport()});
    const history=(await(await request('runs',null,owner.token)).json()).runs;
    assert.equal(history.length,6);
    for(const id of ids){const persisted=(await(await request('runs/'+id,null,owner.token)).json()).run;assert.equal(persisted.status,'completed');assert.equal(persisted.provider.model,'fixture/model');}
  }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});

test('provider adapter fixes endpoints, caps output, attaches BYOK, rejects redirects and validates responses (mocked fetch)',async()=>{
  const original=globalThis.fetch;
  const signal=new AbortController().signal;
  try{
    for(const [id,url] of [['openrouter','https://openrouter.ai/api/v1/chat/completions'],['nvidia','https://integrate.api.nvidia.com/v1/chat/completions'],['ollama','http://127.0.0.1:11434/v1/chat/completions']]){
      globalThis.fetch=async(actual,init)=>{
        assert.equal(actual,url);assert.equal(init.redirect,'error');assert.equal(init.signal,signal);
        assert.equal(init.headers.authorization,id==='ollama'?undefined:'Bearer TEST-KEY');
        const body=JSON.parse(init.body);assert.equal(body.model,'fixture/model');assert.equal(body.max_tokens,23);
        assert.deepEqual(JSON.parse(body.messages[1].content),{test:'observation'});
        return Response.json({choices:[{message:{content:'{"type":"share"}'}}],usage:{prompt_tokens:3,completion_tokens:4}});
      };
      assert.deepEqual(await modelAction({id,model:'fixture/model',apiKey:id==='ollama'?'':'TEST-KEY'},{test:'observation'},signal,23),{action:{type:'share'},usage:{inputTokens:3,outputTokens:4}});
    }
    globalThis.fetch=async()=>new Response('SECRET raw provider failure',{status:401});
    await assert.rejects(()=>modelAction({id:'openrouter',model:'fixture/model',apiKey:'TEST-KEY'},{},signal),/^Error: Provider request failed \(HTTP 401\)$/);
    globalThis.fetch=async()=>Response.json({choices:[{message:{content:'not JSON'}}]});
    await assert.rejects(()=>modelAction({id:'openrouter',model:'fixture/model',apiKey:'TEST-KEY'},{},signal),/invalid JSON action/);
    globalThis.fetch=async()=>new Response('x'.repeat(65537));
    await assert.rejects(()=>modelAction({id:'openrouter',model:'fixture/model',apiKey:'TEST-KEY'},{},signal),/response exceeded limit/);
  }finally{globalThis.fetch=original;}
});
