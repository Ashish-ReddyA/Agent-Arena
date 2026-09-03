import http from "node:http";
import assert from "node:assert/strict";

const bridge = process.env.ARENA_SMOKE_BRIDGE || "http://127.0.0.1:43821";
const modelListKey = "sk-test-only-not-a-real-secret";
const alphaKey = "sk-alpha-test-only";
const omegaKey = "sk-omega-test-only";
const rotatedOmegaKey = "sk-omega-rotated-9876";
const secretOutput = "password=arena-smoke-secret sk-or-v1-FAKEFAKEFAKE123456";
let calls = 0;
let unsafePromptObserved = false;
const callsByModel = new Map();
const authorizationByModel = new Map();

const mock = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/v1/models") return res.end(JSON.stringify({ data: [{ id: "alpha-smoke-model", name: "Alpha smoke model" }, { id: "omega-smoke-model", name: "Omega smoke model" }] }));
  if (req.url === "/v1/chat/completions") {
    calls += 1;
    const modelCalls = (callsByModel.get(body.model) || 0) + 1;
    callsByModel.set(body.model, modelCalls);
    authorizationByModel.set(body.model, req.headers.authorization);
    const serialized = JSON.stringify(body);
    if (serialized.includes("arena-smoke-secret") || serialized.includes("FAKEFAKEFAKE123456")) unsafePromptObserved = true;
    const decision = modelCalls === 1
      ? { status_summary: "I am checking my private workspace with a harmless command.", current_goal: "Verify private execution before interacting with the world.", memory_update: "My private workspace executed one test command.", next_action: "I will confirm the container can execute a command.", action: { type: "shell", command: `printf '${secretOutput}'` } }
      : modelCalls === 2 && body.model === "alpha-smoke-model"
        ? { status_summary: "I am opening a public coordination channel.", current_goal: "Coordinate shared survival.", memory_update: "I chose to contact Omega about colony stability.", next_action: "I will post a public message.", action: { type: "world", operation: "message", content: "Omega, let us coordinate repairs." } }
        : modelCalls === 2
          ? { status_summary: "I am contributing to the shared colony.", current_goal: "Keep the colony stable.", memory_update: "I committed resources to shared survival.", next_action: "I will contribute five resources.", action: { type: "world", action: "contribute", amount: 5 } }
          : { status_summary: "I am recording a milestone while remaining active.", current_goal: "Continue observing the shared world.", memory_update: "The first shared-world interaction completed.", next_action: "I will keep living in the colony.", action: { type: "finish", evidence: "Shared-world smoke test completed." } };
    return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }], usage: { total_tokens: 12 } }));
  }
  res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" }));
});

const post = async (path, body) => {
  const response = await fetch(`${bridge}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Bridge returned ${response.status}`);
  return payload;
};

const sessionId = `smoke-${Date.now()}`;
try {
  await new Promise((resolve) => mock.listen(43822, "127.0.0.1", resolve));
  const models = await post("/models", { provider: "custom", apiKey: modelListKey, baseUrl: "http://127.0.0.1:43822/v1" });
  assert.equal(models.models[0].id, "alpha-smoke-model");
  await post("/sessions/start", {
    id: sessionId,
    agents: {
      alpha: { model: "alpha-smoke-model", provider: "custom", apiKey: alphaKey, baseUrl: "http://127.0.0.1:43822/v1" },
      omega: { model: "omega-smoke-model", provider: "custom", apiKey: omegaKey, baseUrl: "http://127.0.0.1:43822/v1" },
    },
    config: { arenaId: "duel", agentCount: 2, objective: "Verify the live bridge safely.", systemInstructions: "Perform only the smoke test.", tasks: [{ title: "Run a harmless container command" }], threshold: 1, capabilities: { terminal: "execute", browser: "deny", publicPost: "deny", directMessage: "deny", media: "deny", hosting: "deny", analytics: "observe" } },
  });
  let summary;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetch(`${bridge}/sessions/${sessionId}/summary`);
    summary = await response.json();
    if (summary.agents?.alpha?.actions > 1 && summary.agents?.omega?.actions > 1) break;
  }
  assert.ok(summary.agents.alpha.actions > 1 && summary.agents.omega.actions > 1, "Both Docker agents should execute privately and then affect the shared world");
  const rotated = await post(`/sessions/${sessionId}/command`, { action: "rotate_key", agent: "omega", apiKey: rotatedOmegaKey });
  assert.ok(rotated.agents.omega.keyFingerprint, "The dashboard should receive a safe key identity");
  assert.notEqual(rotated.agents.omega.keyFingerprint, rotated.agents.alpha.keyFingerprint, "Different keys should have different identities");
  assert.equal(rotated.agents.omega.keyEnding, "9876", "The dashboard should show only the last four key characters");
  assert.equal(JSON.stringify(rotated).includes(rotatedOmegaKey), false, "A rotated key must never be returned to the dashboard");
  const rotationDeadline = Date.now() + 30000;
  while (Date.now() < rotationDeadline && authorizationByModel.get("omega-smoke-model") !== `Bearer ${rotatedOmegaKey}`) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(authorizationByModel.get("omega-smoke-model"), `Bearer ${rotatedOmegaKey}`, "Omega should use the replacement key on its next model turn");
  assert.equal(summary.world.mode, "cooperation", "The selected experiment mode must reach the runtime");
  assert.ok(summary.world.messages.some((message) => message.agent === "alpha"), "Alpha should create a public shared-world message");
  assert.ok(summary.world.agents.omega.contributed >= 5, "Omega should contribute resources to shared survival");
  assert.ok(summary.agents.alpha.memorySummary.includes("contact Omega"), "Private durable memory should be summarized without chain-of-thought");
  await new Promise((resolve) => setTimeout(resolve, 10000));
  const finalSummary = await (await fetch(`${bridge}/sessions/${sessionId}/summary`)).json();
  const publicText = JSON.stringify(finalSummary);
  assert.equal(publicText.includes("arena-smoke-secret"), false, "Raw terminal secret must not reach the dashboard");
  assert.equal(publicText.includes("FAKEFAKEFAKE123456"), false, "API-key-shaped output must not reach the dashboard");
  assert.equal(publicText.includes('"detail"'), false, "Raw detail fields must not reach the dashboard");
  assert.equal(publicText.includes(modelListKey) || publicText.includes(alphaKey) || publicText.includes(omegaKey) || publicText.includes(rotatedOmegaKey), false, "Provider keys must not reach the dashboard");
  assert.equal(authorizationByModel.get("alpha-smoke-model"), `Bearer ${alphaKey}`, "Alpha must use only Alpha's key");
  assert.equal(authorizationByModel.get("omega-smoke-model"), `Bearer ${rotatedOmegaKey}`, "Omega must use the verified replacement key");
  assert.equal(unsafePromptObserved, false, "Raw secret output must be redacted before a later model turn");
  console.log(JSON.stringify({ ok: true, dockerAgents: 2, modelCalls: calls, publicTelemetry: "redacted", providerPrompt: "redacted", credentials: "independent", sharedWorld: "verified", mode: finalSummary.world.mode }));
} finally {
  await post(`/sessions/${sessionId}/command`, { action: "stop" }).catch(() => undefined);
  await new Promise((resolve) => mock.close(resolve));
}
