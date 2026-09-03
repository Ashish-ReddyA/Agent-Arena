// The filesystem IS the world: /world/places/<name> is a location, files in it
// are things, ".here.<agent>" marks presence. Both containers mount /world rw.
// ponytail: last-writer-wins on concurrent file writes; per-file locks if clobbering ever matters.
//
// Places and home areas come from the arena definition (arena/arenas.mjs), not a
// hardcoded per-mode map. Agent ids are slot ids (alpha/omega for a two-agent
// arena, agent-1..N otherwise), so nothing here assumes exactly two agents.
import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

// The arena's declared fs map. `arena` is the validated arena definition.
export function placesFor(arena) {
  return Array.isArray(arena?.places) ? arena.places : null;
}

// Where a slot starts: its declared home area, else the first shared place.
export function startingPlace(arena, slot) {
  if (slot?.home) return slot.home;
  const places = placesFor(arena);
  return places && places.length ? places[0] : null;
}

const safePlace = (value) => String(value || "commons").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "commons";

export async function initPlaces(worldDir, arena) {
  for (const place of placesFor(arena) || []) await mkdir(path.join(worldDir, "places", place), { recursive: true });
}

// The set of places that are another slot's private home area (for presence-trace
// mechanics). Returns [] when the arena has no private areas.
function otherHomes(agentId, slots) {
  return (slots || []).filter((slot) => slot.id !== agentId && slot.home).map((slot) => slot.home);
}

export async function moveAgent(worldDir, arena, agentId, fromPlace, toPlace, turn, slots = []) {
  const target = safePlace(toPlace);
  await mkdir(path.join(worldDir, "places", target), { recursive: true }); // founding a new place is allowed
  if (fromPlace) await rm(path.join(worldDir, "places", safePlace(fromPlace), `.here.${agentId}`), { force: true });
  await writeFile(path.join(worldDir, "places", target, `.here.${agentId}`), String(turn), "utf8");
  if (otherHomes(agentId, slots).includes(target)) {
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
    const visible = items.filter((n) => !n.startsWith("."));
    const files = [];
    for (const name of visible.slice(0, 8)) {
      const preview = await readFile(path.join(root, entry.name, name), "utf8").then((text) => text.slice(0, 240)).catch(() => "(unreadable)");
      files.push({ name, preview });
    }
    map.push({
      name: entry.name,
      present: items.filter((n) => n.startsWith(".here.")).map((n) => n.slice(".here.".length)),
      things: visible.length,
      files,
    });
  }
  return map;
}

// Perturbations are real: a catastrophe deletes actual files, a gift writes one.
export async function destroyPlaceContents(worldDir, place) {
  const dir = path.join(worldDir, "places", safePlace(place));
  const entries = await readdir(dir).catch(() => []);
  let destroyed = 0;
  for (const name of entries) {
    if (name.startsWith(".")) continue; // presence and traces survive the storm
    await rm(path.join(dir, name), { force: true }).catch(() => undefined);
    destroyed += 1;
  }
  return destroyed;
}

export async function placeGift(worldDir, place, name, content) {
  const safeName = String(name || "gift").replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 60) || "gift";
  const dir = path.join(worldDir, "places", safePlace(place));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, safeName), String(content || ""), "utf8");
  return safeName;
}

// Deterministic attention market: total stays 100; adoption drifts 20% per tick
// toward the split of published files in the commons, by "<agent>." prefix.
// Works for any roster size — adoption is keyed by slot id.
export async function marketTick(worldDir, world) {
  const ids = Object.keys(world.agents || {});
  if (!ids.length) return;
  if (!world.adoption) world.adoption = Object.fromEntries(ids.map((agentId) => [agentId, Math.round(100 / ids.length)]));
  for (const agentId of ids) if (typeof world.adoption[agentId] !== "number") world.adoption[agentId] = 0;
  const entries = await readdir(path.join(worldDir, "places", "commons")).catch(() => []);
  const weight = Object.fromEntries(ids.map((agentId) => [agentId, 1]));
  for (const name of entries) {
    const match = name.match(/^([a-z0-9-]+)\./);
    if (match && match[1] in weight) weight[match[1]] += 2;
  }
  const total = ids.reduce((sum, agentId) => sum + weight[agentId], 0);
  let assigned = 0;
  ids.forEach((agentId, index) => {
    if (index === ids.length - 1) { world.adoption[agentId] = 100 - assigned; return; }
    const target = (weight[agentId] / total) * 100;
    const next = Math.round(world.adoption[agentId] + (target - world.adoption[agentId]) * 0.2);
    world.adoption[agentId] = next;
    assigned += next;
  });
}
