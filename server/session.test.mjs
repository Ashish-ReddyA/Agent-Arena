import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLabHandler} from './lab-handler.mjs';

test('anonymous sessions need no account and cannot read or stop another session run',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'arena-session-'));
  const app=createLabHandler({dataDir:dir});
  const call=(path,token,method='GET')=>app.handle(new Request('http://localhost/api/lab/'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(method==='POST'?{body:'{}'}:{})}));
  try{
    const response=await call('session',null,'POST');
    assert.equal(response.status,201);
    const a=await response.json(),b=await(await call('session',null,'POST')).json();
    assert.match(a.token,/^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a.token,b.token);
    app.store.saveRun({id:'private-run',ownerId:a.user.id,status:'running',createdAt:1});
    assert.equal((await call('runs/private-run',a.token)).status,200);
    assert.equal((await call('runs/private-run',b.token)).status,404);
    assert.equal((await call('runs/private-run/stop',b.token,'POST')).status,404);
    assert.equal((await call('runs/private-run')).status,401);
    assert.equal((await call('auth/register',null,'POST')).status,410);
    assert.equal((await call('auth/login',null,'POST')).status,410);
    app.store.db.prepare('UPDATE sessions SET expires=0 WHERE userId=?').run(a.user.id);
    assert.equal((await call('session',a.token)).status,401);
    await call('session',null,'POST');
    assert.equal(app.store.getRun('private-run'),null);
    assert.equal((await call('session',b.token)).status,200);
  }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
