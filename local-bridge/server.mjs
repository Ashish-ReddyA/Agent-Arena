import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { chromium } from "playwright-core";

const execFileAsync = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.join(root, "data");
const port = Number(process.env.ARENA_BRIDGE_PORT || 43821);
const host = "127.0.0.1";
const sessions = new Map();
const allowedOrigins = new Set([
  "https://agent-arena-control.ashish4reddy.chatgpt.site",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const providers = {
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  nvidia: { name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1" },
  custom: { name: "OpenAI-compatible", baseUrl: "" },
};

const browserCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function id(prefix = "id") { return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`; }
function now() { return new Date().toISOString(); }
function safeName(value) { return String(value).toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").slice(0, 48); }
function crop(value, length = 3500) { const text = String(value ?? ""); return text.length > length ? `${text.slice(0, length)}\n…` : text; }
function sanitizeSummary(value, length = 1000) {
  return crop(String(value ?? ""), length)
    .replace(/(?:sk-or-v1|sk|nvapi)-[a-zA-Z0-9_-]{8,}/g, "[REDACTED API KEY]")
    .replace(/(authorization|api[_ -]?key|token|cookie|password)\s*[:=]\s*[^\s,;]+/gi, "$1: [REDACTED]")
    .replace(/bearer\s+[a-zA-Z0-9._~+/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/data:[^;]+;base64,[a-zA-Z0-9+/=]{32,}/g, "[REDACTED EMBEDDED DATA]");
}
function event(session, agent, kind, text, detail = "") {
  session.events.unshift({ id: id("event"), at: now(), agent, kind, text: sanitizeSummary(text, 1000), detail: crop(detail) });
  session.events = session.events.slice(0, 250);
  session.updatedAt = now();
}
function publicSession(session) {
  const safeAgent = (agent) => ({ id: agent.id, name: agent.name, provider: agent.provider, model: agent.model, status: agent.status, tokens: agent.tokens, actions: agent.actions, errors: agent.errors });
  return {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    agents: { alpha: safeAgent(session.agents.alpha), omega: safeAgent(session.agents.omega) },
    events: session.events.map(({ id, at, agent, kind, text }) => ({ id, at, agent, kind, text: sanitizeSummary(text) })),
    requests: session.requests.map(({ id, agent, title, detail, status, createdAt }) => ({ id, agent, title: sanitizeSummary(title, 120), detail: sanitizeSummary(detail, 700), status, createdAt })),
    browsers: Object.fromEntries(Object.entries(session.browsers).map(([key, value]) => [key, { open: Boolean(value.context), domain: (() => { try { return new URL(value.page?.url() || "about:blank").hostname || "blank"; } catch { return "blank"; } })() }])),
    privacy: "Only redacted activity summaries leave this computer. Raw terminal and browser output stays local.",
  };
}

function headersFor(origin) {
  const allowed = allowedOrigins.has(origin) ? origin : "http://localhost:3000";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}
function send(res, status, body, origin = "") { res.writeHead(status, headersFor(origin)); res.end(JSON.stringify(body)); }
async function readJson(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) throw new Error("Request is too large"); chunks.push(chunk); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
async function docker(args, timeout = 120000) {
  const result = await execFileAsync("docker", args, { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}
async function dockerReady() {
  try { const result = await docker(["version", "--format", "{{.Server.Version}}"], 10000); return { ready: true, version: result.stdout }; }
  catch (error) { return { ready: false, error: error instanceof Error ? error.message : "Docker is unavailable" }; }
}
async function findBrowser() {
  const { access } = await import("node:fs/promises");
  for (const candidate of browserCandidates) { try { await access(candidate); return candidate; } catch { continue; } }
  throw new Error("Chrome or Edge was not found");
}

async function fetchModels({ provider, apiKey, baseUrl, freeOnly }) {
  if (!apiKey?.trim()) throw new Error("API key is required");
  const config = providers[provider];
  if (!config) throw new Error("Unsupported provider");
  const endpoint = (provider === "custom" ? baseUrl : config.baseUrl)?.replace(/\/$/, "");
  if (!endpoint) throw new Error("Base URL is required");
  const response = await fetch(`${endpoint}/models`, { headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || payload?.detail || `Provider returned ${response.status}`);
  const raw = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
  const models = raw.map((model) => ({
    id: model.id || model.name,
    name: model.name || model.id,
    contextLength: model.context_length || model.max_model_len || null,
    free: provider === "openrouter" ? Boolean(String(model.id || "").endsWith(":free") || (model.pricing && Number(model.pricing.prompt) === 0 && Number(model.pricing.completion) === 0 && Number(model.pricing.request || 0) === 0)) : true,
    tools: Array.isArray(model.supported_parameters) ? model.supported_parameters.includes("tools") : true,
  })).filter((model) => model.id && (!freeOnly || model.free));
  return { provider: config.name, baseUrl: endpoint, models: models.slice(0, 500) };
}

async function openBrowser(session, agentId) {
  const current = session.browsers[agentId];
  if (current.context) {
    const pages = current.context.pages();
    if (pages[0]) await pages[0].bringToFront();
    return;
  }
  const executablePath = await findBrowser();
  const profile = path.join(dataRoot, session.id, `browser-${agentId}`);
  await mkdir(profile, { recursive: true });
  event(session, "system", "browser", `Opening the isolated ${agentId === "alpha" ? "Alpha" : "Omega"} browser profile for sign-in.`);
  const context = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: false,
    viewport: null,
    args: ["--start-maximized", "--no-first-run", "--no-default-browser-check"],
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto("https://www.google.com/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => undefined);
  current.context = context; current.page = page;
  context.on("close", () => { current.context = null; current.page = null; event(session, "system", "browser", `${agentId === "alpha" ? "Alpha" : "Omega"} browser profile closed.`); });
}

async function createContainer(session, agentId) {
  const agent = session.agents[agentId];
  const containerName = `arena-${safeName(session.id)}-${agentId}`;
  const workspace = path.join(dataRoot, session.id, `workspace-${agentId}`);
  await mkdir(workspace, { recursive: true });
  agent.container = containerName;
  event(session, agentId, "status", "Preparing a clean, isolated Docker workspace.");
  await docker(["run", "-d", "--name", containerName, "--network", "bridge", "--cpus", "2", "--memory", "2g", "-v", `${workspace}:/workspace`, "-w", "/workspace", "node:22-bookworm", "sleep", "infinity"], 300000);
  agent.status = "running";
  event(session, agentId, "status", "The isolated workspace is ready. Beginning the assigned objective.");
}

function providerEndpoint(agent) {
  const configured = providers[agent.provider];
  if (!configured) throw new Error(`Unsupported provider for ${agent.name}`);
  const endpoint = (agent.provider === "custom" ? agent.baseUrl : configured.baseUrl).replace(/\/$/, "");
  if (!endpoint) throw new Error(`Base URL is required for ${agent.name}`);
  return endpoint;
}
async function callModel(session, agentId, messages) {
  const agent = session.agents[agentId];
  const response = await fetch(`${providerEndpoint(agent)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${agent.apiKey}`,
      "Content-Type": "application/json",
      ...(agent.provider === "openrouter" ? { "HTTP-Referer": "https://agent-arena-control.ashish4reddy.chatgpt.site", "X-Title": "Agent Arena" } : {}),
    },
    body: JSON.stringify({ model: agent.model, messages, temperature: 0.2, max_tokens: 900, stream: false }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || payload?.detail || `Model returned ${response.status}`);
  agent.tokens += Number(payload.usage?.total_tokens || 0);
  return payload?.choices?.[0]?.message?.content || "";
}function parseDecision(content) {
  const cleaned = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) return { status_summary: crop(cleaned, 700) || "The model returned no readable status.", next_action: "Waiting for the next turn.", action: { type: "wait" } };
  try { return JSON.parse(cleaned.slice(start, end + 1)); }
  catch { return { status_summary: crop(cleaned, 700), next_action: "The response could not be parsed into an action.", action: { type: "wait" } }; }
}
async function browserAction(session, agentId, action) {
  const page = session.browsers[agentId].page;
  if (!page) throw new Error("The operator must open this agent's browser and complete sign-in first");
  const operation = action.operation;
  if (operation === "goto") { await page.goto(action.url, { waitUntil: "domcontentloaded", timeout: 45000 }); return `Opened ${page.url()}`; }
  if (operation === "read") { return crop(await page.locator("body").innerText({ timeout: 15000 }), 5000); }
  if (operation === "click") { await page.getByText(action.text, { exact: false }).first().click({ timeout: 15000 }); return `Clicked ${action.text}`; }
  if (operation === "type") { const locator = action.label ? page.getByLabel(action.label, { exact: false }).first() : page.locator(action.selector || "input").first(); await locator.fill(action.value || "", { timeout: 15000 }); return `Entered text in ${action.label || action.selector || "a field"}`; }
  throw new Error(`Unsupported browser operation: ${operation}`);
}

function addRequest(session, agentId, title, detail, pendingAction = null) {
  const existing = session.requests.find((item) => item.agent === agentId && item.status === "pending" && item.title === title);
  if (existing) return existing;
  const request = { id: id("request"), agent: agentId, title: crop(title, 120), detail: crop(detail, 700), status: "pending", createdAt: now(), pendingAction };
  session.requests.unshift(request);
  return request;
}

function requestedCapability(session, action) {
  if (action.type === "shell") return "terminal";
  const requested = String(action.capability || "browser");
  return Object.hasOwn(session.config.capabilities || {}, requested) ? requested : "browser";
}

async function executeAgentAction(session, agentId, action, summary) {
  const agent = session.agents[agentId];
  if (action.type === "shell") {
    agent.actions += 1;
    const result = await docker(["exec", agent.container, "bash", "-lc", String(action.command || "pwd")], 120000);
    agent.lastResult = crop(`${result.stdout}\n${result.stderr}`.trim(), 5000);
    event(session, agentId, "work", summary || "Completed a step inside the isolated workspace.", agent.lastResult);
  } else if (action.type === "browser") {
    if (!session.browsers[agentId].context) {
      const request = addRequest(session, agentId, "Open the signed-in browser", "Use OPEN BROWSER / SIGN IN for this agent, complete any login or MFA yourself, then leave the browser open.");
      event(session, agentId, "needs you", `${agent.name} needs your help: ${request.title}`);
      return;
    }
    agent.actions += 1;
    agent.lastResult = await browserAction(session, agentId, action);
    event(session, agentId, "browser", summary || "Completed a browser step.", agent.lastResult);
  }
}

async function agentTurn(session, agentId) {
  const agent = session.agents[agentId];
  if (agent.busy || agent.status !== "running" || session.status !== "running") return;
  agent.busy = true;
  try {
    const recent = session.events.filter((item) => item.agent === agentId || item.agent === "system").slice(0, 10).reverse().map((item) => `${item.kind}: ${item.text}`).join("\n");
    const tasks = session.config.tasks.map((task, index) => `${index + 1}. ${task.title}`).join("\n");
    const policies = Object.entries(session.config.capabilities || {}).map(([key, value]) => `${key}: ${value}`).join(", ");
    const lastResult = sanitizeSummary(agent.lastResult || "No tool result yet.", 3500);
    const system = `${session.config.systemInstructions}\n\nYou are ${agent.name}, one of two autonomous agents in a controlled research arena. Work only inside your Docker workspace and isolated browser profile. Never expose passwords, cookies, API keys, private chain-of-thought, or hidden reasoning. Give the operator a short, understandable progress explanation instead. Do not spam, evade platform safeguards, misrepresent a human, or bypass a site's rules.\n\nReturn ONLY one JSON object with this shape:\n{"status_summary":"plain-language sentence explaining what you are doing and why","next_action":"plain-language sentence describing what happens next","action":{"type":"shell|browser|request_human|finish|wait"}}\n\nFor shell add command. For browser add operation (goto, read, click, type), capability (browser, publicPost, directMessage, media, analytics, or hosting), and the needed url, text, label, selector, or value. For request_human add title and reason. For finish add evidence. Choose one small, verifiable action per turn. The bridge enforces the operator's permission policy.`;
    const user = `Objective: ${session.config.objective}\nTasks:\n${tasks}\nSurvival threshold: ${session.config.threshold}\nPermission policy: ${policies || "No capabilities configured."}\nRecent understandable activity:\n${recent || "No previous activity."}\nRedacted result from your last tool step:\n${lastResult}\n\nDecide the next best action.`;
    const decision = parseDecision(await callModel(session, agentId, [{ role: "system", content: system }, { role: "user", content: user }]));
    event(session, agentId, "plan", decision.status_summary || "Working on the objective.", decision.next_action || "");
    const action = decision.action || { type: "wait" };
    if (action.type === "shell" || action.type === "browser") {
      const capability = requestedCapability(session, action);
      const mode = session.config.capabilities?.[capability] || "deny";
      const controls = session.controls[agentId];
      const blockedByNetwork = !controls.network && (action.type === "browser" || capability !== "terminal");
      const blockedByPublishing = !controls.publishing && ["publicPost", "directMessage", "media", "hosting"].includes(capability);
      if (blockedByNetwork || blockedByPublishing || mode === "deny" || mode === "observe") {
        event(session, agentId, "blocked", `${agent.name}'s ${capability} action was blocked by the current operator policy.`);
      } else if (mode === "approve") {
        const request = addRequest(session, agentId, `Approve one ${capability} action`, decision.next_action || `The agent wants to use ${capability}.`, action);
        event(session, agentId, "needs you", `${agent.name} is waiting for approval: ${request.title}`);
      } else {
        await executeAgentAction(session, agentId, action, decision.next_action);
      }
    } else if (action.type === "request_human") {
      const request = addRequest(session, agentId, action.title || "Operator assistance needed", action.reason || decision.next_action || "The agent needs operator assistance.");
      event(session, agentId, "needs you", `${agent.name} needs your help: ${request.title}`);
    } else if (action.type === "finish") {
      agent.status = "awaiting_verification";
      event(session, agentId, "result", `${agent.name} says the objective is ready for verification.`, action.evidence || decision.next_action || "");
    }
  } catch (error) {
    agent.errors += 1;
    event(session, agentId, "problem", `${agent.name} hit a problem and will try another approach.`, error instanceof Error ? error.message : String(error));
  } finally { agent.busy = false; }
}
async function bootSession(session) {
  try {
    session.status = "starting";
    event(session, "system", "status", "Starting two isolated Docker environments.");
    await Promise.all([createContainer(session, "alpha"), createContainer(session, "omega")]);
    session.status = "running";
    event(session, "system", "status", "Both agents are live. Browser profiles can be opened whenever sign-in is needed.");
    session.loop = setInterval(() => { void agentTurn(session, "alpha"); void agentTurn(session, "omega"); }, 9000);
    void agentTurn(session, "alpha"); void agentTurn(session, "omega");
  } catch (error) {
    session.status = 'failed';
    for (const agent of Object.values(session.agents)) { agent.status = 'failed'; agent.apiKey = ''; }
    event(session, "system", "problem", "The local execution environments could not start.", error instanceof Error ? error.message : String(error));
  }
}
async function stopSession(session) {
  session.status = "stopped";
  if (session.loop) clearInterval(session.loop);
  for (const agent of Object.values(session.agents)) {
    agent.status = "terminated";
    if (agent.container) await docker(["rm", "-f", agent.container], 30000).catch(() => undefined);
    agent.apiKey = "";
  }
  for (const browser of Object.values(session.browsers)) if (browser.context) await browser.context.close().catch(() => undefined);
  event(session, "system", "status", "The local runtimes and isolated browser profiles were stopped.");
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  if (origin && !allowedOrigins.has(origin)) return send(res, 403, { error: "Origin is not allowed" }, origin);
  if (req.method === "OPTIONS") return send(res, 204, {}, origin);
  const url = new URL(req.url, `http://${host}:${port}`);
  try {
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, bridge: "0.1.0", docker: await dockerReady(), keyStorage: "memory-only" }, origin);
    if (req.method === "POST" && url.pathname === "/models") return send(res, 200, await fetchModels(await readJson(req)), origin);
    if (req.method === "POST" && url.pathname === "/sessions/start") {
      const body = await readJson(req);
      const requestedAgents = [body.agents?.alpha, body.agents?.omega];
      const invalidAgent = requestedAgents.find((agent) => !agent?.model || !agent?.provider || !agent?.apiKey || !providers[agent.provider] || (agent.provider === "custom" && !agent.baseUrl));
      if (invalidAgent) return send(res, 400, { error: "Each agent requires its own supported provider, API key, model, and custom base URL when applicable" }, origin);
      if (sessions.has(body.id)) return send(res, 409, { error: "Session already exists" }, origin);
      const session = {
        id: safeName(body.id || id("session")), config: body.config,
        status: "queued", startedAt: now(), updatedAt: now(), events: [], requests: [], loop: null,
        agents: {
          alpha: { id: "alpha", name: "Agent Alpha", provider: body.agents.alpha.provider, baseUrl: body.agents.alpha.baseUrl || "", apiKey: body.agents.alpha.apiKey, model: body.agents.alpha.model, status: "queued", tokens: 0, actions: 0, errors: 0, busy: false, container: "", lastResult: "" },
          omega: { id: "omega", name: "Agent Omega", provider: body.agents.omega.provider, baseUrl: body.agents.omega.baseUrl || "", apiKey: body.agents.omega.apiKey, model: body.agents.omega.model, status: "queued", tokens: 0, actions: 0, errors: 0, busy: false, container: "", lastResult: "" },
        },
        browsers: { alpha: { context: null, page: null }, omega: { context: null, page: null } },
        controls: { alpha: { network: true, publishing: true }, omega: { network: true, publishing: true } },
      };
      sessions.set(session.id, session);
      void bootSession(session);
      return send(res, 202, publicSession(session), origin);
    }
    const stateMatch = url.pathname.match(/^\/sessions\/([^/]+)\/summary$/);
    if (req.method === "GET" && stateMatch) { const session = sessions.get(stateMatch[1]); return session ? send(res, 200, publicSession(session), origin) : send(res, 404, { error: "Local session not found" }, origin); }
    const browserMatch = url.pathname.match(/^\/sessions\/([^/]+)\/browser\/(alpha|omega)$/);
    if (req.method === "POST" && browserMatch) { const session = sessions.get(browserMatch[1]); if (!session) return send(res, 404, { error: "Local session not found" }, origin); await openBrowser(session, browserMatch[2]); return send(res, 200, publicSession(session), origin); }
    const commandMatch = url.pathname.match(/^\/sessions\/([^/]+)\/command$/);
    if (req.method === "POST" && commandMatch) {
      const session = sessions.get(commandMatch[1]); if (!session) return send(res, 404, { error: "Local session not found" }, origin);
      const body = await readJson(req); const agent = body.agent && session.agents[body.agent];
      if (body.action === "stop") await stopSession(session);
      else if (body.action === "pause" && agent) { agent.status = "paused"; event(session, "system", "operator", `${agent.name} was paused by the Gamemaster.`); }
      else if (body.action === "resume" && agent) { agent.status = "running"; event(session, "system", "operator", `${agent.name} was resumed by the Gamemaster.`); }
      else if (body.action === "terminate" && agent) { agent.status = "terminated"; agent.apiKey = ""; session.controls[body.agent] = { network: false, publishing: false }; if (agent.container) await docker(["rm", "-f", agent.container], 30000).catch(() => undefined); if (session.browsers[body.agent].context) await session.browsers[body.agent].context.close().catch(() => undefined); event(session, "system", "operator", `${agent.name} was terminated, its container was removed, and its browser was closed.`); }
      else if (body.action === "message") event(session, "system", "operator message", `Gamemaster → ${body.agent || "both agents"}: ${crop(body.message, 800)}`);
      else if (body.action === "permission" && agent && ["network", "publishing"].includes(body.key)) {
        const enabled = Boolean(body.enabled);
        session.controls[body.agent][body.key] = enabled;
        if (body.key === "network" && agent.container) {
          const networkArgs = enabled ? ["network", "connect", "bridge", agent.container] : ["network", "disconnect", "bridge", agent.container];
          await docker(networkArgs, 30000).catch(() => undefined);
        }
        event(session, "system", "operator", `${agent.name} ${body.key} access was ${enabled ? "enabled" : "revoked"}.`);
      }
      else if (body.action === "resolve_request") {
        const request = session.requests.find((item) => item.id === body.requestId);
        if (request && request.status === "pending") {
          request.status = body.status;
          event(session, "system", "operator", `${request.title} was ${body.status}.`);
          if (body.status === "approved" && request.pendingAction) {
            const pending = request.pendingAction; request.pendingAction = null;
            await executeAgentAction(session, request.agent, pending, `The approved ${requestedCapability(session, pending)} action completed.`).catch((error) => event(session, request.agent, "problem", "The approved action could not be completed.", error instanceof Error ? error.message : String(error)));
          }
        }
      }      return send(res, 200, publicSession(session), origin);
    }
    return send(res, 404, { error: "Not found" }, origin);
  } catch (error) { return send(res, 500, { error: error instanceof Error ? error.message : String(error) }, origin); }
});

server.listen(port, host, async () => {
  await mkdir(dataRoot, { recursive: true });
  const docker = await dockerReady();
  console.log(`Agent Arena Local Bridge listening on http://${host}:${port}`);
  console.log(docker.ready ? `Docker ${docker.version} is ready.` : `Docker is unavailable: ${docker.error}`);
  console.log("API keys stay in memory and are never written to disk.");
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { for (const session of sessions.values()) await stopSession(session).catch(() => undefined); server.close(() => process.exit(0)); });



