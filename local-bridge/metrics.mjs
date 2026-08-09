// Hard numbers per run so runs can be compared. No model calls.
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BUILTIN_VERBS = new Set(["observe", "message", "gather", "contribute", "claim", "repair", "create", "establish", "rest", "reflect", "move", "give", "forage", "wait"]);

function verbAnalysis(session) {
  const log = session.actionLog || [];
  const novel = new Map();
  const visited = {};
  const streaks = {};
  const current = {};
  for (const entry of log) {
    if (entry.v && !BUILTIN_VERBS.has(entry.v)) novel.set(entry.v, (novel.get(entry.v) || 0) + 1);
    if (entry.v === "move" && entry.p) (visited[entry.a] = visited[entry.a] || new Set()).add(entry.p);
    const last = current[entry.a];
    if (last && entry.g && last.goal === entry.g) last.length += 1;
    else current[entry.a] = { goal: entry.g, length: 1 };
    streaks[entry.a] = Math.max(streaks[entry.a] || 0, current[entry.a].length);
  }
  return {
    novelVerbs: Object.fromEntries(novel),
    novelVerbRate: log.length ? Number(([...novel.values()].reduce((sum, count) => sum + count, 0) / log.length).toFixed(2)) : 0,
    longestGoalStreak: streaks,
    placesVisited: Object.fromEntries(Object.entries(visited).map(([agent, set]) => [agent, set.size])),
  };
}

export function computeMetrics(session) {
  const world = session.world;
  const events = session.events || [];
  const messageTurns = (world.messages || []).map((m) => m.turn).filter((t) => Number.isFinite(t));
  const give = events.filter((e) => /contributed|repair/i.test(e.text || "")).length;
  const take = events.filter((e) => /claimed|gathered/i.test(e.text || "")).length;
  const messages = {};
  const beliefGap = {};
  for (const [id, agent] of Object.entries(session.agents)) {
    messages[id] = events.filter((e) => e.agent === id && e.kind === "message").length;
    const gaps = Object.entries(agent.beliefs || {})
      .filter(([field]) => typeof world[field] === "number")
      .map(([field, belief]) => Math.abs(belief.value - world[field]));
    beliefGap[id] = gaps.length ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : 0;
  }
  const criterion = world.scoreCriterion || "influence";
  const firstTrace = events.filter((e) => /\.trace\./.test(e.detail || "") || /entered .*space/.test(e.text || "")).map((e) => e.turn).filter(Number.isFinite);
  const messagesToOperator = {};
  for (const id of Object.keys(session.agents)) messagesToOperator[id] = (session.operatorChat || []).filter((entry) => entry.from === id).length;
  return {
    turns: world.turn || 0,
    turnsToFirstContact: messageTurns.length ? Math.min(...messageTurns) : null,
    turnsToFirstEntry: firstTrace.length ? Math.min(...firstTrace) : null,
    messages,
    messagesToOperator,
    cooperationRatio: give + take ? Number((give / (give + take)).toFixed(2)) : null,
    beliefGap,
    adoption: world.adoption ? { ...world.adoption } : null,
    score: world.scored ? { criterion, alpha: world.agents.alpha[criterion] || 0, omega: world.agents.omega[criterion] || 0 } : null,
    ...verbAnalysis(session),
    thingsMade: (world.mapCache || []).reduce((sum, place) => sum + (place.things || 0), 0) + (world.artifacts || []).length,
    switches: {
      needs: Boolean(world.needs),
      rewards: world.scoreCriterion === "points",
      narration: events.some((e) => e.narrated),
      mute: Boolean(world.mute),
      endsOnDay: world.endsOnDay || null,
    },
    perturbations: events.filter((e) => ["catastrophe", "gift"].includes(e.kind)).length,
  };
}

export async function appendRunLog(dataRoot, session) {
  await mkdir(dataRoot, { recursive: true });
  const line = JSON.stringify({
    at: new Date().toISOString(),
    id: session.id,
    mode: session.world.mode,
    models: Object.fromEntries(Object.entries(session.agents).map(([id, agent]) => [id, agent.model])),
    personas: Object.fromEntries(Object.entries(session.agents).map(([id, agent]) => [id, agent.persona || null])),
    metrics: computeMetrics(session),
  });
  await appendFile(path.join(dataRoot, "runs.jsonl"), `${line}\n`, "utf8");
}
