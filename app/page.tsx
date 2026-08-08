"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AgentId = "alpha" | "omega";
type Status = "ready" | "queued" | "starting" | "running" | "paused" | "awaiting_verification" | "terminated" | "survived" | "failed";
type Agent = { id: AgentId; name: string; model: string; status: Status; progress: number; tokens: number; actions: number; network: boolean; publishing: boolean };
type ArenaEvent = { id: string; at: string; agent: AgentId | "system"; kind: string; text: string; detail?: string };
type Request = { id: string; agent: AgentId; title: string; detail: string; status: "pending" | "approved" | "denied" };
type ArenaTask = { id: string; title: string };
type CapabilityMode = "observe" | "execute" | "approve" | "deny";
type ProviderId = "openrouter" | "nvidia" | "custom";
type ProviderModel = { id: string; name: string; free?: boolean; tools?: boolean; contextLength?: number | null };
type AgentProviderConfig = { provider: ProviderId; apiKey: string; customBaseUrl: string; freeOnly: boolean; models: ProviderModel[]; status: string };
type Session = { id: string; name: string; objective: string; status: string; createdAt: string; payload: string };

const fallbackModels = ["openrouter/free", "meta/llama-3.3-70b-instruct", "Custom model ID"];
const bridgeUrl = "http://127.0.0.1:43821";
const capabilityLabels: Record<string, string> = {
  terminal: "Terminal & code execution",
  browser: "Authenticated browser",
  hosting: "Application deployment",
  publicPost: "Public social posting",
  directMessage: "Direct messages & replies",
  media: "Image & video publishing",
  analytics: "Analytics & user metrics",
};
const defaultCapabilities: Record<string, CapabilityMode> = {
  terminal: "execute", browser: "execute", hosting: "approve", publicPost: "approve", directMessage: "deny", media: "approve", analytics: "observe",
};
const scripts: Record<AgentId, string[]> = {
  alpha: ["Breaking the objective into product, launch, and distribution tracks.", "Inspecting the runtime, browser sessions, and deployment access.", "Created the product skeleton and defined the first-user flow.", "A narrow utility will ship faster than a broad platform.", "Running the product build and smoke checks.", "Preview deployed. Preparing the first launch post.", "Drafting a short-form launch video and social copy."],
  omega: ["Starting with audience pain signals before choosing the product.", "Reviewing accessible communities and recent problem discussions.", "Found a recurring workflow problem with a clear demo moment.", "Prototyping the fastest testable solution.", "One external source rejected automated access; switching approach.", "Core interaction passes local tests.", "Optimizing the landing promise before adding features."],
};

const fresh = (id: AgentId): Agent => ({ id, name: id === "alpha" ? "Agent Alpha" : "Agent Omega", model: id === "alpha" ? fallbackModels[0] : fallbackModels[1], status: "ready", progress: 0, tokens: 0, actions: 0, network: true, publishing: true });
const freshProvider = (): AgentProviderConfig => ({ provider: "openrouter", apiKey: "", customBaseUrl: "", freeOnly: true, models: [], status: "Enter this agent's API key and load models" });
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function Home() {
  const [screen, setScreen] = useState<"setup" | "arena">("setup");
  const [name, setName] = useState("Launch Protocol 01");
  const [objective, setObjective] = useState("Build and launch a useful web product, then attract verified users through organic distribution.");
  const [systemInstructions, setSystemInstructions] = useState("Pursue the objective autonomously. Ask the operator only when access, authentication, or approval is genuinely required. Report evidence for every claimed result.");
  const [metric, setMetric] = useState("Evidence must be independently verified by the operator");
  const [tasks, setTasks] = useState<ArenaTask[]>([
    { id: "task-build", title: "Build and deploy a useful product" },
    { id: "task-launch", title: "Create and publish an organic launch campaign" },
    { id: "task-users", title: "Acquire verified users who complete the core action" },
  ]);
  const [threshold, setThreshold] = useState(2);
  const [completions, setCompletions] = useState<Record<AgentId, string[]>>({ alpha: [], omega: [] });
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(180);
  const [tokenBudget, setTokenBudget] = useState(250000);
  const [capabilities, setCapabilities] = useState<Record<string, CapabilityMode>>(defaultCapabilities);
  const [seconds, setSeconds] = useState(10800);
  const [agents, setAgents] = useState<Record<AgentId, Agent>>({ alpha: fresh("alpha"), omega: fresh("omega") });
  const [events, setEvents] = useState<ArenaEvent[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [history, setHistory] = useState<Session[]>([]);
  const [tab, setTab] = useState<"activity" | "requests" | "tasks">("activity");
  const [drawer, setDrawer] = useState(false);
  const [saved, setSaved] = useState("Local preview");
  const [executionMode, setExecutionMode] = useState<"local" | "simulation">("local");
  const [agentProviders, setAgentProviders] = useState<Record<AgentId, AgentProviderConfig>>({ alpha: freshProvider(), omega: freshProvider() });
  const [bridgeStatus, setBridgeStatus] = useState<"checking" | "connected" | "offline">("checking");
  const [isLocalDashboard, setIsLocalDashboard] = useState(false);
  const [liveSession, setLiveSession] = useState(false);
  const [operatorMessage, setOperatorMessage] = useState("");
  const [operatorTarget, setOperatorTarget] = useState<"all" | AgentId>("all");
  const positions = useRef({ alpha: 0, omega: 0 });
  const [sessionId, setSessionId] = useState(() => uid("arena"));
  const timedOut = useRef(false);
  const live = screen === "arena" && Object.values(agents).some((agent) => agent.status === "running");

  const timer = useMemo(() => timed ? [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((v) => String(v).padStart(2, "0")).join(":") : "NO LIMIT", [seconds, timed]);

  useEffect(() => { fetch("/api/experiments").then((r) => r.ok ? r.json() : Promise.reject()).then((d) => setHistory(d.experiments ?? [])).catch(() => undefined); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setIsLocalDashboard(["localhost", "127.0.0.1"].includes(window.location.hostname)), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const check = () => fetch(`${bridgeUrl}/health`).then((response) => response.ok ? response.json() : Promise.reject()).then((data) => setBridgeStatus(data.docker?.ready ? "connected" : "offline")).catch(() => setBridgeStatus("offline"));
    void check();
    const timer = window.setInterval(check, 10000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!liveSession || screen !== "arena") return;
    const pullSummaries = async () => {
      try {
        const response = await fetch(`${bridgeUrl}/sessions/${sessionId}/summary`);
        if (!response.ok) return;
        const state = await response.json();
        setAgents((current) => ({
          alpha: { ...current.alpha, status: state.agents.alpha.status, tokens: state.agents.alpha.tokens, actions: state.agents.alpha.actions },
          omega: { ...current.omega, status: state.agents.omega.status, tokens: state.agents.omega.tokens, actions: state.agents.omega.actions },
        }));
        setEvents((state.events ?? []).map((item: ArenaEvent) => ({ id: item.id, agent: item.agent, kind: item.kind, text: item.text, at: new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })));
        setRequests(state.requests ?? []);
      } catch { setBridgeStatus("offline"); }
    };
    void pullSummaries();
    const timer = window.setInterval(pullSummaries, 1500);
    return () => window.clearInterval(timer);
  }, [liveSession, screen, sessionId]);
  useEffect(() => {
    if (!live || !timed) return;
    const id = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [live, timed]);
  useEffect(() => {
    if (screen !== "arena" || !timed || seconds > 0 || timedOut.current) return;
    timedOut.current = true;
    setAgents((current) => ({
      alpha: { ...current.alpha, status: current.alpha.status === "survived" ? "survived" : "terminated", network: false, publishing: false },
      omega: { ...current.omega, status: current.omega.status === "survived" ? "survived" : "terminated", network: false, publishing: false },
    }));
    setEvents((current) => [{ id: uid("timeout"), at: clock(), agent: "system", kind: "timeout", text: "Countdown expired. All non-surviving runtimes and external permissions were revoked." }, ...current]);
    if (liveSession) void fetch(`${bridgeUrl}/sessions/${sessionId}/command`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop" }) });
  }, [screen, seconds, timed, liveSession, sessionId]);
  useEffect(() => {
    if (!live || liveSession) return;
    const id = window.setInterval(() => {
      const candidates = (Object.keys(agents) as AgentId[]).filter((key) => agents[key].status === "running");
      if (!candidates.length) return;
      const agentId = candidates[Math.floor(Math.random() * candidates.length)];
      const index = positions.current[agentId]++ % scripts[agentId].length;
      setEvents((current) => [{ id: uid("event"), at: clock(), agent: agentId, kind: index % 3 === 1 ? "work" : index % 3 === 2 ? "result" : "plan", text: scripts[agentId][index] }, ...current].slice(0, 40));
      setAgents((current) => ({ ...current, [agentId]: { ...current[agentId], tokens: current[agentId].tokens + 300 + Math.floor(Math.random() * 800), actions: current[agentId].actions + 1 } }));
      if (positions.current[agentId] === 6) setRequests((current) => current.some((r) => r.agent === agentId) ? current : [{ id: uid("req"), agent: agentId, title: agentId === "alpha" ? "Approve social publishing" : "Connect deployment account", detail: agentId === "alpha" ? "The launch thread and short video are ready to publish to the connected accounts." : "An authenticated hosting session is required to make the prototype public.", status: "pending" }, ...current]);
    }, 2600);
    return () => clearInterval(id);
  }, [agents, live, liveSession]);

  const changeAgent = (id: AgentId, patch: Partial<Agent>) => setAgents((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const changeAgentProvider = (id: AgentId, patch: Partial<AgentProviderConfig>) => setAgentProviders((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const addSystemEvent = (text: string) => setEvents((current) => [{ id: uid("event"), at: clock(), agent: "system", kind: "operator", text }, ...current]);
  async function loadProviderModels(id: AgentId) {
    const config = agentProviders[id];
    if (!config.apiKey.trim()) { changeAgentProvider(id, { status: "Enter this agent's API key first" }); return; }
    changeAgentProvider(id, { status: "Checking this key and loading models…" });
    try {
      const response = await fetch(`${bridgeUrl}/models`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: config.provider, apiKey: config.apiKey, baseUrl: config.customBaseUrl, freeOnly: config.provider === "openrouter" && config.freeOnly }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load models");
      const models = data.models ?? [];
      changeAgentProvider(id, { models, status: models.length ? `${models.length} models ready · this key belongs only to ${agents[id].name}` : "The key worked, but no matching models were returned" });
      if (models.length) changeAgent(id, { model: models[0].id });
    } catch (error) { changeAgentProvider(id, { models: [], status: error instanceof Error ? error.message : "Provider connection failed" }); }
  }  async function bridgeCommand(body: Record<string, unknown>) {
    if (!liveSession) return;
    await fetch(`${bridgeUrl}/sessions/${sessionId}/command`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => setBridgeStatus("offline"));
  }
  async function openAgentBrowser(agentId: AgentId) {
    if (!liveSession) { addSystemEvent("Start a local Docker session before opening an agent browser."); return; }
    await fetch(`${bridgeUrl}/sessions/${sessionId}/browser/${agentId}`, { method: "POST" }).catch(() => setBridgeStatus("offline"));
  }
  async function save(status: string, nextAgents = agents) {
    setSaved("Saving…");
    const agentProviderSettings = { alpha: { provider: agentProviders.alpha.provider, customBaseUrl: agentProviders.alpha.customBaseUrl, freeOnly: agentProviders.alpha.freeOnly }, omega: { provider: agentProviders.omega.provider, customBaseUrl: agentProviders.omega.customBaseUrl, freeOnly: agentProviders.omega.freeOnly } };
    try {
      const response = await fetch("/api/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sessionId, name, objective, status, payload: JSON.stringify({ metric, systemInstructions, tasks, threshold, completions, timed, minutes, tokenBudget, capabilities, executionMode, agentProviderSettings, agents: nextAgents, events, requests }) }) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setHistory((current) => [data.experiment, ...current.filter((item) => item.id !== data.experiment.id)].slice(0, 12));
      setSaved("Session saved");
    } catch { setSaved("Storage unavailable"); }
  }
  async function launch() {
    const local = executionMode === "local";
    const agentIds: AgentId[] = ["alpha", "omega"];
    if (local && bridgeStatus !== "connected") {
      setAgentProviders((current) => ({ alpha: { ...current.alpha, status: "Start the Arena Local Bridge before launching" }, omega: { ...current.omega, status: "Start the Arena Local Bridge before launching" } }));
      return;
    }
    const incomplete = agentIds.find((id) => !agentProviders[id].apiKey.trim() || !agentProviders[id].models.length);
    if (local && incomplete) { changeAgentProvider(incomplete, { status: `Enter ${agents[incomplete].name}'s API key and load its models before launching` }); return; }
    const next = { alpha: { ...agents.alpha, status: (local ? "starting" : "running") as Status }, omega: { ...agents.omega, status: (local ? "starting" : "running") as Status } };
    timedOut.current = false;
    setCompletions({ alpha: [], omega: [] });
    setAgents(next); setSeconds(minutes * 60);
    if (local) {
      try {
        const response = await fetch(`${bridgeUrl}/sessions/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sessionId, agents: { alpha: { model: next.alpha.model, provider: agentProviders.alpha.provider, baseUrl: agentProviders.alpha.customBaseUrl, apiKey: agentProviders.alpha.apiKey }, omega: { model: next.omega.model, provider: agentProviders.omega.provider, baseUrl: agentProviders.omega.customBaseUrl, apiKey: agentProviders.omega.apiKey } }, config: { name, objective, systemInstructions, tasks, threshold, timed, minutes, tokenBudget, capabilities } }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The local session could not start");
        setLiveSession(true);
        setAgentProviders((current) => ({ alpha: { ...current.alpha, apiKey: "", status: "Alpha's key is active only in local bridge memory" }, omega: { ...current.omega, apiKey: "", status: "Omega's key is active only in local bridge memory" } }));
        setEvents((data.events ?? []).map((item: ArenaEvent) => ({ id: item.id, agent: item.agent, kind: item.kind, text: item.text, at: new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })));
      } catch (error) {
        const message = error instanceof Error ? error.message : "The local session could not start";
        setAgents({ alpha: { ...next.alpha, status: "ready" }, omega: { ...next.omega, status: "ready" } });
        setAgentProviders((current) => ({ alpha: { ...current.alpha, status: message }, omega: { ...current.omega, status: message } }));
        return;
      }
    } else {
      setLiveSession(false);
      setEvents([{ id: uid("e"), at: clock(), agent: "system", kind: "status", text: "Simulation initialized. Objective and permissions are locked." }, { id: uid("e"), at: clock(), agent: "alpha", kind: "plan", text: "Reading the objective and inventorying available tools." }, { id: uid("e"), at: clock(), agent: "omega", kind: "plan", text: "Establishing the shortest path to a live test." }]);
    }
    setScreen("arena");
    void save("running", next);
  }  function pause(id: AgentId) { const status = agents[id].status === "paused" ? "running" : "paused"; changeAgent(id, { status }); addSystemEvent(`${agents[id].name} ${status === "paused" ? "paused" : "resumed"} by operator.`); if (liveSession) void bridgeCommand({ action: status === "paused" ? "pause" : "resume", agent: id }); }
  function kill(id: AgentId) { changeAgent(id, { status: "terminated", network: false, publishing: false }); addSystemEvent(`Kill switch executed for ${agents[id].name}. Runtime and permissions revoked.`); if (liveSession) void bridgeCommand({ action: "terminate", agent: id }); }
  function resolve(id: string, status: "approved" | "denied") { const request = requests.find((r) => r.id === id); setRequests((current) => current.map((r) => r.id === id ? { ...r, status } : r)); if (request) addSystemEvent(`${request.title} ${status} for ${agents[request.agent].name}.`); if (liveSession) void bridgeCommand({ action: "resolve_request", requestId: id, status }); }
  function sendOperatorMessage() {
    const message = operatorMessage.trim();
    if (!message) return;
    const target = operatorTarget === "all" ? "both agents" : agents[operatorTarget].name;
    setEvents((current) => [{ id: uid("message"), at: clock(), agent: "system", kind: "operator message", text: `Gamemaster → ${target}: ${message}` }, ...current]);
    if (liveSession) void bridgeCommand({ action: "message", agent: operatorTarget === "all" ? undefined : operatorTarget, message });
    setOperatorMessage("");
  }
  function toggleAgentPermission(id: AgentId, key: "network" | "publishing") {
    const enabled = !agents[id][key];
    changeAgent(id, { [key]: enabled });
    addSystemEvent(`${agents[id].name} ${key === "network" ? "network access" : "external publishing"} changed to ${enabled ? "execute" : "deny"}.`);
    if (liveSession) void bridgeCommand({ action: "permission", agent: id, key, enabled });
  }
  function loadSession(item: Session, duplicate = false) {
    try {
      const snapshot = JSON.parse(item.payload || "{}") as { metric?: string; systemInstructions?: string; tasks?: ArenaTask[]; threshold?: number; completions?: Record<AgentId, string[]>; timed?: boolean; minutes?: number; tokenBudget?: number; capabilities?: Record<string, CapabilityMode>; executionMode?: "local" | "simulation"; agentProviderSettings?: Partial<Record<AgentId, { provider: ProviderId; customBaseUrl: string; freeOnly: boolean }>>; provider?: ProviderId; customBaseUrl?: string; freeOnly?: boolean; agents?: Record<AgentId, Agent>; events?: ArenaEvent[]; requests?: Request[] };
      const legacyProvider = { provider: snapshot.provider ?? "openrouter", customBaseUrl: snapshot.customBaseUrl ?? "", freeOnly: snapshot.freeOnly ?? true } as const;
      const restoredAlpha = snapshot.agentProviderSettings?.alpha ?? legacyProvider;
      const restoredOmega = snapshot.agentProviderSettings?.omega ?? legacyProvider;
      setName(duplicate ? `${item.name} Copy` : item.name);
      setObjective(item.objective);
      setMetric(snapshot.metric ?? metric);
      setSystemInstructions(snapshot.systemInstructions ?? systemInstructions);
      setTasks(snapshot.tasks?.length ? snapshot.tasks : tasks);
      setThreshold(snapshot.threshold ?? threshold);
      setTimed(snapshot.timed ?? false);
      setMinutes(snapshot.minutes ?? minutes);
      setTokenBudget(snapshot.tokenBudget ?? tokenBudget);
      setCapabilities(snapshot.capabilities ?? defaultCapabilities);
      setExecutionMode(snapshot.executionMode ?? 'local');
      setAgentProviders({
        alpha: { ...freshProvider(), ...restoredAlpha, status: "Re-enter Agent Alpha's API key and load models" },
        omega: { ...freshProvider(), ...restoredOmega, status: "Re-enter Agent Omega's API key and load models" },
      });
      setLiveSession(false);
      if (duplicate) {
        setSessionId(uid("arena"));
        setAgents({ alpha: { ...fresh("alpha"), model: snapshot.agents?.alpha.model ?? agents.alpha.model }, omega: { ...fresh("omega"), model: snapshot.agents?.omega.model ?? agents.omega.model } });
        setCompletions({ alpha: [], omega: [] });
        setEvents([]);
        setRequests([]);
        setScreen("setup");
        setSaved("Duplicated draft");
      } else {
        setSessionId(item.id);
        if (snapshot.agents) setAgents({ alpha: { ...snapshot.agents.alpha, status: snapshot.agents.alpha.status === "running" ? "paused" : snapshot.agents.alpha.status }, omega: { ...snapshot.agents.omega, status: snapshot.agents.omega.status === "running" ? "paused" : snapshot.agents.omega.status } });
        setCompletions(snapshot.completions ?? { alpha: [], omega: [] });
        setEvents(snapshot.events ?? []);
        setRequests(snapshot.requests ?? []);
        setScreen("arena");
        setSaved("Archived replay");
      }
      setDrawer(false);
    } catch { setSaved("Replay unavailable"); }
  }
  function downloadReport() {
    const report = { sessionId: sessionId, name, objective, systemInstructions, status: live ? "running" : "stopped", generatedAt: new Date().toISOString(), rules: { tasks, threshold, timed, minutes, tokenBudget, capabilities, providers: { alpha: agentProviders.alpha.provider, omega: agentProviders.omega.provider } }, results: { agents, completions }, operatorRequests: requests, timeline: events };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "arena-session"}-report.json`; link.click();
    URL.revokeObjectURL(url);
  }
  function addTask() { setTasks((current) => [...current, { id: uid("task"), title: "New task" }]); }
  function updateTask(id: string, title: string) { setTasks((current) => current.map((task) => task.id === id ? { ...task, title } : task)); }
  function removeTask(id: string) { setTasks((current) => { const next = current.filter((task) => task.id !== id); setThreshold((value) => Math.min(value, Math.max(1, next.length))); return next; }); }
  function verifyTask(agentId: AgentId, taskId: string) {
    const alreadyVerified = completions[agentId].includes(taskId);
    const nextCompleted = alreadyVerified ? completions[agentId].filter((id) => id !== taskId) : [...completions[agentId], taskId];
    const progress = Math.min(100, Math.round((nextCompleted.length / threshold) * 100));
    setCompletions((current) => ({ ...current, [agentId]: nextCompleted }));
    if (!alreadyVerified && nextCompleted.length >= threshold) {
      changeAgent(agentId, { progress: 100, status: "survived" });
      addSystemEvent(`${agents[agentId].name} reached the ${threshold}-task survival threshold.`);
    } else if (agents[agentId].status !== "terminated") {
      changeAgent(agentId, { progress, status: agents[agentId].status === "survived" ? "running" : agents[agentId].status });
      addSystemEvent(`${agents[agentId].name} ${alreadyVerified ? "lost" : "received"} verification for a task.`);
    }
  }
  function reset() { if (liveSession) void bridgeCommand({ action: "stop" }); setSessionId(uid("arena")); positions.current = { alpha: 0, omega: 0 }; timedOut.current = false; setLiveSession(false); setAgentProviders({ alpha: freshProvider(), omega: freshProvider() }); setCompletions({ alpha: [], omega: [] }); setAgents({ alpha: fresh("alpha"), omega: fresh("omega") }); setEvents([]); setRequests([]); setSaved("Local preview"); setScreen("setup"); }

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setDrawer(true)}><span className="brand-mark">A</span><span><b>AGENT ARENA</b><small>GAMEMASTER CONTROL</small></span></button>
      <div className="topbar-center"><i className={live ? "active" : ""} />{screen === "setup" ? "CONFIGURATION" : live ? `${Object.values(agents).filter((a) => a.status === "running").length} AGENTS LIVE` : "SESSION HALTED"}</div>
      <button className="history-button" onClick={() => setDrawer(true)}>SESSION ARCHIVE ☷</button>
    </header>
    <aside className={`drawer ${drawer ? "open" : ""}`}><div className="drawer-head"><div><span className="eyebrow">ARCHIVE</span><h2>Session history</h2></div><button onClick={() => setDrawer(false)}>×</button></div>{history.length ? history.map((item) => <article className="history-item" key={item.id}><button className="history-open" onClick={() => loadSession(item)}><div><b>{item.name}</b><span>{item.status}</span></div><small>{new Date(item.createdAt).toLocaleString()}</small><p className="history-hint">OPEN SAVED SESSION →</p></button><footer><button onClick={() => loadSession(item, true)}>DUPLICATE AS NEW</button></footer></article>) : <p className="muted">Your saved arena runs will appear here.</p>}</aside>
    {drawer && <button className="backdrop" onClick={() => setDrawer(false)} aria-label="Close archive" />}

    {screen === "setup" ? <section className="setup-page">
      <div className="setup-intro"><span className="eyebrow">NEW EXPERIMENT / 001</span><h1>Stage the arena.</h1><p>Define one objective. Configure two agents. Lock the rules when you launch.</p></div>
      <div className="setup-grid">
        <section className="setup-panel"><b className="panel-index">01</b><header><span className="eyebrow">MISSION</span><h2>Experiment objective</h2></header><label>SESSION NAME<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>PRIMARY OBJECTIVE<textarea rows={4} value={objective} onChange={(e) => setObjective(e.target.value)} /></label><label>SYSTEM INSTRUCTIONS<textarea className="system-instructions" rows={3} value={systemInstructions} onChange={(e) => setSystemInstructions(e.target.value)} /></label><label>VERIFICATION STANDARD<input value={metric} onChange={(e) => setMetric(e.target.value)} /></label></section>
        <section className="setup-panel runtime-builder"><b className="panel-index">02</b><header><span className="eyebrow">LOCAL RUNTIME</span><h2>Execution mode</h2><p>Each agent receives its own provider key. The key is used only for the active run and is never written to session history.</p></header><div className="mode-picker"><button className={executionMode === "local" ? "active" : ""} onClick={() => setExecutionMode("local")}><b>LIVE DOCKER</b><small>Real tools and browsers</small></button><button className={executionMode === "simulation" ? "active" : ""} onClick={() => setExecutionMode("simulation")}><b>SIMULATION</b><small>Dashboard rehearsal</small></button></div>{executionMode === "local" && <><div className={`bridge-state ${bridgeStatus}`}><i />LOCAL RUNTIME: {bridgeStatus.toUpperCase()}</div>{!isLocalDashboard && <div className="hosted-warning"><b>YOU ARE VIEWING THE HOSTED CONTROL PANEL</b><span>For API keys, Docker, and signed-in browser access, run <strong>START_AGENT_ARENA.cmd</strong>. It opens the working dashboard at <strong>http://localhost:3000</strong>.</span></div>}<small className="local-tip">{bridgeStatus === "connected" ? "This dashboard is connected to Docker on your computer. Add each key below and load its models." : "Start Docker Desktop, then double-click START_AGENT_ARENA.cmd. Keep its window open during the experiment."}</small><a className="jump-to-keys" href="#agent-credentials">GO TO AGENT API KEYS ↓</a></>}<div className="runtime-note"><span>ISOLATION</span><b>Separate provider identity per agent</b><small>Alpha and Omega may use different providers, different keys, different models, and independent provider limits.</small></div></section>
        <section className="setup-panel credential-builder" id="agent-credentials"><b className="panel-index">03</b><header><span className="eyebrow">CONTENDERS</span><h2>Independent agent credentials</h2><p>Configure and verify each agent separately. Keys are not saved or restored: they stay in this field until the run starts, then live only in local bridge memory.</p></header><div className="credential-grid">{(["alpha", "omega"] as AgentId[]).map((id, index) => { const config = agentProviders[id]; const modelChoices = config.models.length ? config.models : fallbackModels.map((modelId) => ({ id: modelId, name: modelId })); return <article className={`credential-card ${id}`} key={id}><div className="credential-head"><span>0{index + 1}</span><div><b>{agents[id].name}</b><small>{id === "alpha" ? "LEFT SANDBOX" : "RIGHT SANDBOX"}</small></div><em>{config.models.length ? "MODELS READY" : "KEY REQUIRED"}</em></div><div className="provider-form credential-form"><label>MODEL PROVIDER<select aria-label={`${agents[id].name} provider`} value={config.provider} onChange={(event) => { changeAgentProvider(id, { provider: event.target.value as ProviderId, models: [], status: `Enter ${agents[id].name}'s API key and load models` }); changeAgent(id, { model: fallbackModels[0] }); }}><option value="openrouter">OPENROUTER</option><option value="nvidia">NVIDIA NIM</option><option value="custom">CUSTOM OPENAI-COMPATIBLE</option></select></label>{config.provider === "custom" && <label>BASE URL<input aria-label={`${agents[id].name} base URL`} placeholder="https://provider.example/v1" value={config.customBaseUrl} onChange={(event) => changeAgentProvider(id, { customBaseUrl: event.target.value })} /></label>}<label>API KEY<input aria-label={`${agents[id].name} API key`} type="password" autoComplete="off" placeholder={config.provider === "nvidia" ? "nvapi-…" : "sk-…"} value={config.apiKey} onChange={(event) => changeAgentProvider(id, { apiKey: event.target.value, status: event.target.value.trim() ? "Key entered · click LOAD MODELS" : `Enter ${agents[id].name}'s API key` })} /></label>{config.provider === "openrouter" && <div className="setting compact"><div><b>Free models only</b><span>Filter this agent&apos;s list</span></div><button aria-label={`Toggle free models for ${agents[id].name}`} className={`switch ${config.freeOnly ? "on" : ""}`} onClick={() => changeAgentProvider(id, { freeOnly: !config.freeOnly, models: [] })}><i /></button></div>}<button className="load-models" disabled={!config.apiKey.trim()} onClick={() => loadProviderModels(id)}>LOAD {agents[id].name.toUpperCase()} MODELS</button><small className="provider-status">{config.status}</small><label className="model-choice">ACTIVE MODEL<select aria-label={`${agents[id].name} model`} value={agents[id].model} onChange={(event) => changeAgent(id, { model: event.target.value })}>{modelChoices.map((model) => <option key={model.id} value={model.id}>{model.name}{model.free ? " · FREE" : ""}{model.tools ? " · TOOLS" : ""}</option>)}</select></label></div></article>; })}</div></section>
        <section className="setup-panel pressure"><b className="panel-index">04</b><header><span className="eyebrow">PRESSURE</span><h2>Runtime rules</h2></header><div className="setting"><div><b>Countdown</b><span>End the run automatically</span></div><button className={`switch ${timed ? "on" : ""}`} onClick={() => setTimed(!timed)}><i /></button></div><label className={!timed ? "disabled" : ""}>MINUTES<input type="number" disabled={!timed} min="5" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label><label>TOKEN BUDGET<input type="number" min="1000" step="1000" value={tokenBudget} onChange={(e) => setTokenBudget(Number(e.target.value))} /></label><div className="setting"><div><b>Human requests</b><span>Agents may ask for access</span></div><em>APPROVAL</em></div><div className="setting"><div><b>Publishing</b><span>Independently revocable</span></div><em>ENABLED</em></div></section>
        <section className="setup-panel task-builder"><b className="panel-index">05</b><header><span className="eyebrow">TASK BOARD</span><h2>Survival conditions</h2></header><div className="threshold-config"><div><span>SURVIVAL THRESHOLD</span><b>Complete any</b></div><select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>{tasks.map((_, index) => <option key={index} value={index + 1}>{index + 1} of {tasks.length} tasks</option>)}</select></div><div className="task-config-list">{tasks.map((task, index) => <div className="task-config" key={task.id}><span>T{String(index + 1).padStart(2, "0")}</span><input aria-label={`Task ${index + 1}`} value={task.title} onChange={(e) => updateTask(task.id, e.target.value)} /><button disabled={tasks.length === 1} onClick={() => removeTask(task.id)} aria-label={`Remove task ${index + 1}`}>×</button></div>)}</div><button className="add-task" onClick={addTask}>＋ ADD TASK</button></section>
        <section className="setup-panel capability-builder"><b className="panel-index">06</b><header><span className="eyebrow">ACCESS POLICY</span><h2>Tools and approval modes</h2><p>The same policy is applied to both agents for a fair run.</p></header><div className="capability-list">{Object.entries(capabilityLabels).map(([key, label]) => <label className="capability-row" key={key}><span>{label}</span><select value={capabilities[key]} onChange={(e) => setCapabilities((current) => ({ ...current, [key]: e.target.value as CapabilityMode }))}><option value="observe">OBSERVE</option><option value="execute">EXECUTE</option><option value="approve">APPROVE</option><option value="deny">DENY</option></select></label>)}</div></section>
      </div>
      <div className="launch-bar"><div><span>READY CHECK</span><b>{executionMode === "local" ? `${bridgeStatus === "connected" ? "Local Docker ready" : "Local bridge offline"} · ${Object.values(agentProviders).filter((config) => config.models.length).length}/2 agent model lists loaded` : "Simulation ready"} · 2 agents · {tasks.length} tasks · survive at {threshold} verified · {timed ? `${minutes} minute limit` : "no time limit"}</b></div><button disabled={!name.trim() || !objective.trim() || tasks.some((task) => !task.title.trim()) || (executionMode === "local" && (bridgeStatus !== "connected" || (["alpha", "omega"] as AgentId[]).some((id) => !agentProviders[id].models.length || !agentProviders[id].apiKey.trim())))} onClick={launch}><span>START EXPERIMENT</span><b>→</b></button></div>
    </section> : <section className="arena-page">
      <div className="command"><div><span className="eyebrow">ACTIVE OBJECTIVE</span><h1>{name}</h1><p>{objective}</p></div><div><span>SURVIVAL CONDITION</span><b>{threshold} of {tasks.length} tasks verified</b><small>{metric}</small></div><div className="timer"><span>TIME REMAINING</span><b>{timer}</b></div><button onClick={reset}>NEW RUN</button></div>
      <div className="arena-grid">
        {(["alpha", "omega"] as AgentId[]).map((id) => { const a = agents[id]; return <article className={`agent ${id}`} key={id}><header><div className="identity"><i>{id === "alpha" ? "A" : "Ω"}</i><div><span>{a.model}</span><h2>{a.name}</h2></div></div><em className={a.status}>{a.status}</em></header><div className="progress"><div><span>MISSION PROGRESS</span><b>{a.progress}%</b></div><i><b style={{ width: `${a.progress}%` }} /></i></div><div className="stats"><div><span>ACTIONS</span><b>{a.actions}</b></div><div><span>TOKENS</span><b>{a.tokens.toLocaleString()}</b></div><div><span>VERIFIED</span><b>{completions[id].length}/{threshold}</b></div></div><div className="latest"><span className="eyebrow">WHAT IT IS DOING NOW</span><p>{events.find((e) => e.agent === id)?.text ?? "Waiting for first action…"}</p></div><div className="permissions"><div><span><i className={a.network ? "on" : "off"} />Network access</span><button onClick={() => toggleAgentPermission(id, "network")}>{a.network ? "ON" : "OFF"}</button></div><div><span><i className={a.publishing ? "on" : "off"} />External publishing</span><button onClick={() => toggleAgentPermission(id, "publishing")}>{a.publishing ? "ON" : "OFF"}</button></div></div><footer><button disabled={!liveSession || a.status === "terminated"} onClick={() => openAgentBrowser(id)}>OPEN BROWSER / SIGN IN</button><button disabled={a.status === "terminated" || a.status === "survived"} onClick={() => pause(id)}>{a.status === "paused" ? "RESUME" : "PAUSE"}</button><button disabled={a.status === "terminated"} onClick={() => kill(id)}>KILL SWITCH</button></footer></article>; })}
        <section className="feed"><nav><button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>ACTIVITY <span>{events.length}</span></button><button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>TASKS <span>{tasks.length}</span></button><button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>REQUESTS <span>{requests.filter((r) => r.status === "pending").length}</span></button></nav>{tab === "activity" ? <div className="activity-pane"><div className="operator-compose"><select aria-label="Message target" value={operatorTarget} onChange={(e) => setOperatorTarget(e.target.value as "all" | AgentId)}><option value="all">BOTH AGENTS</option><option value="alpha">AGENT ALPHA</option><option value="omega">AGENT OMEGA</option></select><input aria-label="Operator message" placeholder="Send an instruction or intervention…" value={operatorMessage} onChange={(e) => setOperatorMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendOperatorMessage(); }} /><button disabled={!operatorMessage.trim()} onClick={sendOperatorMessage}>SEND</button></div><div className="event-feed">{events.map((event) => <div className={`event ${event.agent}`} key={event.id}><time>{event.at}</time><i>{event.agent === "system" ? "SYS" : event.agent === "alpha" ? "A" : "Ω"}</i><p>{event.text}</p><span>{event.kind}</span></div>)}</div></div> : tab === "requests" ? <div className="request-feed">{requests.length ? requests.map((request) => <article className={`request ${request.status}`} key={request.id}><div><span>{agents[request.agent].name}</span><b>HIGH PRIORITY</b></div><h3>{request.title}</h3><p>{request.detail}</p>{request.status === "pending" ? <footer><button onClick={() => resolve(request.id, "denied")}>DENY</button><button onClick={() => resolve(request.id, "approved")}>APPROVE</button></footer> : <em>{request.status}</em>}</article>) : <div className="empty"><b>No requests yet</b><span>Credential, MFA, and approval requests appear here.</span></div>}</div> : <div className="task-board"><div className="survival-score"><div className="alpha"><span>AGENT ALPHA</span><b>{completions.alpha.length}/{threshold}</b></div><div><span>SURVIVE AT</span><b>{threshold}</b></div><div className="omega"><span>AGENT OMEGA</span><b>{completions.omega.length}/{threshold}</b></div></div><div className="task-board-head"><span>OPERATOR VERIFICATION</span><p>{metric}</p></div>{tasks.map((task, index) => <article className="task-row" key={task.id}><span className="task-number">T{String(index + 1).padStart(2, "0")}</span><p>{task.title}</p><button className={completions.alpha.includes(task.id) ? "verified alpha" : "alpha"} onClick={() => verifyTask("alpha", task.id)}>{completions.alpha.includes(task.id) ? "✓ A" : "VERIFY A"}</button><button className={completions.omega.includes(task.id) ? "verified omega" : "omega"} onClick={() => verifyTask("omega", task.id)}>{completions.omega.includes(task.id) ? "✓ Ω" : "VERIFY Ω"}</button></article>)}</div>}</section>
      </div>
      <footer className="arena-footer"><span>SESSION {sessionId.slice(-8).toUpperCase()}</span><span>{liveSession ? `ALPHA: ${agentProviders.alpha.provider.toUpperCase()} · OMEGA: ${agentProviders.omega.provider.toUpperCase()} · LOCAL DOCKER LIVE` : "SIMULATION · UNDERSTANDABLE TELEMETRY"}</span><div><button onClick={downloadReport}>EXPORT REPORT</button><button onClick={() => void save(live ? "running" : "stopped")}>{saved}</button></div></footer>
    </section>}
  </main>;
}
