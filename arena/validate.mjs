// Validation for the arena registry. The bridge runs this at boot and the test
// suite runs it against the shipped arenas, so a malformed entry fails loudly
// instead of corrupting a run.
import { ARENAS, MECHANIC_FLAGS } from "./arenas.mjs";

const SAFE_PLACE = /^[a-z0-9_-]{1,40}$/;
const flagSet = new Set(MECHANIC_FLAGS);

function fail(errors, message) {
  errors.push(message);
}

export function validateArena(arena, seenIds = new Set()) {
  const errors = [];
  if (!arena || typeof arena !== "object") return ["arena is not an object"];
  const where = arena.id ? `arena "${arena.id}"` : "arena (no id)";

  if (!arena.id || typeof arena.id !== "string") fail(errors, `${where}: missing id`);
  else if (seenIds.has(arena.id)) fail(errors, `${where}: duplicate id`);
  if (seenIds && arena.id) seenIds.add(arena.id);

  for (const field of ["number", "name", "tagline", "researchQuestion", "framing", "objective", "instructions", "metric", "relationship"]) {
    if (typeof arena[field] !== "string" || !arena[field].trim()) fail(errors, `${where}: missing or empty "${field}"`);
  }

  const range = arena.agentRange;
  if (!range || typeof range !== "object") {
    fail(errors, `${where}: missing agentRange`);
  } else {
    const { min, max } = range;
    const def = range.default;
    if (!Number.isInteger(min) || min < 1) fail(errors, `${where}: agentRange.min must be an integer >= 1`);
    if (!Number.isInteger(max) || max < 1) fail(errors, `${where}: agentRange.max must be an integer >= 1`);
    if (Number.isInteger(min) && Number.isInteger(max) && min > max) fail(errors, `${where}: agentRange.min (${min}) > max (${max})`);
    if (!Number.isInteger(def) || def < min || def > max) fail(errors, `${where}: agentRange.default (${def}) must be within [min, max]`);
    if (max > 8) fail(errors, `${where}: agentRange.max (${max}) exceeds the supported ceiling of 8`);
  }

  const mechanics = arena.mechanics || {};
  for (const key of Object.keys(mechanics)) {
    if (!flagSet.has(key)) fail(errors, `${where}: unknown mechanic flag "${key}"`);
    else if (typeof mechanics[key] !== "boolean") fail(errors, `${where}: mechanic "${key}" must be boolean`);
  }

  // Cross-field coherence.
  if (mechanics.solo && range && range.max !== 1) fail(errors, `${where}: solo mechanic requires agentRange.max === 1`);
  if (mechanics.fs) {
    if (!Array.isArray(arena.places) || arena.places.length === 0) fail(errors, `${where}: fs mechanic requires a non-empty places list`);
  }
  if (Array.isArray(arena.places)) {
    for (const place of arena.places) {
      if (typeof place !== "string" || !SAFE_PLACE.test(place)) fail(errors, `${where}: unsafe place name "${place}"`);
    }
  }
  if (arena.home != null) {
    if (!Array.isArray(arena.home)) fail(errors, `${where}: home must be an array or null`);
    else {
      for (const place of arena.home) {
        if (typeof place !== "string" || !SAFE_PLACE.test(place)) fail(errors, `${where}: unsafe home place "${place}"`);
      }
      if (range && Number.isInteger(range.max) && arena.home.length > range.max) {
        fail(errors, `${where}: home has ${arena.home.length} entries but agentRange.max is ${range.max}`);
      }
    }
  }

  if (!Array.isArray(arena.tasks)) fail(errors, `${where}: tasks must be an array (use [] for open-ended)`);
  else {
    for (const task of arena.tasks) {
      if (!task || typeof task.id !== "string" || typeof task.title !== "string") fail(errors, `${where}: every task needs id and title`);
    }
  }

  if (!arena.simulation || typeof arena.simulation !== "object" || typeof arena.simulation.beats !== "object") {
    fail(errors, `${where}: simulation.beats is required for the no-model rehearsal mode`);
  } else {
    const generic = arena.simulation.beats.generic;
    if (!Array.isArray(generic) || generic.length === 0 || generic.some((b) => typeof b !== "string" || !b.trim())) {
      fail(errors, `${where}: simulation.beats.generic must be a non-empty array of strings`);
    }
  }

  return errors;
}

export function validateArenas(arenas = ARENAS) {
  const seen = new Set();
  const errors = [];
  for (const arena of arenas) errors.push(...validateArena(arena, seen));
  return errors;
}

export function assertValidArenas(arenas = ARENAS) {
  const errors = validateArenas(arenas);
  if (errors.length) throw new Error(`Invalid arena registry:\n - ${errors.join("\n - ")}`);
  return arenas;
}
