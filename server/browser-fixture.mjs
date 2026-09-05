// Explicit manual browser TEST fixture. Never launched by production or local scripts.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalServer } from './local-server.mjs';
startLocalServer({dataDir:mkdtempSync(join(tmpdir(),'arena-browser-fixture-')),transport:async()=>{
  await new Promise(resolve=>setTimeout(resolve,400));
  return {action:{type:'submit',grid:['#######','#.....#','#.....#','#.....#','#.....#','#.....#','#######']},usage:{inputTokens:10,outputTokens:20}};
}});
console.log('TEST FIXTURE ONLY: deterministic Game Forge JSON action, no live provider requests.');
