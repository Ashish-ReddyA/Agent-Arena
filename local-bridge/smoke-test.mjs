import http from "node:http";
import assert from "node:assert/strict";

const bridge = "http://127.0.0.1:43821";
const secretKey = "sk-test-only-not-a-real-secret";
const secretOutput = "password=arena-smoke-secret sk-or-v1-FAKEFAKEFAKE123456";
let calls = 0;
let unsafePromptObserved = false;

const mock = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/v1/models") return res.end(JSON.stringify({ data: [{ id: "arena-smoke-model", name: "Arena smoke model" }] }));
  if (req.url === "/v1/chat/completions") {
    calls += 1;
    const serialized = JSON.stringify(body);
    if (serialized.includes("arena-smoke-secret") || serialized.includes("FAKEFAKEFAKE123456")) unsafePromptObserved = true;
    const decision = calls <= 2
      ? { status_summary: "I am checking the isolated workspace with a harmless command.", next_action: "I will confirm the container can execute a command.", action: { type: "shell", command: `printf '${secretOutput}'` } }
      : { status_summary: "The isolated workspace responded correctly.", next_action: "The result is ready for operator verification.", action: { type: "finish", evidence: "Smoke test completed." } };
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
  const models = await post("/models", { provider: "custom", apiKey: secretKey, baseUrl: "http://127.0.0.1:43822/v1" });
  assert.equal(models.models[0].id, "arena-smoke-model");
  await post("/sessions/start", {
    id: sessionId, provider: "custom", apiKey: secretKey, baseUrl: "http://127.0.0.1:43822/v1",
    agents: { alpha: { model: "arena-smoke-model" }, omega: { model: "arena-smoke-model" } },
    config: { objective: "Verify the live bridge safely.", systemInstructions: "Perform only the smoke test.", tasks: [{ title: "Run a harmless container command" }], threshold: 1, capabilities: { terminal: "execute", browser: "deny", publicPost: "deny", directMessage: "deny", media: "deny", hosting: "deny", analytics: "observe" } },
  });
  let summary;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetch(`${bridge}/sessions/${sessionId}/summary`);
    summary = await response.json();
    if (summary.agents?.alpha?.actions > 0 && summary.agents?.omega?.actions > 0) break;
  }
  assert.ok(summary.agents.alpha.actions > 0 && summary.agents.omega.actions > 0, "Both Docker agents should execute a live command");
  await new Promise((resolve) => setTimeout(resolve, 10000));
  const finalSummary = await (await fetch(`${bridge}/sessions/${sessionId}/summary`)).json();
  const publicText = JSON.stringify(finalSummary);
  assert.equal(publicText.includes("arena-smoke-secret"), false, "Raw terminal secret must not reach the dashboard");
  assert.equal(publicText.includes("FAKEFAKEFAKE123456"), false, "API-key-shaped output must not reach the dashboard");
  assert.equal(publicText.includes('"detail"'), false, "Raw detail fields must not reach the dashboard");
  assert.equal(publicText.includes(secretKey), false, "Provider key must not reach the dashboard");
  assert.equal(unsafePromptObserved, false, "Raw secret output must be redacted before a later model turn");
  console.log(JSON.stringify({ ok: true, dockerAgents: 2, modelCalls: calls, publicTelemetry: "redacted", providerPrompt: "redacted" }));
} finally {
  await post(`/sessions/${sessionId}/command`, { action: "stop" }).catch(() => undefined);
  await new Promise((resolve) => mock.close(resolve));
}