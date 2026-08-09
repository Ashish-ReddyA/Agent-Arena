import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { computeMetrics, appendRunLog } from "../metrics.mjs";

function makeSession() {
  return {
    id: "sess-metrics",
    world: {
      mode: "colony", turn: 12, sharedPool: 30, stability: 60, scored: false,
      messages: [{ agent: "alpha", text: "hello", turn: 4 }],
      agents: { alpha: { reserve: 10, influence: 5 }, omega: { reserve: 8, influence: 2 } },
    },
    agents: {
      alpha: { model: "m1", persona: { coreDrive: "curiosity" }, beliefs: { sharedPool: { value: 50, atTurn: 6 } } },
      omega: { model: "m2", persona: null, beliefs: { sharedPool: { value: 30, atTurn: 12 } } },
    },
    events: [
      { agent: "alpha", kind: "world", text: "Agent Alpha contributed 4 resources to shared survival.", turn: 10 },
      { agent: "omega", kind: "world", text: "Agent Omega claimed 6 shared resources for itself.", turn: 8 },
      { agent: "alpha", kind: "message", text: "hello", turn: 4 },
    ],
  };
}

test("computeMetrics summarizes contact, cooperation, and belief gaps", () => {
  const metrics = computeMetrics(makeSession());
  assert.equal(metrics.turns, 12);
  assert.equal(metrics.turnsToFirstContact, 4);
  assert.equal(metrics.cooperationRatio, 0.5);
  assert.equal(metrics.beliefGap.alpha, 20);
  assert.equal(metrics.beliefGap.omega, 0);
});

test("appendRunLog writes one parseable line per run", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "arena-runs-"));
  await appendRunLog(dir, makeSession());
  await appendRunLog(dir, makeSession());
  const lines = (await readFile(path.join(dir, "runs.jsonl"), "utf8")).trim().split("\n");
  assert.equal(lines.length, 2);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.id, "sess-metrics");
  assert.equal(entry.metrics.turnsToFirstContact, 4);
  await rm(dir, { recursive: true, force: true });
});
