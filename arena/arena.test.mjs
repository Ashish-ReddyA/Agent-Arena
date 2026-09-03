import assert from "node:assert/strict";
import test from "node:test";
import { ARENAS, ARENA_IDS, getArena, MECHANIC_FLAGS } from "./arenas.mjs";
import { validateArenas, validateArena } from "./validate.mjs";
import { agentSlots, clampCount, countAllowed, otherSlots } from "./slots.mjs";
import { isSolo, hasGoalCheck, usesInstitutions, isScored, useFilesystem } from "./mechanics.mjs";

test("the shipped arena registry is valid", () => {
  assert.deepEqual(validateArenas(), []);
  assert.deepEqual(ARENA_IDS, ["duel", "solo", "builder", "society"]);
});

test("validator rejects malformed arenas", () => {
  const base = structuredClone(ARENAS[0]);
  assert.ok(validateArena({ ...base, id: ARENAS[1].id }, new Set([ARENAS[1].id])).some((e) => e.includes("duplicate id")));
  assert.ok(validateArena({ ...base, id: "x", name: "" }).some((e) => e.includes('"name"')));
  assert.ok(validateArena({ ...base, id: "x", agentRange: { min: 3, max: 2, default: 2 } }).some((e) => e.includes("min")));
  assert.ok(validateArena({ ...base, id: "x", agentRange: { min: 1, max: 2, default: 5 } }).some((e) => e.includes("default")));
  assert.ok(validateArena({ ...base, id: "x", mechanics: { bogus: true } }).some((e) => e.includes("unknown mechanic")));
  assert.ok(validateArena({ ...base, id: "x", mechanics: { fs: true }, places: [] }).some((e) => e.includes("places")));
  assert.ok(validateArena({ ...base, id: "x", places: ["Bad Place!"] }).some((e) => e.includes("unsafe place")));
  assert.ok(validateArena({ ...base, id: "x", agentRange: { min: 1, max: 9, default: 1 } }).some((e) => e.includes("ceiling")));
});

test("agent slots derive a roster per arena range", () => {
  const duel = getArena("duel");
  const solo = getArena("solo");
  const builder = getArena("builder");
  const society = getArena("society");

  assert.deepEqual(agentSlots(duel, 2).map((s) => s.id), ["alpha", "omega"]);
  assert.deepEqual(agentSlots(solo, 1).map((s) => s.id), ["agent-1"]);
  assert.equal(agentSlots(builder, 2).length, 2);
  assert.deepEqual(agentSlots(society, 4).map((s) => s.id), ["agent-1", "agent-2", "agent-3", "agent-4"]);

  // Count clamps into range.
  assert.equal(clampCount(society, 99), 8);
  assert.equal(clampCount(society, 1), 3);
  assert.equal(clampCount(builder, 0), 1);
  assert.ok(countAllowed(society, 5));
  assert.ok(!countAllowed(society, 2));
  assert.ok(!countAllowed(duel, 3));

  // Labels and uniqueness.
  const labels = agentSlots(society, 6).map((s) => s.label);
  assert.deepEqual(labels, ["Agent 1", "Agent 2", "Agent 3", "Agent 4", "Agent 5", "Agent 6"]);
  assert.equal(new Set(agentSlots(society, 8).map((s) => s.id)).size, 8);

  // otherSlots replaces the binary otherOf.
  assert.deepEqual(otherSlots(agentSlots(society, 4), "agent-2"), ["agent-1", "agent-3", "agent-4"]);
});

test("mechanic helpers read explicit flags", () => {
  assert.ok(isSolo(getArena("solo")));
  assert.ok(!isSolo(getArena("duel")));
  assert.ok(hasGoalCheck(getArena("builder")));
  assert.ok(usesInstitutions(getArena("society")));
  assert.ok(isScored(getArena("duel")));
  assert.ok(useFilesystem(getArena("society")));
  assert.ok(!useFilesystem(getArena("duel")));
});

test("mechanic flag list stays in sync with shipped arenas", () => {
  for (const arena of ARENAS) {
    for (const key of Object.keys(arena.mechanics)) assert.ok(MECHANIC_FLAGS.includes(key), `${arena.id} uses unknown flag ${key}`);
  }
});
