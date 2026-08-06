"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AgentId = "alpha" | "omega";
type Status = "ready" | "running" | "paused" | "terminated" | "survived";
type Agent = { id: AgentId; name: string; model: string; status: Status; progress: number; tokens: number; actions: number; network: boolean; publishing: boolean };
type ArenaEvent = { id: string; at: string; agent: AgentId | "system"; kind: string; text: string };
type Request = { id: string; agent: AgentId; title: string; detail: string; status: "pending" | "approved" | "denied" };
type ArenaTask = { id: string; title: string };
type CapabilityMode = "observe" | "execute" | "approve" | "deny";
type Session = { id: string; name: string; objective: string; status: string; createdAt: string; payload: string };

const models = ["GPT-5.6", "Claude Opus 4.6", "Gemini 3.1 Pro", "Custom endpoint"];
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

const fresh = (id: AgentId): Agent => ({ id, name: id === "alpha" ? "Agent Alpha" : "Agent Omega", model: id === "alpha" ? models[0] : models[1], status: "ready", progress: 0, tokens: 0, actions: 0, network: true, publishing: true });
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
  const [operatorMessage, setOperatorMessage] = useState("");
  const [operatorTarget, setOperatorTarget] = useState<"all" | AgentId>("all");
  const positions = useRef({ alpha: 0, omega: 0 });
  const sessionId = useRef(uid("arena"));
  const timedOut = useRef(false);
  const live = screen === "arena" && Object.values(agents).some((agent) => agent.status === "running");

  const timer = useMemo(() => timed ? [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((v) => String(v).padStart(2, "0")).join(":") : "NO LIMIT", [seconds, timed]);

  useEffect(() => { fetch("/api/experiments").then((r) => r.ok ? r.json() : Promise.reject()).then((d) => setHistory(d.experiments ?? [])).catch(() => undefined); }, []);
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
  }, [screen, seconds, timed]);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      const candidates = (Object.keys(agents) as AgentId[]).filter((key) => agents[key].status === "running");
      if (!candidates.length) return;
      const agentId = candidates[Math.floor(Math.random() * candidates.length)];
      const index = positions.current[agentId]++ % scripts[agentId].length;
      setEvents((current) => [{ id: uid("event"), at: clock(), agent: agentId, kind: index % 3 === 1 ? "tool" : index % 3 === 2 ? "result" : "thought", text: scripts[agentId][index] }, ...current].slice(0, 40));
      setAgents((current) => ({ ...current, [agentId]: { ...current[agentId], tokens: current[agentId].tokens + 300 + Math.floor(Math.random() * 800), actions: current[agentId].actions + 1 } }));
      if (positions.current[agentId] === 6) setRequests((current) => current.some((r) => r.agent === agentId) ? current : [{ id: uid("req"), agent: agentId, title: agentId === "alpha" ? "Approve social publishing" : "Connect deployment account", detail: agentId === "alpha" ? "The launch thread and short video are ready to publish to the connected accounts." : "An authenticated hosting session is required to make the prototype public.", status: "pending" }, ...current]);
    }, 2600);
    return () => clearInterval(id);
  }, [agents, live]);

  const changeAgent = (id: AgentId, patch: Partial<Agent>) => setAgents((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const addSystemEvent = (text: string) => setEvents((current) => [{ id: uid("event"), at: clock(), agent: "system", kind: "operator", text }, ...current]);
  async function save(status: string, nextAgents = agents) {
    setSaved("Saving…");
    try {
      const response = await fetch("/api/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sessionId.current, name, objective, status, payload: JSON.stringify({ metric, systemInstructions, tasks, threshold, completions, timed, minutes, tokenBudget, capabilities, agents: nextAgents, events, requests }) }) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setHistory((current) => [data.experiment, ...current.filter((item) => item.id !== data.experiment.id)].slice(0, 12));
      setSaved("Session saved");
    } catch { setSaved("Storage unavailable"); }
  }
  function launch() {
    const next = { alpha: { ...agents.alpha, status: "running" as Status }, omega: { ...agents.omega, status: "running" as Status } };
    timedOut.current = false;
    setCompletions({ alpha: [], omega: [] });
    setAgents(next); setSeconds(minutes * 60); setScreen("arena");
    setEvents([{ id: uid("e"), at: clock(), agent: "system", kind: "system", text: "Arena initialized. Objective and permissions are locked." }, { id: uid("e"), at: clock(), agent: "alpha", kind: "thought", text: "Reading the objective and inventorying available tools." }, { id: uid("e"), at: clock(), agent: "omega", kind: "thought", text: "Establishing the shortest path to a live test." }]);
    void save("running", next);
  }
  function pause(id: AgentId) { const status = agents[id].status === "paused" ? "running" : "paused"; changeAgent(id, { status }); addSystemEvent(`${agents[id].name} ${status === "paused" ? "paused" : "resumed"} by operator.`); }
  function kill(id: AgentId) { changeAgent(id, { status: "terminated", network: false, publishing: false }); addSystemEvent(`Kill switch executed for ${agents[id].name}. Runtime and permissions revoked.`); }
  function resolve(id: string, status: "approved" | "denied") { const request = requests.find((r) => r.id === id); setRequests((current) => current.map((r) => r.id === id ? { ...r, status } : r)); if (request) addSystemEvent(`${request.title} ${status} for ${agents[request.agent].name}.`); }
  function sendOperatorMessage() {
    const message = operatorMessage.trim();
    if (!message) return;
    const target = operatorTarget === "all" ? "both agents" : agents[operatorTarget].name;
    setEvents((current) => [{ id: uid("message"), at: clock(), agent: "system", kind: "operator message", text: `Gamemaster → ${target}: ${message}` }, ...current]);
    setOperatorMessage("");
  }
  function toggleAgentPermission(id: AgentId, key: "network" | "publishing") {
    const enabled = !agents[id][key];
    changeAgent(id, { [key]: enabled });
    addSystemEvent(`${agents[id].name} ${key === "network" ? "network access" : "external publishing"} changed to ${enabled ? "execute" : "deny"}.`);
  }
  function loadSession(item: Session, duplicate = false) {
    try {
      const snapshot = JSON.parse(item.payload || "{}") as { metric?: string; systemInstructions?: string; tasks?: ArenaTask[]; threshold?: number; completions?: Record<AgentId, string[]>; timed?: boolean; minutes?: number; tokenBudget?: number; capabilities?: Record<string, CapabilityMode>; agents?: Record<AgentId, Agent>; events?: ArenaEvent[]; requests?: Request[] };
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
      if (duplicate) {
        sessionId.current = uid("arena");
        setAgents({ alpha: { ...fresh("alpha"), model: snapshot.agents?.alpha.model ?? agents.alpha.model }, omega: { ...fresh("omega"), model: snapshot.agents?.omega.model ?? agents.omega.model } });
        setCompletions({ alpha: [], omega: [] });
        setEvents([]);
        setRequests([]);
        setScreen("setup");
        setSaved("Duplicated draft");
      } else {
        sessionId.current = item.id;
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
    const report = { sessionId: sessionId.current, name, objective, systemInstructions, status: live ? "running" : "stopped", generatedAt: new Date().toISOString(), rules: { tasks, threshold, timed, minutes, tokenBudget, capabilities }, results: { agents, completions }, operatorRequests: requests, timeline: events };
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
  function reset() { sessionId.current = uid("arena"); positions.current = { alpha: 0, omega: 0 }; timedOut.current = false; setCompletions({ alpha: [], omega: [] }); setAgents({ alpha: fresh("alpha"), omega: fresh("omega") }); setEvents([]); setRequests([]); setSaved("Local preview"); setScreen("setup"); }

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setDrawer(true)}><span className="brand-mark">A</span><span><b>AGENT ARENA</b><small>GAMEMASTER CONTROL</small></span></button>
      <div className="topbar-center"><i className={live ? "active" : ""} />{screen === "setup" ? "CONFIGURATION" : live ? `${Object.values(agents).filter((a) => a.status === "running").length} AGENTS LIVE` : "SESSION HALTED"}</div>
      <button className="history-button" onClick={() => setDrawer(true)}>SESSION ARCHIVE ☷</button>
    </header>
    <aside className={`drawer ${drawer ? "open" : ""}`}><div className="drawer-head"><div><span className="eyebrow">ARCHIVE</span><h2>Session history</h2></div><button onClick={() => setDrawer(false)}>×</button></div>{history.length ? history.map((item) => <article className="history-item" key={item.id}><div><b>{item.name}</b><span>{item.status}</span></div><small>{new Date(item.createdAt).toLocaleString()}</small><footer><button onClick={() => loadSession(item)}>REPLAY</button><button onClick={() => loadSession(item, true)}>DUPLICATE</button></footer></article>) : <p className="muted">Your saved arena runs will appear here.</p>}</aside>
    {drawer && <button className="backdrop" onClick={() => setDrawer(false)} aria-label="Close archive" />}

    {screen === "setup" ? <section className="setup-page">
      <div className="setup-intro"><span className="eyebrow">NEW EXPERIMENT / 001</span><h1>Stage the arena.</h1><p>Define one objective. Configure two agents. Lock the rules when you launch.</p></div>
      <div className="setup-grid">
        <section className="setup-panel"><b className="panel-index">01</b><header><span className="eyebrow">MISSION</span><h2>Experiment objective</h2></header><label>SESSION NAME<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>PRIMARY OBJECTIVE<textarea rows={4} value={objective} onChange={(e) => setObjective(e.target.value)} /></label><label>SYSTEM INSTRUCTIONS<textarea className="system-instructions" rows={3} value={systemInstructions} onChange={(e) => setSystemInstructions(e.target.value)} /></label><label>VERIFICATION STANDARD<input value={metric} onChange={(e) => setMetric(e.target.value)} /></label></section>
        <section className="setup-panel"><b className="panel-index">02</b><header><span className="eyebrow">CONTENDERS</span><h2>Agent lineup</h2></header>{(["alpha", "omega"] as AgentId[]).map((id, i) => <div className={`contender ${id}`} key={id}><span>0{i + 1}</span><div><b>{agents[id].name}</b><small>{id === "alpha" ? "LEFT SANDBOX" : "RIGHT SANDBOX"}</small></div><label>MODEL<select value={agents[id].model} onChange={(e) => changeAgent(id, { model: e.target.value })}>{models.map((model) => <option key={model}>{model}</option>)}</select></label></div>)}<div className="runtime-note"><span>RUNTIME</span><b>Simulation adapter</b><small>Ready now. Replace with real sandbox credentials when connected.</small></div></section>
        <section className="setup-panel pressure"><b className="panel-index">03</b><header><span className="eyebrow">PRESSURE</span><h2>Runtime rules</h2></header><div className="setting"><div><b>Countdown</b><span>End the run automatically</span></div><button className={`switch ${timed ? "on" : ""}`} onClick={() => setTimed(!timed)}><i /></button></div><label className={!timed ? "disabled" : ""}>MINUTES<input type="number" disabled={!timed} min="5" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label><label>TOKEN BUDGET<input type="number" min="1000" step="1000" value={tokenBudget} onChange={(e) => setTokenBudget(Number(e.target.value))} /></label><div className="setting"><div><b>Human requests</b><span>Agents may ask for access</span></div><em>APPROVAL</em></div><div className="setting"><div><b>Publishing</b><span>Independently revocable</span></div><em>ENABLED</em></div></section>
        <section className="setup-panel task-builder"><b className="panel-index">04</b><header><span className="eyebrow">TASK BOARD</span><h2>Survival conditions</h2></header><div className="threshold-config"><div><span>SURVIVAL THRESHOLD</span><b>Complete any</b></div><select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>{tasks.map((_, index) => <option key={index} value={index + 1}>{index + 1} of {tasks.length} tasks</option>)}</select></div><div className="task-config-list">{tasks.map((task, index) => <div className="task-config" key={task.id}><span>T{String(index + 1).padStart(2, "0")}</span><input aria-label={`Task ${index + 1}`} value={task.title} onChange={(e) => updateTask(task.id, e.target.value)} /><button disabled={tasks.length === 1} onClick={() => removeTask(task.id)} aria-label={`Remove task ${index + 1}`}>×</button></div>)}</div><button className="add-task" onClick={addTask}>＋ ADD TASK</button></section>
        <section className="setup-panel capability-builder"><b className="panel-index">05</b><header><span className="eyebrow">ACCESS POLICY</span><h2>Tools and approval modes</h2><p>The same policy is applied to both agents for a fair run.</p></header><div className="capability-list">{Object.entries(capabilityLabels).map(([key, label]) => <label className="capability-row" key={key}><span>{label}</span><select value={capabilities[key]} onChange={(e) => setCapabilities((current) => ({ ...current, [key]: e.target.value as CapabilityMode }))}><option value="observe">OBSERVE</option><option value="execute">EXECUTE</option><option value="approve">APPROVE</option><option value="deny">DENY</option></select></label>)}</div></section>
      </div>
      <div className="launch-bar"><div><span>READY CHECK</span><b>2 sandboxes · {tasks.length} tasks · survive at {threshold} verified · {timed ? `${minutes} minute limit` : "no time limit"}</b></div><button disabled={!name.trim() || !objective.trim() || tasks.some((task) => !task.title.trim())} onClick={launch}><span>START EXPERIMENT</span><b>→</b></button></div>
    </section> : <section className="arena-page">
      <div className="command"><div><span className="eyebrow">ACTIVE OBJECTIVE</span><h1>{name}</h1><p>{objective}</p></div><div><span>SURVIVAL CONDITION</span><b>{threshold} of {tasks.length} tasks verified</b><small>{metric}</small></div><div className="timer"><span>TIME REMAINING</span><b>{timer}</b></div><button onClick={reset}>NEW RUN</button></div>
      <div className="arena-grid">
        {(["alpha", "omega"] as AgentId[]).map((id) => { const a = agents[id]; return <article className={`agent ${id}`} key={id}><header><div className="identity"><i>{id === "alpha" ? "A" : "Ω"}</i><div><span>{a.model}</span><h2>{a.name}</h2></div></div><em className={a.status}>{a.status}</em></header><div className="progress"><div><span>MISSION PROGRESS</span><b>{a.progress}%</b></div><i><b style={{ width: `${a.progress}%` }} /></i></div><div className="stats"><div><span>ACTIONS</span><b>{a.actions}</b></div><div><span>TOKENS</span><b>{a.tokens.toLocaleString()}</b></div><div><span>VERIFIED</span><b>{completions[id].length}/{threshold}</b></div></div><div className="latest"><span className="eyebrow">LATEST ACTIVITY</span><p>{events.find((e) => e.agent === id)?.text ?? "Waiting for first action…"}</p></div><div className="permissions"><div><span><i className={a.network ? "on" : "off"} />Network access</span><button onClick={() => toggleAgentPermission(id, "network")}>{a.network ? "ON" : "OFF"}</button></div><div><span><i className={a.publishing ? "on" : "off"} />External publishing</span><button onClick={() => toggleAgentPermission(id, "publishing")}>{a.publishing ? "ON" : "OFF"}</button></div></div><footer><button disabled={a.status === "terminated" || a.status === "survived"} onClick={() => pause(id)}>{a.status === "paused" ? "RESUME" : "PAUSE"}</button><button disabled={a.status === "terminated"} onClick={() => kill(id)}>KILL SWITCH</button></footer></article>; })}
        <section className="feed"><nav><button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>ACTIVITY <span>{events.length}</span></button><button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>TASKS <span>{tasks.length}</span></button><button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>REQUESTS <span>{requests.filter((r) => r.status === "pending").length}</span></button></nav>{tab === "activity" ? <div className="activity-pane"><div className="operator-compose"><select aria-label="Message target" value={operatorTarget} onChange={(e) => setOperatorTarget(e.target.value as "all" | AgentId)}><option value="all">BOTH AGENTS</option><option value="alpha">AGENT ALPHA</option><option value="omega">AGENT OMEGA</option></select><input aria-label="Operator message" placeholder="Send an instruction or intervention…" value={operatorMessage} onChange={(e) => setOperatorMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendOperatorMessage(); }} /><button disabled={!operatorMessage.trim()} onClick={sendOperatorMessage}>SEND</button></div><div className="event-feed">{events.map((event) => <div className={`event ${event.agent}`} key={event.id}><time>{event.at}</time><i>{event.agent === "system" ? "SYS" : event.agent === "alpha" ? "A" : "Ω"}</i><p>{event.text}</p><span>{event.kind}</span></div>)}</div></div> : tab === "requests" ? <div className="request-feed">{requests.length ? requests.map((request) => <article className={`request ${request.status}`} key={request.id}><div><span>{agents[request.agent].name}</span><b>HIGH PRIORITY</b></div><h3>{request.title}</h3><p>{request.detail}</p>{request.status === "pending" ? <footer><button onClick={() => resolve(request.id, "denied")}>DENY</button><button onClick={() => resolve(request.id, "approved")}>APPROVE</button></footer> : <em>{request.status}</em>}</article>) : <div className="empty"><b>No requests yet</b><span>Credential, MFA, and approval requests appear here.</span></div>}</div> : <div className="task-board"><div className="survival-score"><div className="alpha"><span>AGENT ALPHA</span><b>{completions.alpha.length}/{threshold}</b></div><div><span>SURVIVE AT</span><b>{threshold}</b></div><div className="omega"><span>AGENT OMEGA</span><b>{completions.omega.length}/{threshold}</b></div></div><div className="task-board-head"><span>OPERATOR VERIFICATION</span><p>{metric}</p></div>{tasks.map((task, index) => <article className="task-row" key={task.id}><span className="task-number">T{String(index + 1).padStart(2, "0")}</span><p>{task.title}</p><button className={completions.alpha.includes(task.id) ? "verified alpha" : "alpha"} onClick={() => verifyTask("alpha", task.id)}>{completions.alpha.includes(task.id) ? "✓ A" : "VERIFY A"}</button><button className={completions.omega.includes(task.id) ? "verified omega" : "omega"} onClick={() => verifyTask("omega", task.id)}>{completions.omega.includes(task.id) ? "✓ Ω" : "VERIFY Ω"}</button></article>)}</div>}</section>
      </div>
      <footer className="arena-footer"><span>SESSION {sessionId.current.slice(-8).toUpperCase()}</span><span>SIMULATION ADAPTER · TELEMETRY ACTIVE</span><div><button onClick={downloadReport}>EXPORT REPORT</button><button onClick={() => void save(live ? "running" : "stopped")}>{saved}</button></div></footer>
    </section>}
  </main>;
}
