import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createLabHandler } from './lab-handler.mjs';
import { pathToFileURL } from 'node:url';
export function startLocalServer(options={}) {
const origins=new Set((process.env.ARENA_ALLOWED_ORIGINS||'http://localhost:3000,http://127.0.0.1:3000,https://agent-arena-mmx8.onrender.com').split(',').map(v=>v.trim()).filter(Boolean));
for(const origin of origins){const url=new URL(origin);if(url.origin!==origin||!['http:','https:'].includes(url.protocol)||origin.includes('*'))throw new Error('ARENA_ALLOWED_ORIGINS must contain exact HTTP(S) origins');}
const app=createLabHandler({...options,execution:'local'});
const server=createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(req.headers.host!=='127.0.0.1:43822'&&req.headers.host!=='localhost:43822'){res.writeHead(403);res.end();return;}
  if(origin&&!origins.has(origin)){res.writeHead(403);res.end();return;}
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600'});res.end();return;}
  try {
    const request=new Request('http://127.0.0.1:43822'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
    const response=await app.handle(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  }catch{res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:'Invalid request'}));}
});
server.requestTimeout=15000;server.headersTimeout=10000;server.maxConnections=100;
server.listen(43822,'127.0.0.1',()=>console.log('Research Arcade local runtime: http://127.0.0.1:43822 (anonymous browser sessions)'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{app.close();server.close();});
return {server,app};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)startLocalServer();
