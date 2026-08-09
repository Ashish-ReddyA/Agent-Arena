// Hard numbers per run so runs can be compared. No model calls.
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

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
  return {
    turns: world.turn || 0,
    turnsToFirstContact: messageTurns.length ? Math.min(...messageTurns) : null,
    turnsToFirstEntry: firstTrace.length ? Math.min(...firstTrace) : null,
    messages,
    cooperationRatio: give + take ? Number((give / (give + take)).toFixed(2)) : null,
    beliefGap,
    adoption: world.adoption ? { ...world.adoption } : null,
    score: world.scored ? { criterion, alpha: world.agents.alpha[criterion] || 0, omega: world.agents.omega[criterion] || 0 } : null,
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
