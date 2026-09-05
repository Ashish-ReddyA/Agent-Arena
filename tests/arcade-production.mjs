import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
// Run after npm run build and npm start -- --port 3188.
// Standalone Node production has no D1 binding. The error state is tested explicitly.
const base=process.env.ARENA_UI_URL || 'http://localhost:3188';
const browser=await chromium.launch({headless:true});
try {
 for(const width of [1440,900,390]) {
  const page=await browser.newPage({viewport:{width,height:1000}}); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://127.0.0.1:43821/**',r=>r.fulfill({status:200,body:'{"docker":{"ready":false}}'}));
  const response=await page.goto(base,{waitUntil:'networkidle'}); assert.equal(response.status(),200);
  assert.equal(await page.locator('.arcade-card').count(),6);
  await page.getByRole('button',{name:'Explore Tiny Civilization',exact:true}).click();
  assert.equal(await page.locator('.arcade-preview h2').innerText(),'Tiny Civilization');
  if(width===390) assert.ok(await page.locator('.arcade-inspector').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=-1&&r.top<innerHeight}));
  await page.getByRole('button',{name:'Experiments',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(),/Saved storage is unavailable/);
  await page.getByRole('button',{name:'Open runtime setup',exact:true}).click();
  assert.equal(await page.locator('.experiment-mode-card').count(),4);
  assert.deepEqual(errors,[]);
  console.log(`Production ${width}: HTTP 200, catalog, selection, mobile feedback, D1 unavailable state and runtime navigation passed`);
  await page.close();
 }
} finally {await browser.close()}
