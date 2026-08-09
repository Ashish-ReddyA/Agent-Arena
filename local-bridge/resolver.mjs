// Clamps agent-proposed effects against world invariants. Agents can attempt
// anything; they do not get to declare the outcome.
const KNOWN = new Set(["pool", "reserve", "stability", "influence"]);
const num = (value) => { const parsed = Number(value); return Number.isFinite(parsed) ? Math.round(parsed) : 0; };
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function resolveEffects(world, agentId, effects = {}) {
  const actor = world.agents[agentId];
  const rejected = [];
  for (const key of Object.keys(effects)) {
    if (!KNOWN.has(key)) rejected.push(`"${key}" is not something you can directly control`);
  }
  const hasPool = typeof world.sharedPool === "number";
  const wantTake = Math.max(0, -num(effects.pool));
  const wantPoolGain = Math.max(0, num(effects.pool));
  const wantSpend = Math.max(0, -num(effects.reserve));
  const wantReserveGain = Math.max(0, num(effects.reserve));

  const take = hasPool ? Math.min(wantTake, world.sharedPool) : 0;
  if (wantTake > take) rejected.push(hasPool ? `you tried to take ${wantTake} from the shared pool; only ${world.sharedPool} existed` : "there is no shared pool in this world");
  const spend = Math.min(wantSpend, actor.reserve);
  if (wantSpend > spend) rejected.push(`you tried to spend ${wantSpend}; you only had ${actor.reserve}`);
  const reserveGain = Math.min(wantReserveGain, take);
  if (wantReserveGain > reserveGain) rejected.push("you can only gain reserve you actually took from the pool");
  const poolGain = hasPool ? Math.min(wantPoolGain, spend) : 0;
  if (wantPoolGain > poolGain) rejected.push(hasPool ? "pool gains must be paid from your own reserve" : "there is no shared pool in this world");

  let stability = clamp(num(effects.stability), -5, 5);
  if (num(effects.stability) !== stability) rejected.push("stability can move at most 5 per turn");
  if (stability > 0) {
    const paid = Math.min(stability, spend * 2); // ponytail: repair pays 2:1 like the legacy verb; tune later if abused
    if (paid < stability) rejected.push("raising stability must be paid for from your reserve");
    stability = paid;
  }
  const influence = clamp(num(effects.influence), -3, 3);
  if (num(effects.influence) !== influence) rejected.push("influence can move at most 3 per turn");

  if (hasPool) world.sharedPool = world.sharedPool - take + poolGain;
  actor.reserve = actor.reserve - spend + reserveGain;
  actor.influence += influence;
  world.stability = clamp(world.stability + stability, 0, 100);
  return { applied: { pool: -take + poolGain, reserve: -spend + reserveGain, stability, influence }, rejected };
}
