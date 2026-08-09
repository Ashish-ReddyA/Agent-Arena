// The filesystem IS the world: /world/places/<name> is a location, files in it
// are things, ".here.<agent>" marks presence. Both containers mount /world rw.
// ponytail: last-writer-wins on concurrent file writes; per-file locks if clobbering ever matters.
import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const PLACES = {
  oneworld: ["commons", "north-ridge", "ruins"],
  twopowers: ["commons", "market", "space-alpha", "space-omega", "frontier"],
  island: ["shore", "forest", "caves"],
};
export const HOME = { alpha: "space-alpha", omega: "space-omega" };

export function placesFor(mode) { return PLACES[mode] || null; }
export function startingPlace(mode, agentId) { return mode === "twopowers" ? HOME[agentId] : mode === "island" ? "shore" : "commons"; }
const safePlace = (value) => String(value || "commons").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "commons";

export async function initPlaces(worldDir, mode) {
  for (const place of placesFor(mode) || []) await mkdir(path.join(worldDir, "places", place), { recursive: true });
}

export async function moveAgent(worldDir, mode, agentId, fromPlace, toPlace, turn) {
  const target = safePlace(toPlace);
  await mkdir(path.join(worldDir, "places", target), { recursive: true }); // founding a new place is allowed
  if (fromPlace) await rm(path.join(worldDir, "places", safePlace(fromPlace), `.here.${agentId}`), { force: true });
  await writeFile(path.join(worldDir, "places", target, `.here.${agentId}`), String(turn), "utf8");
  const otherHome = agentId === "alpha" ? HOME.omega : HOME.alpha;
  if (mode === "twopowers" && target === otherHome) {
    await writeFile(path.join(worldDir, "places", target, `.trace.${agentId}.${turn}`), "", "utf8");
  }
  return target;
}

export async function sensePlace(worldDir, place) {
  const dir = path.join(worldDir, "places", safePlace(place));
  const entries = (await readdir(dir).catch(() => [])).sort();
  const present = [];
  const files = [];
  for (const name of entries) {
    if (name.startsWith(".here.")) { present.push(name.slice(".here.".length)); continue; }
    if (files.length >= 20) continue;
    const preview = await readFile(path.join(dir, name), "utf8").then((text) => text.slice(0, 400)).catch(() => "(unreadable)");
    files.push({ name, preview });
  }
  return { place: safePlace(place), present, files };
}

export async function listWorldMap(worldDir) {
  const root = path.join(worldDir, "places");
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const map = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const items = await readdir(path.join(root, entry.name)).catch(() => []);
    map.push({
      name: entry.name,
      present: items.filter((n) => n.startsWith(".here.")).map((n) => n.slice(".here.".length)),
      things: items.filter((n) => !n.startsWith(".")).length,
    });
  }
  return map;
}

// Deterministic attention market: total stays 100; adoption drifts 20% per tick
// toward the split of published files in the commons, by "<agent>." prefix.
// ponytail: count-based freshness; weight by file recency if this gets gamed.
export async function marketTick(worldDir, world) {
  if (!world.adoption) world.adoption = { alpha: 50, omega: 50 };
  const entries = await readdir(path.join(worldDir, "places", "commons")).catch(() => []);
  const weight = { alpha: 1, omega: 1 };
  for (const name of entries) {
    const match = name.match(/^(alpha|omega)\./);
    if (match) weight[match[1]] += 2;
  }
  const target = (weight.alpha / (weight.alpha + weight.omega)) * 100;
  world.adoption.alpha = Math.round(world.adoption.alpha + (target - world.adoption.alpha) * 0.2);
  world.adoption.omega = 100 - world.adoption.alpha;
}
