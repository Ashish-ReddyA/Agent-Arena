// Agent slots: the roster for a run is a generated list, not a hardcoded pair.
// Two-agent arenas keep the familiar alpha/omega ids for continuity; every other
// roster is agent-1..N. Ids are stable within a run and unique across the roster.

// Clamp a requested count into the arena's allowed range.
/** @type {import("./index.d.ts").clampCount} */
export function clampCount(arena, count) {
  const { min, max, default: def } = arena.agentRange;
  const parsed = Number(count);
  if (!Number.isFinite(parsed)) return def;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

// Can this arena accept exactly `count` agents?
/** @type {import("./index.d.ts").countAllowed} */
export function countAllowed(arena, count) {
  return Number.isInteger(count) && count >= arena.agentRange.min && count <= arena.agentRange.max;
}

function slotId(arena, index, count) {
  if (count === 2 && arena.agentRange.min === 2 && arena.agentRange.max === 2) {
    return index === 0 ? "alpha" : "omega";
  }
  return `agent-${index + 1}`;
}

function slotLabel(id, index) {
  if (id === "alpha") return "Agent Alpha";
  if (id === "omega") return "Agent Omega";
  return `Agent ${index + 1}`;
}

// Derive the roster for a run: [{ id, label, index, home }].
/** @type {import("./index.d.ts").agentSlots} */
export function agentSlots(arena, count) {
  const n = clampCount(arena, count);
  const slots = [];
  for (let index = 0; index < n; index += 1) {
    const id = slotId(arena, index, n);
    slots.push({
      id,
      label: slotLabel(id, index),
      index,
      home: Array.isArray(arena.home) ? arena.home[index] ?? null : null,
    });
  }
  return slots;
}

// The other slot ids in a roster (replaces the binary otherOf()).
/** @type {import("./index.d.ts").otherSlots} */
export function otherSlots(slots, id) {
  return slots.filter((slot) => slot.id !== id).map((slot) => slot.id);
}
