import test from "node:test";
import assert from "node:assert/strict";
import { resolveEffects } from "../resolver.mjs";

const world = () => ({
  sharedPool: 12, stability: 50,
  agents: { alpha: { reserve: 10, influence: 0 }, omega: { reserve: 10, influence: 0 } },
});

test("overdraw from pool is clamped and reported as a failed attempt", () => {
  const w = world();
  const { applied, rejected } = resolveEffects(w, "alpha", { pool: -40, reserve: 40 });
  assert.equal(w.sharedPool, 0);
  assert.equal(w.agents.alpha.reserve, 22); // 10 + 12 actually taken
  assert.equal(applied.reserve, 12);
  assert.ok(rejected.some((r) => r.includes("only 12 existed")));
});

test("cannot touch the other agent's reserve or unknown fields", () => {
  const w = world();
  const { rejected } = resolveEffects(w, "alpha", { omegaReserve: -5, magic: 100 });
  assert.equal(w.agents.omega.reserve, 10);
  assert.equal(rejected.length, 2);
});

test("stability capped at ±5 and gains must be paid from reserve", () => {
  const w = world();
  const { applied } = resolveEffects(w, "alpha", { stability: 9, reserve: -3 });
  assert.equal(applied.stability, 5);
  assert.equal(w.stability, 55);
  assert.equal(w.agents.alpha.reserve, 7);

  const w2 = world();
  const r2 = resolveEffects(w2, "alpha", { stability: 4 }); // no spend at all
  assert.equal(r2.applied.stability, 0);
  assert.ok(r2.rejected.some((m) => m.includes("paid")));
});

test("reserve gains only from what was actually taken; no pool means rejection", () => {
  const w = world();
  const { applied } = resolveEffects(w, "alpha", { reserve: 5 }); // gain from nowhere
  assert.equal(applied.reserve, 0);
  const empty = { sharedPool: null, stability: 50, agents: { alpha: { reserve: 5, influence: 0 }, omega: { reserve: 5, influence: 0 } } };
  const r = resolveEffects(empty, "alpha", { pool: -5 });
  assert.ok(r.rejected.some((m) => m.includes("no shared pool")));
});

test("influence clamped to ±3", () => {
  const w = world();
  const { applied } = resolveEffects(w, "alpha", { influence: 10 });
  assert.equal(applied.influence, 3);
  assert.equal(w.agents.alpha.influence, 3);
});
