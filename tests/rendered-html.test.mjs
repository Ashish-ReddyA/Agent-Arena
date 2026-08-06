import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

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
  assert.match(page, /OPERATOR REQUESTS/);
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
