import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { initPlaces, moveAgent, sensePlace, listWorldMap, marketTick, startingPlace, HOME } from "../world-fs.mjs";

async function scratch() { return mkdtemp(path.join(tmpdir(), "arena-world-")); }

test("move updates presence and perception is limited to the current place", async () => {
  const dir = await scratch();
  await initPlaces(dir, "oneworld");
  await moveAgent(dir, "oneworld", "alpha", null, "commons", 1);
  await writeFile(path.join(dir, "places", "north-ridge", "cache.txt"), "hidden", "utf8");
  const commons = await sensePlace(dir, "commons", "alpha");
  assert.deepEqual(commons.present, ["alpha"]);
  assert.ok(!commons.files.some((f) => f.name === "cache.txt"));
  const moved = await moveAgent(dir, "oneworld", "alpha", "commons", "north-ridge", 2);
  assert.equal(moved, "north-ridge");
  const ridge = await sensePlace(dir, "north-ridge", "alpha");
  assert.ok(ridge.files.some((f) => f.name === "cache.txt" && f.preview === "hidden"));
  const oldPlace = await sensePlace(dir, "commons", "omega");
  assert.deepEqual(oldPlace.present, []);
  await rm(dir, { recursive: true, force: true });
});

test("entering the other agent's space in twopowers leaves a trace, silently", async () => {
  const dir = await scratch();
  await initPlaces(dir, "twopowers");
  assert.equal(startingPlace("twopowers", "alpha"), HOME.alpha);
  await moveAgent(dir, "twopowers", "omega", HOME.omega, HOME.alpha, 5);
  const space = await sensePlace(dir, HOME.alpha, "alpha");
  assert.ok(space.files.some((f) => f.name === ".trace.omega.5"));
  await rm(dir, { recursive: true, force: true });
});

test("agents can found new places; world map lists presence and thing counts", async () => {
  const dir = await scratch();
  await initPlaces(dir, "oneworld");
  await moveAgent(dir, "oneworld", "omega", null, "New Harbor!!", 1);
  await writeFile(path.join(dir, "places", "new-harbor", "boat.txt"), "a raft of three logs", "utf8");
  const map = await listWorldMap(dir);
  const harbor = map.find((p) => p.name === "new-harbor");
  assert.ok(harbor);
  assert.deepEqual(harbor.present, ["omega"]);
  assert.deepEqual(harbor.files, [{ name: "boat.txt", preview: "a raft of three logs" }]);
  assert.equal(harbor.things, 1);
  await rm(dir, { recursive: true, force: true });
});

test("marketTick shifts adoption toward whoever published more, deterministically, summing to 100", async () => {
  const dir = await scratch();
  await initPlaces(dir, "twopowers");
  await writeFile(path.join(dir, "places", "commons", "alpha.tool"), "x", "utf8");
  await writeFile(path.join(dir, "places", "commons", "alpha.doc"), "x", "utf8");
  const world = { adoption: { alpha: 50, omega: 50 } };
  await marketTick(dir, world);
  const once = { ...world.adoption };
  assert.ok(world.adoption.alpha > 50);
  assert.equal(world.adoption.alpha + world.adoption.omega, 100);
  const world2 = { adoption: { alpha: 50, omega: 50 } };
  await marketTick(dir, world2);
  assert.deepEqual(world2.adoption, once);
  await rm(dir, { recursive: true, force: true });
});
