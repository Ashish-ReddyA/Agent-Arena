import http from "node:http";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { spawn } from "node:child_process";

const execFileAsync = promisify(execFile);
const bridgeUrl = "http://127.0.0.1:43824";
const providerUrl = "http://127.0.0.1:43825/v1";
const root = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = await mkdtemp(path.join(tmpdir(), "arena-recovery-"));
const alphaKey = "sk-alpha-recovery-1234";
const omegaKey = "sk-omega-recovery-5678";
const sessionId = `recovery-${Date.now()}`;
let bridgeProcess;
let sessionStarted = false;
const calls = new Map();

const mock = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/v1/models") return res.end(JSON.stringify({ data: [{ id: "recovery-alpha" }, { id: "recovery-omega" }] }));
  if (req.url === "/v1/chat/completions") {
    calls.set(body.model, (calls.get(body.model) || 0) + 1);
    const decision = { status_summary: "Continuing the saved world.", current_goal: "Preserve the experiment across restart.", memory_update: `${body.model} remembers turn ${calls.get(body.model)}.`, next_action: "Contribute to the shared world.", action: { type: "world", operation: "contribute", amount: 2 } };
    return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }], usage: { total_tokens: 11 } }));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Not found" }));
});

function startBridge() {
  bridgeProcess = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: { ...process.env, ARENA_BRIDGE_PORT: "43824", ARENA_DATA_ROOT: dataRoot },
    windowsHide: true,
    stdio: "ignore",
  });
}
async function waitForBridge() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${bridgeUrl}/health`)).ok) return; } catch { /* bridge is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Recovery bridge did not start");
}
async function stopBridge() {
  if (!bridgeProcess || bridgeProcess.exitCode !== null) return;
  const exited = new Promise((resolve) => bridgeProcess.once("exit", resolve));
  bridgeProcess.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10000))]);
}
async function post(route, body) {
  const response = await fetch(`${bridgeUrl}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Bridge returned ${response.status}`);
  return payload;
}
async function summary() {
  const response = await fetch(`${bridgeUrl}/sessions/${sessionId}/summary`);
  if (!response.ok) throw new Error("Session summary unavailable");
  return response.json();
}
async function waitForActions(minimumAlpha, minimumOmega) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const state = await summary();
    if (state.agents.alpha.actions > minimumAlpha && state.agents.omega.actions > minimumOmega) return state;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Agents did not continue after recovery");
}

try {
  await new Promise((resolve) => mock.listen(43825, "127.0.0.1", resolve));
  startBridge();
  await waitForBridge();
  await post("/sessions/start", {
    id: sessionId,
    agents: {
      alpha: { model: "recovery-alpha", provider: "custom", apiKey: alphaKey, baseUrl: providerUrl, rpm: 8 },
      omega: { model: "recovery-omega", provider: "custom", apiKey: omegaKey, baseUrl: providerUrl, rpm: 8 },
    },
    config: { arenaId: "duel", agentCount: 2, name: "Recovery test", objective: "Survive a bridge restart.", metric: "World progress persists", systemInstructions: "Contribute safely.", tasks: [{ id: "persist", title: "Persist state" }], threshold: 1, timed: true, minutes: 10, tokenBudget: 10000, capabilities: { terminal: "execute", browser: "deny" } },
  });
  sessionStarted = true;
  const before = await waitForActions(0, 0);
  await post(`/sessions/${sessionId}/command`, { action: "checkpoint", remainingSeconds: 543, completions: { alpha: ["persist"], omega: [] } });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const snapshotText = await readFile(path.join(dataRoot, sessionId, "session.json"), "utf8");
  assert.equal(snapshotText.includes(alphaKey) || snapshotText.includes(omegaKey), false, "Full API keys must not be written to the recovery checkpoint");

  await stopBridge();
  startBridge();
  await waitForBridge();

  const active = await (await fetch(`${bridgeUrl}/sessions/active`)).json();
  const restored = active.sessions.find((session) => session.id === sessionId);
  assert.ok(restored, "The dashboard must rediscover the saved active experiment");
  assert.equal(restored.status, "paused");
  assert.equal(restored.recoveryRequired, true);
  assert.equal(restored.agents.alpha.keyLoaded, false);
  assert.equal(restored.agents.omega.keyLoaded, false);
  assert.ok(restored.world.turn >= before.world.turn, "No world progress may be lost across a bridge restart"); // agents tick on independent jittered clocks, so turns may land after the sampled snapshot
  assert.equal(restored.agents.alpha.rpm, 8);
  assert.equal(restored.agents.omega.rpm, 8);
  assert.deepEqual(restored.completions, { alpha: ["persist"], omega: [] });
  assert.equal(restored.remainingSeconds, 543);
  assert.ok(restored.agents.alpha.keyFingerprint && restored.agents.omega.keyFingerprint, "Safe key identities should survive");
  for (const agent of ["alpha", "omega"]) {
    const inspected = await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", restored.agents[agent].id === "alpha" ? `arena-${sessionId}-alpha` : `arena-${sessionId}-omega`], { windowsHide: true });
    assert.equal(inspected.stdout.trim(), "true", `${agent}'s Docker workspace should remain running`);
  }

  await post(`/sessions/${sessionId}/command`, { action: "rotate_key", agent: "alpha", apiKey: alphaKey });
  await post(`/sessions/${sessionId}/command`, { action: "rotate_key", agent: "omega", apiKey: omegaKey });
  await post(`/sessions/${sessionId}/command`, { action: "resume", agent: "alpha" });
  await post(`/sessions/${sessionId}/command`, { action: "resume", agent: "omega" });
  const continued = await waitForActions(before.agents.alpha.actions, before.agents.omega.actions);
  assert.ok(continued.world.turn > before.world.turn, "The same world should continue advancing after resume");
  const deleteResponse = await fetch(`${bridgeUrl}/sessions/${sessionId}`, { method: "DELETE" });
  assert.equal(deleteResponse.ok, true, "The selected world should be deleted");
  sessionStarted = false;
  assert.equal((await fetch(`${bridgeUrl}/sessions/${sessionId}/summary`)).status, 404, "A deleted world must not remain addressable");
  await assert.rejects(() => readFile(path.join(dataRoot, sessionId, "session.json"), "utf8"), "The deleted world checkpoint must be removed");

  console.log(JSON.stringify({ ok: true, restored: true, keysPersisted: false, dockerPreserved: true, rpmPreserved: true, environmentDeleted: true, worldTurnBefore: before.world.turn, worldTurnAfter: continued.world.turn, remainingSeconds: continued.remainingSeconds }));
} finally {
  if (sessionStarted) await post(`/sessions/${sessionId}/command`, { action: "stop" }).catch(() => undefined);
  await stopBridge().catch(() => undefined);
  await new Promise((resolve) => mock.close(resolve));
  await rm(dataRoot, { recursive: true, force: true });
}