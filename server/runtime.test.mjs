import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLabHandler } from './lab-handler.mjs';
import { validateProvider } from './providers.mjs';
import { Store } from './store.mjs';

test('private runtime authenticates, isolates owners, limits inputs and interrupts restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'arena-test-'));
  const app = createLabHandler({dataDir: dir, execution: 'hosted', transport: async () => ({action: {type:'wait'}, usage:{}})});
  const request = (path, body, token, method = body ? 'POST' : 'GET') => app.handle(new Request('http://localhost/api/lab/' + path, {method, headers:{'content-type':'application/json', ...(token ? {authorization:'Bearer '+token} : {})}, ...(body ? {body:JSON.stringify(body)} : {})}));
  try {
    assert.equal((await request('runs')).status,401);
    assert.equal((await request('auth/register',{username:'alice',password:'short'})).status,400);
    const a = await (await request('auth/register',{username:'alice',password:'secure-password-a'})).json();
    const b = await (await request('auth/register',{username:'bob',password:'secure-password-b'})).json();
    assert.ok(a.token);
    assert.ok(!JSON.stringify(app.store.db.prepare('SELECT * FROM sessions').all()).includes(a.token));
    assert.ok(!JSON.stringify(app.store.db.prepare('SELECT * FROM users').all()).includes('secure-password-a'));
    assert.equal((await request('auth/login',{username:'alice',password:'wrong-password'})).status,401);
    assert.equal((await request('runs',{config:{arenaId:'game-runner',agentCount:1,seed:1,maxSteps:999999},provider:{id:'openrouter',model:'test',apiKey:'SECRET'},execution:'hosted'},a.token)).status,400);
    assert.equal((await request('runs',{config:{},provider:{id:'ollama',model:'test'},execution:'hosted'},a.token)).status,400);
    app.store.saveRun({id:'owned',ownerId:a.user.id,status:'running',config:{},state:{},usage:{},execution:'hosted',createdAt:1,updatedAt:1});
    assert.equal((await request('runs/owned',null,b.token)).status,404);
    assert.equal((await request('runs/owned',null,a.token)).status,200);
    assert.equal((await request('runs/owned',null,a.token,'DELETE')).status,409);
    await request('auth/logout',{},a.token);
    assert.equal((await request('auth/me',null,a.token)).status,401);
    app.store.db.prepare('UPDATE sessions SET expires=0').run();
    assert.equal((await request('auth/me',null,b.token)).status,401);
    app.close();
    const restarted = createLabHandler({dataDir:dir});
    assert.equal(restarted.store.getRun('owned').status,'interrupted');
    restarted.close();
  } finally { app.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('test-only deterministic transport persists genuine engine outcome without API key; stop aborts', async () => {
  const dir=mkdtempSync(join(tmpdir(),'arena-lifecycle-'));
  let pending=false,aborted=false;
  const app=createLabHandler({dataDir:dir,execution:'hosted',transport:async(provider,observation,signal)=>{
    assert.equal(provider.apiKey,'SECRET-TEST-KEY');
    assert.ok(observation);
    if(pending)return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));},{once:true}));
    return {action:{type:'submit',grid:['#######','#.....#','#.....#','#.....#','#.....#','#.....#','#######']},usage:{inputTokens:12,outputTokens:30}};
  }});
  const req=async(path,body,token)=>app.handle(new Request('http://localhost/api/lab/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}));
  try {
    const {token}=await (await req('auth/register',{username:'tester',password:'test-password-long'})).json();
    const input={execution:'hosted',config:{arenaId:'game-forge',agentCount:2,seed:17,maxSteps:4},provider:{id:'openrouter',model:'test/fixture',apiKey:'SECRET-TEST-KEY'}};
    const first=await(await req('runs',input,token)).json();
    await new Promise(resolve=>setTimeout(resolve,10));
    const result=await(await req('runs/'+first.run.id,null,token)).json();
    assert.equal(result.run.status,'completed');
    assert.equal(result.run.usage.calls,1);
    assert.deepEqual(result.run.provider,{id:'openrouter',model:'test/fixture'});
    assert.equal(result.run.engineVersion,'1');
    assert.deepEqual(result.run.limits,{maxSteps:4,maxOutputTokens:8192,maxRequestOutputTokens:512,maxTimeMs:120000});
    assert.ok(result.run.state.checks.every(c=>c.passed));
    assert.ok(!JSON.stringify(app.store.listRuns(first.run.ownerId)).includes('SECRET-TEST-KEY'));
    pending=true;
    const second=await(await req('runs',input,token)).json();
    const third=await(await req('runs',input,token)).json();
    assert.equal((await req('runs',input,token)).status,429);
    assert.equal((await req('runs/'+second.run.id+'/stop',{},token)).status,200);
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(aborted,true);
    assert.equal(app.store.getRun(second.run.id).status,'stopped');
    await req('runs/'+third.run.id+'/stop',{},token);
  }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});

test('provider URLs cannot be supplied by callers and hosted Ollama is forbidden',()=>{
  assert.throws(()=>validateProvider({id:'ollama',model:'local'},'hosted'));
  assert.throws(()=>validateProvider({id:'https://evil.example',model:'x',apiKey:'secret-long'},'hosted'));
  assert.deepEqual(validateProvider({id:'ollama',model:'llama3',url:'https://evil.example'},'local'),{id:'ollama',model:'llama3',apiKey:''});
});

test('runtime defaults use distinct execution namespaces and explicit storage cannot open twice',()=>{
  const previous=process.cwd(),dir=mkdtempSync(join(tmpdir(),'arena-namespaces-'));
  process.chdir(dir);
  const local=createLabHandler({execution:'local'});
  const hosted=createLabHandler({execution:'hosted'});
  try {
    assert.notEqual(local.store.dir,hosted.store.dir);
    assert.ok(local.store.dir.endsWith(join('.arena-data','local')));
    assert.ok(hosted.store.dir.endsWith(join('.arena-data','hosted')));
    assert.throws(()=>new Store(local.store.dir),/already in use/);
    assert.throws(()=>createLabHandler({execution:'hosted',dataDir:local.store.dir}),/already in use/);
  }finally{local.close();hosted.close();process.chdir(previous);rmSync(dir,{recursive:true,force:true});}
});

test('failure evidence keeps safe status categories and discards arbitrary provider secrets',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'arena-errors-'));
  let message='Provider request failed (HTTP 401)';
  const app=createLabHandler({dataDir:dir,transport:async()=>{throw new Error(message);}});
  const call=(path,body,token)=>app.handle(new Request('http://localhost/api/lab/'+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
  try{
    const {token}=await(await call('auth/register',{username:'errors',password:'long-test-password'})).json();
    const input={execution:'hosted',config:{arenaId:'game-forge',agentCount:2,seed:17,maxSteps:4,objective:'x'.repeat(2000)},provider:{id:'openrouter',model:'test/fixture',apiKey:'SECRET-TEST-KEY'}};
    const first=await(await call('runs',input,token)).json();
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.match(app.store.getRun(first.run.id).error,/HTTP 401/);
    message='SECRET-TEST-KEY provider body contains credentials';
    const second=await(await call('runs',input,token)).json();
    await new Promise(resolve=>setTimeout(resolve,10));
    const failed=app.store.getRun(second.run.id);
    assert.equal(failed.status,'failed');
    assert.ok(!JSON.stringify(failed).includes('SECRET-TEST-KEY'));
  }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
