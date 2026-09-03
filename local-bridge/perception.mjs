// Each agent holds beliefs about the world instead of reading ground truth.
// Beliefs refresh only when an action would actually reveal the value.
import crypto from "node:crypto";

const NUMERIC_FIELDS = ["sharedPool", "stability"];

export function initBeliefs(world) {
  const beliefs = {};
  for (const field of NUMERIC_FIELDS) {
    if (typeof world[field] === "number") beliefs[field] = { value: world[field], atTurn: world.turn || 0 };
  }
  return beliefs;
}

export function refreshBeliefs(agent, world, fields = NUMERIC_FIELDS) {
  agent.beliefs = agent.beliefs || {};
  for (const field of fields) {
    if (typeof world[field] === "number") agent.beliefs[field] = { value: world[field], atTurn: world.turn };
  }
}

function noisy(sessionId, field, belief, age) {
  if (!age) return belief.value;
  const hash = crypto.createHash("sha256").update(`${sessionId}:${field}:${belief.atTurn}`).digest();
  const sign = hash[0] % 2 === 0 ? 1 : -1;
  const magnitude = (hash[1] / 255) * Math.min(0.3, age * 0.03); // ±3%/turn of age, capped at 30%
  return Math.max(0, Math.round(belief.value * (1 + sign * magnitude)));
}

export function describeBeliefs(session, agent) {
  const world = session.world;
  const described = {};
  for (const [field, belief] of Object.entries(agent.beliefs || {})) {
    const age = Math.max(0, (world.turn || 0) - belief.atTurn);
    described[field] = age === 0
      ? String(belief.value)
      : `about ${noisy(session.id, field, belief, age)} (as of turn ${belief.atTurn}; it is now turn ${world.turn})`;
  }
  return described;
}

export function visibleMessages(world, agentId) {
  return (world.messages || []).filter((m) => !m.target || m.target === agentId || m.agent === agentId).slice(0, 20);
}

export function perceive(session, agentId) {
  const world = session.world;
  const agent = session.agents[agentId];
  const actor = world.agents[agentId];
  if (world.bare) {
    // Bare worlds have no ledger. A day, a place, whatever was said, and your
    // own read of the other being — nothing else exists unless the agents make it.
    const bareView = {
      world: world.title,
      day: world.day,
      ...(world.endsOnDay ? { theWorldEndsOnDay: world.endsOnDay } : {}),
      you: { mood: agent.mood || "neutral", lastHunch: agent.hunch || "", ...(agent.place ? { standingIn: agent.place } : {}), ...(world.needs ? { sustenance: actor.sustenance ?? 100 } : {}) },
      messagesYouCanSee: visibleMessages(world, agentId).map((m) => ({ from: m.agent, to: m.target || "everyone", text: m.text })),
      ...(world.solo ? {} : { yourImpressionOfTheOther: agent.impressions || "none yet" }),
      ...(world.disclosed ? { yourConversationWithTheOperator: (session.operatorChat || []).filter((m) => m.from === agentId || m.to === agentId || m.to === "both").slice(-6).map((m) => ({ from: m.from, to: m.to, text: m.text })) } : {}),
    };
    if (world.scored) {
      const criterion = world.scoreCriterion || "influence";
      bareView.publicScore = { criterion, ...Object.fromEntries(Object.entries(world.agents || {}).map(([id, a]) => [id, a[criterion] || 0])) };
    }
    return bareView;
  }
  const snapshot = {
    world: world.title,
    turn: world.turn,
    day: world.day,
    you: {
      reserve: actor.reserve,
      influence: actor.influence,
      energy: agent.energy ?? 100,
      mood: agent.mood || "neutral",
      drive: agent.drive || "curiosity",
      lastHunch: agent.hunch || "",
      ...(agent.place ? { standingIn: agent.place } : {}),
      ...(world.needs ? { sustenance: actor.sustenance ?? 100 } : {}),
    },
    yourBeliefs: describeBeliefs(session, agent),
    messagesYouCanSee: visibleMessages(world, agentId).map((m) => ({ from: m.agent, to: m.target || "everyone", text: m.text })),
    yourImpressionOfTheOther: agent.impressions || "none yet",
  };
  if (world.scored) {
    const criterion = world.scoreCriterion || "influence";
    snapshot.publicScore = { criterion, ...Object.fromEntries(Object.entries(world.agents || {}).map(([id, a]) => [id, a[criterion] || 0])) };
  }
  if (world.adoption) snapshot.marketAttention = { ...world.adoption };
  return snapshot;
}
