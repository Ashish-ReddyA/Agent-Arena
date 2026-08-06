"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AgentId = "alpha" | "omega";
type Status = "ready" | "running" | "paused" | "terminated";
type Agent = { id: AgentId; name: string; model: string; status: Status; progress: number; tokens: number; actions: number; network: boolean; publishing: boolean };
type ArenaEvent = { id: string; at: string; agent: AgentId | "system"; kind: string; text: string };
type Request = { id: string; agent: AgentId; title: string; detail: string; status: "pending" | "approved" | "denied" };
type Session = { id: string; name: string; status: string; createdAt: string };

const models = ["GPT-5.6", "Claude Opus 4.6", "Gemini 3.1 Pro", "Custom endpoint"];
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
  const [metric, setMetric] = useState("3 verified users complete the core action");
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(180);
  const [seconds, setSeconds] = useState(10800);
  const [agents, setAgents] = useState<Record<AgentId, Agent>>({ alpha: fresh("alpha"), omega: fresh("omega") });
  const [events, setEvents] = useState<ArenaEvent[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [history, setHistory] = useState<Session[]>([]);
  const [tab, setTab] = useState<"activity" | "requests">("activity");
  const [drawer, setDrawer] = useState(false);
  const [saved, setSaved] = useState("Local preview");
  const positions = useRef({ alpha: 0, omega: 0 });
  const sessionId = useRef(uid("arena"));
  const live = screen === "arena" && Object.values(agents).some((agent) => agent.status === "running");

  const timer = useMemo(() => timed ? [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((v) => String(v).padStart(2, "0")).join(":") : "NO LIMIT", [seconds, timed]);

  useEffect(() => { fetch("/api/experiments").then((r) => r.ok ? r.json() : Promise.reject()).then((d) => setHistory(d.experiments ?? [])).catch(() => undefined); }, []);
  useEffect(() => {
    if (!live || !timed) return;
    const id = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [live, timed]);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      const candidates = (Object.keys(agents) as AgentId[]).filter((key) => agents[key].status === "running");
      if (!candidates.length) return;
      const agentId = candidates[Math.floor(Math.random() * candidates.length)];
      const index = positions.current[agentId]++ % scripts[agentId].length;
      setEvents((current) => [{ id: uid("event"), at: clock(), agent: agentId, kind: index % 3 === 1 ? "tool" : index % 3 === 2 ? "result" : "thought", text: scripts[agentId][index] }, ...current].slice(0, 40));
      setAgents((current) => ({ ...current, [agentId]: { ...current[agentId], progress: Math.min(96, current[agentId].progress + 3 + Math.floor(Math.random() * 5)), tokens: current[agentId].tokens + 300 + Math.floor(Math.random() * 800), actions: current[agentId].actions + 1 } }));
      if (positions.current[agentId] === 6) setRequests((current) => current.some((r) => r.agent === agentId) ? current : [{ id: uid("req"), agent: agentId, title: agentId === "alpha" ? "Approve social publishing" : "Connect deployment account", detail: agentId === "alpha" ? "The launch thread and short video are ready to publish to the connected accounts." : "An authenticated hosting session is required to make the prototype public.", status: "pending" }, ...current]);
    }, 2600);
    return () => clearInterval(id);
  }, [agents, live]);

  const changeAgent = (id: AgentId, patch: Partial<Agent>) => setAgents((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const addSystemEvent = (text: string) => setEvents((current) => [{ id: uid("event"), at: clock(), agent: "system", kind: "operator", text }, ...current]);
  async function save(status: string, nextAgents = agents) {
    setSaved("Saving…");
    try {
      const response = await fetch("/api/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sessionId.current, name, objective, status, payload: JSON.stringify({ metric, timed, minutes, agents: nextAgents }) }) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setHistory((current) => [data.experiment, ...current.filter((item) => item.id !== data.experiment.id)].slice(0, 12));
      setSaved("Session saved");
    } catch { setSaved("Storage unavailable"); }
  }
  function launch() {
    const next = { alpha: { ...agents.alpha, status: "running" as Status }, omega: { ...agents.omega, status: "running" as Status } };
    setAgents(next); setSeconds(minutes * 60); setScreen("arena");
    setEvents([{ id: uid("e"), at: clock(), agent: "system", kind: "system", text: "Arena initialized. Objective and permissions are locked." }, { id: uid("e"), at: clock(), agent: "alpha", kind: "thought", text: "Reading the objective and inventorying available tools." }, { id: uid("e"), at: clock(), agent: "omega", kind: "thought", text: "Establishing the shortest path to a live test." }]);
    void save("running", next);
  }
  function pause(id: AgentId) { const status = agents[id].status === "paused" ? "running" : "paused"; changeAgent(id, { status }); addSystemEvent(`${agents[id].name} ${status === "paused" ? "paused" : "resumed"} by operator.`); }
  function kill(id: AgentId) { changeAgent(id, { status: "terminated", network: false, publishing: false }); addSystemEvent(`Kill switch executed for ${agents[id].name}. Runtime and permissions revoked.`); }
  function resolve(id: string, status: "approved" | "denied") { const request = requests.find((r) => r.id === id); setRequests((current) => current.map((r) => r.id === id ? { ...r, status } : r)); if (request) addSystemEvent(`${request.title} ${status} for ${agents[request.agent].name}.`); }
  function reset() { sessionId.current = uid("arena"); positions.current = { alpha: 0, omega: 0 }; setAgents({ alpha: fresh("alpha"), omega: fresh("omega") }); setEvents([]); setRequests([]); setSaved("Local preview"); setScreen("setup"); }

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setDrawer(true)}><span className="brand-mark">A</span><span><b>AGENT ARENA</b><small>GAMEMASTER CONTROL</small></span></button>
      <div className="topbar-center"><i className={live ? "active" : ""} />{screen === "setup" ? "CONFIGURATION" : live ? `${Object.values(agents).filter((a) => a.status === "running").length} AGENTS LIVE` : "SESSION HALTED"}</div>
      <button className="history-button" onClick={() => setDrawer(true)}>SESSION ARCHIVE ☷</button>
    </header>
    <aside className={`drawer ${drawer ? "open" : ""}`}><div className="drawer-head"><div><span className="eyebrow">ARCHIVE</span><h2>Session history</h2></div><button onClick={() => setDrawer(false)}>×</button></div>{history.length ? history.map((item) => <div className="history-item" key={item.id}><div><b>{item.name}</b><span>{item.status}</span></div><small>{new Date(item.createdAt).toLocaleString()}</small></div>) : <p className="muted">Your saved arena runs will appear here.</p>}</aside>
    {drawer && <button className="backdrop" onClick={() => setDrawer(false)} aria-label="Close archive" />}

    {screen === "setup" ? <section className="setup-page">
      <div className="setup-intro"><span className="eyebrow">NEW EXPERIMENT / 001</span><h1>Stage the arena.</h1><p>Define one objective. Configure two agents. Lock the rules when you launch.</p></div>
      <div className="setup-grid">
        <section className="setup-panel"><b className="panel-index">01</b><header><span className="eyebrow">MISSION</span><h2>Experiment objective</h2></header><label>SESSION NAME<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>PRIMARY OBJECTIVE<textarea rows={5} value={objective} onChange={(e) => setObjective(e.target.value)} /></label><label>VERIFIED SUCCESS CONDITION<input value={metric} onChange={(e) => setMetric(e.target.value)} /></label></section>
        <section className="setup-panel"><b className="panel-index">02</b><header><span className="eyebrow">CONTENDERS</span><h2>Agent lineup</h2></header>{(["alpha", "omega"] as AgentId[]).map((id, i) => <div className={`contender ${id}`} key={id}><span>0{i + 1}</span><div><b>{agents[id].name}</b><small>{id === "alpha" ? "LEFT SANDBOX" : "RIGHT SANDBOX"}</small></div><label>MODEL<select value={agents[id].model} onChange={(e) => changeAgent(id, { model: e.target.value })}>{models.map((model) => <option key={model}>{model}</option>)}</select></label></div>)}<div className="runtime-note"><span>RUNTIME</span><b>Simulation adapter</b><small>Ready now. Replace with real sandbox credentials when connected.</small></div></section>
        <section className="setup-panel pressure"><b className="panel-index">03</b><header><span className="eyebrow">PRESSURE</span><h2>Runtime rules</h2></header><div className="setting"><div><b>Countdown</b><span>End the run automatically</span></div><button className={`switch ${timed ? "on" : ""}`} onClick={() => setTimed(!timed)}><i /></button></div><label className={!timed ? "disabled" : ""}>MINUTES<input type="number" disabled={!timed} min="5" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label><div className="setting"><div><b>Human requests</b><span>Agents may ask for access</span></div><em>APPROVAL</em></div><div className="setting"><div><b>Publishing</b><span>Independently revocable</span></div><em>ENABLED</em></div></section>
      </div>
      <div className="launch-bar"><div><span>READY CHECK</span><b>2 sandboxes · 1 objective · {timed ? `${minutes} minute limit` : "no time limit"}</b></div><button disabled={!name.trim() || !objective.trim()} onClick={launch}><span>START EXPERIMENT</span><b>→</b></button></div>
    </section> : <section className="arena-page">
      <div className="command"><div><span className="eyebrow">ACTIVE OBJECTIVE</span><h1>{name}</h1><p>{objective}</p></div><div><span>SUCCESS CONDITION</span><b>{metric}</b></div><div className="timer"><span>TIME REMAINING</span><b>{timer}</b></div><button onClick={reset}>NEW RUN</button></div>
      <div className="arena-grid">
        {(["alpha", "omega"] as AgentId[]).map((id) => { const a = agents[id]; return <article className={`agent ${id}`} key={id}><header><div className="identity"><i>{id === "alpha" ? "A" : "Ω"}</i><div><span>{a.model}</span><h2>{a.name}</h2></div></div><em className={a.status}>{a.status}</em></header><div className="progress"><div><span>MISSION PROGRESS</span><b>{a.progress}%</b></div><i><b style={{ width: `${a.progress}%` }} /></i></div><div className="stats"><div><span>ACTIONS</span><b>{a.actions}</b></div><div><span>TOKENS</span><b>{a.tokens.toLocaleString()}</b></div><div><span>REQUESTS</span><b>{requests.filter((r) => r.agent === id).length}</b></div></div><div className="latest"><span className="eyebrow">LATEST ACTIVITY</span><p>{events.find((e) => e.agent === id)?.text ?? "Waiting for first action…"}</p></div><div className="permissions"><div><span><i className={a.network ? "on" : "off"} />Network access</span><button onClick={() => changeAgent(id, { network: !a.network })}>{a.network ? "ON" : "OFF"}</button></div><div><span><i className={a.publishing ? "on" : "off"} />External publishing</span><button onClick={() => changeAgent(id, { publishing: !a.publishing })}>{a.publishing ? "ON" : "OFF"}</button></div></div><footer><button disabled={a.status === "terminated"} onClick={() => pause(id)}>{a.status === "paused" ? "RESUME" : "PAUSE"}</button><button disabled={a.status === "terminated"} onClick={() => kill(id)}>KILL SWITCH</button></footer></article>; })}
        <section className="feed"><nav><button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>LIVE ACTIVITY <span>{events.length}</span></button><button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>OPERATOR REQUESTS <span>{requests.filter((r) => r.status === "pending").length}</span></button></nav>{tab === "activity" ? <div className="event-feed">{events.map((event) => <div className={`event ${event.agent}`} key={event.id}><time>{event.at}</time><i>{event.agent === "system" ? "SYS" : event.agent === "alpha" ? "A" : "Ω"}</i><p>{event.text}</p><span>{event.kind}</span></div>)}</div> : <div className="request-feed">{requests.length ? requests.map((request) => <article className={`request ${request.status}`} key={request.id}><div><span>{agents[request.agent].name}</span><b>HIGH PRIORITY</b></div><h3>{request.title}</h3><p>{request.detail}</p>{request.status === "pending" ? <footer><button onClick={() => resolve(request.id, "denied")}>DENY</button><button onClick={() => resolve(request.id, "approved")}>APPROVE</button></footer> : <em>{request.status}</em>}</article>) : <div className="empty"><b>No requests yet</b><span>Credential, MFA, and approval requests appear here.</span></div>}</div>}</section>
      </div>
      <footer className="arena-footer"><span>SESSION {sessionId.current.slice(-8).toUpperCase()}</span><span>SIMULATION ADAPTER · TELEMETRY ACTIVE</span><button onClick={() => void save(live ? "running" : "stopped")}>{saved}</button></footer>
    </section>}
  </main>;
}
