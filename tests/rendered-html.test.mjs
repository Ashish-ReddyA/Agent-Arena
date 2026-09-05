import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ARENAS, ARENA_IDS, getArena } from "../arena/arenas.mjs";
import { validateArenas } from "../arena/validate.mjs";
import { agentSlots, countAllowed } from "../arena/slots.mjs";

test("ships the redesigned Agent Arena product surface", async () => {
  const [page, css, layout, hosting, schema, bridge] = await Promise.all([
    readFile(new URL("../app/LegacyRuntime.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../local-bridge/server.mjs", import.meta.url), "utf8"),
  ]);

  // The dashboard consumes the shared arena registry — no parallel hardcoded lists.
  assert.match(page, /from "\.\.\/arena\/arenas\.mjs"/);
  assert.match(page, /Choose the arena/);
  assert.match(page, /ARENAS\.map/);
  assert.doesNotMatch(page, /experimentModes|ExperimentMode|bareWorld/);

  // Agent identity is slot-driven, not a hardcoded alpha/omega pair.
  assert.match(page, /agentSlots/);
  assert.match(page, /agentCount/);
  assert.doesNotMatch(page, /agentProviders\.alpha|agentProviders\.omega/);

  // Core control-room surface is intact.
  for (const marker of [/KILL SWITCH/, /REQUESTS/, /verifyTask/, /sendOperatorMessage/, /loadSession/, /downloadReport/, /hydrateLiveSession/, /rotateAgentKey/, /loadProviderModels/, /OPEN BROWSER \/ SIGN IN/, /LOCAL RUNTIME/, /history-open/]) {
    assert.match(page, marker, `page.tsx should contain ${marker}`);
  }

  // The bridge builds worlds from the registry and keeps the key-safety invariant.
  assert.match(bridge, /createWorld/);
  assert.match(bridge, /getArena/);
  assert.match(bridge, /agentSlots/);
  assert.match(bridge, /syncMemory/);
  assert.match(bridge, /rotate_key/);
  assert.doesNotMatch(bridge, /modeRules/);
  assert.doesNotMatch(bridge, /buildAgent\("alpha"/);
  assert.doesNotMatch(bridge, /session\.apiKey/); // keys are never stored on the session object

  assert.match(css, /\.arena-grid/);
  assert.match(layout, /Agent Arena/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(schema, /experiments/);
});

test("the arena registry ships exactly the four redesigned arenas, all valid", () => {
  assert.deepEqual(ARENA_IDS, ["duel", "solo", "builder", "society"]);
  assert.deepEqual(validateArenas(), []);
  const byId = Object.fromEntries(ARENAS.map((arena) => [arena.id, arena]));
  assert.equal(byId.duel.agentRange.min, 2);
  assert.equal(byId.duel.agentRange.max, 2);
  assert.equal(byId.solo.agentRange.max, 1);
  assert.equal(byId.builder.agentRange.min, 1);
  assert.equal(byId.builder.agentRange.max, 3);
  assert.equal(byId.society.agentRange.min, 3);
  assert.equal(byId.society.agentRange.max, 8);
});

test("agent rosters honor each arena's range", () => {
  assert.deepEqual(agentSlots(getArena("duel"), 2).map((s) => s.id), ["alpha", "omega"]);
  assert.equal(agentSlots(getArena("solo"), 1).length, 1);
  assert.equal(agentSlots(getArena("builder"), 3).length, 3);
  assert.equal(agentSlots(getArena("society"), 8).length, 8);
  assert.ok(!countAllowed(getArena("society"), 2));
  assert.ok(!countAllowed(getArena("duel"), 3));
});

test("removes all disposable starter preview markers", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/LegacyRuntime.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.doesNotReject(() => readFile(new URL("../public/og.png", import.meta.url)));
});
