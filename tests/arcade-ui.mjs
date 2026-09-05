import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.ARENA_UI_URL || 'http://localhost:3187';
const output = process.env.ARENA_TEST_OUTPUT || '/tmp/arena-arcade-ui';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = []; const audits = [];
const names = ['Game Forge','Repair Bay','Game Runner','Escape Room','Tiny Civilization','Relay Studio'];
async function audit(page, name) {
  const data = await page.evaluate(() => {
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('dialog:not([open])');
    const small = [...document.querySelectorAll('button')].filter(visible).map(b => { const r=b.getBoundingClientRect(); return {text:b.getAttribute('aria-label') || b.textContent.trim().slice(0,35),w:r.width,h:r.height}; }).filter(r=>r.w<39.9 || r.h<39.9);
    const unlabeled = [...document.querySelectorAll('input,textarea,select')].filter(visible).filter(el=>!el.id&&!el.getAttribute('aria-label')&&!el.closest('label')).map(el=>el.outerHTML.slice(0,150));
    const clippedCards = [...document.querySelectorAll('.arcade-card')].filter(card => { const c=card.getBoundingClientRect(); const h=card.querySelector('h3').getBoundingClientRect(); const b=card.querySelector('.arcade-explore').getBoundingClientRect(); return h.bottom>c.bottom || b.bottom>c.bottom; }).map(card=>card.querySelector('h3').textContent);
    return { overflow: document.documentElement.scrollWidth-innerWidth, small, unlabeled, clippedCards };
  });
  audits.push({ name, ...data });
}
try {
 for (const [width,height] of [[1440,1000],[900,1000],[390,844]]) {
  const context=await browser.newContext({viewport:{width,height}});
  const page=await context.newPage(); const errors=[]; const failed=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400 && r.url().startsWith(base))failed.push(`${r.status()} ${r.url()}`)});
  // Only the unavailable local Docker bridge is mocked. The app and D1 API are real.
  await page.route('http://127.0.0.1:43821/**', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({docker:{ready:false}})}));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('.arcade-shell'));
  assert.equal(await page.locator('.arcade-card').count(),6);
  assert.equal(await page.locator('.arcade-group').count(),3);
  assert.deepEqual(await page.locator('.arcade-card h3').allTextContents(),names);
  assert.equal(await page.locator(".arcade-card img").evaluateAll(els=>els.every(el=>el.complete && el.naturalWidth>0)),true);
  await audit(page,`${width} catalog`);
  await page.screenshot({path:`${output}/catalog-${width}.png`,fullPage:true});
  for(const name of names) {
   await page.getByRole('button',{name:`Explore ${name}`,exact:true}).click();
   await page.waitForFunction(n=>document.querySelector('.arcade-preview h2')?.textContent===n,name);
  }
  await page.getByRole('button',{name:'View example protocol',exact:true}).click();
  await page.waitForSelector('dialog[open]'); assert.match(await page.locator('dialog').innerText(),/Relay Studio/);
  await page.keyboard.press('Escape'); await page.waitForSelector('dialog[open]',{state:'hidden'});
  assert.equal(await page.getByRole('button',{name:'View example protocol',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.getByRole('button',{name:/How it will work/}).click(); await page.waitForSelector('dialog[open]');
  assert.match(await page.locator('dialog').innerText(),/not implemented/); await audit(page,`${width} dialog`);
  await page.getByRole('button',{name:'Close protocol'}).click();
  await page.getByRole('button',{name:'Library',exact:true}).click(); assert.equal(await page.locator('.arcade-protocol-grid article').count(),6);
  await page.locator('.arcade-protocol-grid article').first().getByRole('button').click(); await page.waitForSelector('dialog[open]'); await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Experiments',exact:true}).click(); await page.waitForSelector('.arcade-page-panel');
  await page.getByRole('button',{name:'Compare',exact:true}).click(); assert.match(await page.locator('.arcade-page-panel').innerText(),/Compare saved snapshots/);
  await page.getByRole('button',{name:'Arenas',exact:true}).click();
  await page.getByRole('button',{name:'Explore Game Forge',exact:true}).click();
  await page.getByRole('button',{name:/Configure workspace/}).click();
  await page.waitForSelector('.runtime-preset-banner');
  assert.match(await page.locator('.runtime-preset-banner').innerText(),/Game Forge/);
  assert.match(await page.locator('.experiment-mode-card.active').innerText(),/BUILDER/);
  assert.equal(await page.locator('#agent-credentials select[aria-label$="provider"]').count(),1);
  await audit(page,`${width} setup`);
  await page.screenshot({path:`${output}/setup-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:/More agents/}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#agent-credentials select[aria-label$="provider"]').length===2);
  // Required-field validation and per-slot local provider configuration.
  const sessionName=page.locator('.setup-panel').filter({has:page.getByRole('heading',{name:'World brief'})}).locator('input').first();
  await sessionName.fill(''); await page.getByRole('button',{name:/SIMULATION/}).click();
  assert.equal(await page.locator('.launch-bar>button').isDisabled(),true); await sessionName.fill(`Arcade UI smoke ${width}`);
  await page.locator('.pressure .switch').click();
  await page.locator('.launch-bar>button').click(); await page.waitForSelector('.arena-page .world-board');
  assert.equal(await page.locator('.arena-grid>.agent').count(),2);
  await page.locator('.agent').first().getByRole('button',{name:'PAUSE',exact:true}).click();
  await page.locator('.agent').first().getByRole('button',{name:'RESUME',exact:true}).click();
  const beforeTime = await page.locator('.timer b').innerText();
  await page.getByRole('button',{name:/Arena catalog/,exact:false}).click();
  await page.waitForTimeout(2200);
  await page.getByRole('button',{name:'Return to run',exact:true}).click();
  assert.notEqual(await page.locator('.timer b').innerText(), beforeTime, 'Countdown must continue in catalog');
  await page.getByRole('button',{name:/EVIDENCE/}).click(); await audit(page,`${width} run evidence`);
  await page.screenshot({path:`${output}/run-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:/REQUESTS/}).click(); assert.match(await page.locator('.request-feed').innerText(),/No requests yet/);
  await page.getByRole('button',{name:'KILL SWITCH',exact:true}).first().click();
  await page.getByRole('button',{name:'KILL SWITCH',exact:true}).last().click();
  await page.getByRole('button',{name:/Arena catalog/,exact:false}).click();
  assert.equal(await page.locator('.arcade-card').count(),6);
  assert.deepEqual(errors,[]); assert.deepEqual(failed,[]);
  results.push({viewport:width,status:'passed',pageErrors:errors,failedResponses:failed});
  await context.close();
 }
 // Exercise comparison against actual local API records, clean up only these ids.
 const ctx=await browser.newContext(); const page=await ctx.newPage(); const ids=[`arcade-test-a-${Date.now()}`,`arcade-test-b-${Date.now()}`];
 try {
  for(let i=0;i<2;i++) {const res=await ctx.request.post(`${base}/api/experiments`,{data:{id:ids[i],name:`Comparison fixture ${i}`,objective:'UI test fixture',status:'stopped',payload:JSON.stringify({arenaId:'builder',agents:{'agent-1':{tokens:100+i,actions:2+i}}})}}); assert.equal(res.status(),201)}
  await page.route('http://127.0.0.1:43821/**',r=>r.fulfill({status:200,body:'{"docker":{"ready":false}}'}));
  await page.goto(base,{waitUntil:'networkidle'}); await page.getByRole('button',{name:'Compare',exact:true}).click();
  await page.getByLabel('First run').selectOption(ids[0]); await page.getByLabel('Second run').selectOption(ids[1]);
  assert.equal(await page.locator('.arcade-comparison article').count(),2);
  assert.match(await page.locator('.arcade-comparison').innerText(),/101/);
  results.push({comparison:'actual local API snapshots passed'});
 } finally {for(const id of ids)await ctx.request.delete(`${base}/api/experiments?id=${id}`); await ctx.close();}
} finally {await browser.close(); await writeFile(`${output}/results.json`,JSON.stringify({results,audits},null,2)); console.log(JSON.stringify({results,audits},null,2));}
assert.ok(results.length>=3);
assert.ok(audits.every(a=>a.overflow===0 && a.small.length===0 && a.unlabeled.length===0 && a.clippedCards.length===0),'DOM audit violations; see results.json');
