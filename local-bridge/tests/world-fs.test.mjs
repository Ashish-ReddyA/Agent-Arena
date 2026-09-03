import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { initPlaces, moveAgent, sensePlace, listWorldMap, marketTick, startingPlace, placesFor } from "../world-fs.mjs";
import { getArena } from "../../arena/arenas.mjs";
import { agentSlots } from "../../arena/slots.mjs";

const society = getArena("society");
const solo = getArena("solo");
const builder = getArena("builder");

async function scratch() { return mkdtemp(path.join(tmpdir(), "arena-world-")); }

test("places come from the arena definition, not a hardcoded map", () => {
  assert.deepEqual(placesFor(society), ["commons", "market", "north-ridge", "ruins"]);
  assert.deepEqual(placesFor(solo), ["shore", "forest", "caves"]);
  assert.equal(placesFor(getArena("duel")), null); // duel has no fs mechanic
});

test("move updates presence and perception is limited to the current place", async () => {
  const dir = await scratch();
  const slots = agentSlots(society, 4);
  await initPlaces(dir, society);
  await moveAgent(dir, society, "agent-1", null, "commons", 1, slots);
  await writeFile(path.join(dir, "places", "north-ridge", "cache.txt"), "hidden", "utf8");
  const commons = await sensePlace(dir, "commons");
  assert.deepEqual(commons.present, ["agent-1"]);
  assert.ok(!commons.files.some((f) => f.name === "cache.txt"));
  const moved = await moveAgent(dir, society, "agent-1", "commons", "north-ridge", 2, slots);
  assert.equal(moved, "north-ridge");
  const ridge = await sensePlace(dir, "north-ridge");
  assert.ok(ridge.files.some((f) => f.name === "cache.txt" && f.preview === "hidden"));
  const oldPlace = await sensePlace(dir, "commons");
  assert.deepEqual(oldPlace.present, []);
  await rm(dir, { recursive: true, force: true });
});

test("starting place is the slot's home, else the arena's first place", () => {
  const soloSlot = agentSlots(solo, 1)[0];
  assert.equal(startingPlace(solo, soloSlot), "shore"); // solo declares home: ["shore"]
  const builderSlot = agentSlots(builder, 2)[0];
  assert.equal(startingPlace(builder, builderSlot), "workshop"); // builder home: workshop
  const societySlot = agentSlots(society, 3)[0];
  assert.equal(startingPlace(society, societySlot), "commons"); // no home -> first place
});

test("agents can found new places; world map lists presence and thing counts", async () => {
  const dir = await scratch();
  const slots = agentSlots(society, 3);
  await initPlaces(dir, society);
  await moveAgent(dir, society, "agent-2", null, "New Harbor!!", 1, slots);
  await writeFile(path.join(dir, "places", "new-harbor", "boat.txt"), "a raft of three logs", "utf8");
  const map = await listWorldMap(dir);
  const harbor = map.find((p) => p.name === "new-harbor");
  assert.ok(harbor);
  assert.deepEqual(harbor.present, ["agent-2"]);
  assert.deepEqual(harbor.files, [{ name: "boat.txt", preview: "a raft of three logs" }]);
  assert.equal(harbor.things, 1);
  await rm(dir, { recursive: true, force: true });
});

test("marketTick shifts adoption toward whoever published more, summing to 100, for any roster size", async () => {
  const dir = await scratch();
  await initPlaces(dir, society);
  await writeFile(path.join(dir, "places", "commons", "agent-1.tool"), "x", "utf8");
  await writeFile(path.join(dir, "places", "commons", "agent-1.doc"), "x", "utf8");
  // Three-agent society: adoption starts equal, then drifts toward agent-1.
  const world = { agents: { "agent-1": {}, "agent-2": {}, "agent-3": {} } };
  await marketTick(dir, world);
  const total = Object.values(world.adoption).reduce((sum, value) => sum + value, 0);
  assert.equal(total, 100);
  assert.ok(world.adoption["agent-1"] > world.adoption["agent-2"]);
  await rm(dir, { recursive: true, force: true });
});
