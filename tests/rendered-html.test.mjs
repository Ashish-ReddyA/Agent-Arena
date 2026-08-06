import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";


test("ships the Agent Arena product surface", async () => {
  const [page, css, layout, hosting, schema] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Stage the arena/);
  assert.match(page, /START EXPERIMENT/);
  assert.match(page, /KILL SWITCH/);
  assert.match(page, /REQUESTS/);
  assert.match(page, /SURVIVAL THRESHOLD/);
  assert.match(page, /verifyTask/);
  assert.match(page, /Countdown expired/);
  assert.match(page, /SYSTEM INSTRUCTIONS/);
  assert.match(page, /OBSERVE/);
  assert.match(page, /EXECUTE/);
  assert.match(page, /APPROVE/);
  assert.match(page, /DENY/);
  assert.match(page, /sendOperatorMessage/);
  assert.match(page, /loadSession/);
  assert.match(page, /downloadReport/);
  assert.match(page, /LOCAL RUNTIME/);
  assert.match(page, /loadProviderModels/);
  assert.match(page, /OPEN BROWSER \/ SIGN IN/);
  assert.match(page, /\/summary/);
  assert.match(page, /history-open/);
  assert.match(css, /\.arena-grid/);
  assert.match(layout, /Agent Arena/);
  assert.match(layout, /og\.png/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(schema, /experiments/);
});

test("removes all disposable starter preview markers", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.doesNotReject(() => readFile(new URL("../public/og.png", import.meta.url)));
});
