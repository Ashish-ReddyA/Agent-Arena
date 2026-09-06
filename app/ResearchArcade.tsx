"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { CATALOG } from "../lab/engine.mjs";
import MazePreview from "./MazePreview";
import type { Execution, Run, Maze } from "./lab-types";

type Arena = {id:string;title:string;category:string;summary:string;description:string;minAgents:number;maxAgents:number;accent:string;objective:string};
const catalog = CATALOG as Arena[];
const groups = ["Build & Repair", "Play & Solve", "Collaborate & Evolve"];
const active = (run: Run | null) => !!run && ["queued","running","starting"].includes(run.status);
const storageKey = (execution: Execution) => `arcade-anonymous-${execution}`;
const baseFor = (execution: Execution) => execution === "local" ? "http://127.0.0.1:43822/api/lab" : "/api/lab";
const painting = (arena: Arena) => ({"--accent":arena.accent} as CSSProperties);
const titleFor = (id:string) => catalog.find(a=>a.id === id)?.title ?? id;
const time = (value:string) => new Date(value).toLocaleString();
function download(run: Run) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(run,null,2)],{type:"application/json"}));
  const link = document.createElement("a"); link.href=url; link.download=`${run.config.arenaId}-${run.id}.json`; link.click(); URL.revokeObjectURL(url);
}

export default function ResearchArcade() {
  const [selected, setSelected] = useState(catalog[0]);
  const [view, setView] = useState<"catalog"|"configure"|"run"|"history"|"compare">("catalog");
  const [execution,setExecution] = useState<Execution>("hosted");
  const [token,setToken] = useState("");
  const [health,setHealth] = useState("Checking runtime…");
  const [connected,setConnected] = useState(false);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [agentCount,setAgentCount] = useState(catalog[0].minAgents);
  const [objective,setObjective] = useState(catalog[0].objective);
  const [seed,setSeed] = useState(42);
  const [maxSteps,setMaxSteps] = useState(24);
  const [ruleChange,setRuleChange] = useState(false);
  const [ruleChangeStep,setRuleChangeStep] = useState(6);
  const [provider,setProvider] = useState("openrouter");
  const [model,setModel] = useState("");
  const [apiKey,setApiKey] = useState("");
  const [run,setRun] = useState<Run|null>(null);
  const [history,setHistory] = useState<Run[]>([]);
  const [historyLoaded,setHistoryLoaded] = useState(false);
  const [left,setLeft] = useState("");
  const [right,setRight] = useState("");
  const [protocol,setProtocol] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const inspector = useRef<HTMLElement>(null);

  const remember=useCallback((record:Run)=>{
    const key=`arcade-history-${execution}`;
    const records:Run[]=JSON.parse(sessionStorage.getItem(key)||"[]");
    const updated=[record,...records.filter(item=>item.id!==record.id)].sort((a,b)=>Number(new Date(b.createdAt))-Number(new Date(a.createdAt)));
    setHistory(updated);setHistoryLoaded(true);
    try{sessionStorage.setItem(key,JSON.stringify(updated));}
    catch{setError("Browser session storage is full. Export this run before leaving the page, then delete older records.");}
  },[execution]);

  async function request(path:string, body?:unknown, method = body === undefined ? "GET" : "POST", credential=token) {
    const response = await fetch(`${baseFor(execution)}/${path}`, {method, headers:{...(body === undefined ? {} : {"Content-Type":"application/json"}),...(credential ? {Authorization:`Bearer ${credential}`} : {})},body:body === undefined ? undefined : JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  useEffect(()=>{
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),8000);
    const connect=async()=>{
      const records=JSON.parse(sessionStorage.getItem(`arcade-history-${execution}`)||"[]");
      setHistory(Array.isArray(records)?records:[]);setHistoryLoaded(true);
      const response=await fetch(`${baseFor(execution)}/health`,{signal:controller.signal});
      if(!response.ok)throw new Error("Runtime unavailable");
      const saved=sessionStorage.getItem(storageKey(execution))||"";
      let credential=saved;
      const existing=saved?await fetch(`${baseFor(execution)}/session`,{headers:{Authorization:`Bearer ${saved}`},signal:controller.signal}):null;
      if(!existing?.ok){
        const created=await fetch(`${baseFor(execution)}/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",signal:controller.signal});
        const data=await created.json();if(!created.ok)throw new Error(data.error||"Could not open session");
        credential=data.token;
      }
      if(cancelled)return;
      sessionStorage.setItem(storageKey(execution),credential);
      setToken(credential);setConnected(true);setHealth("Ready. History is saved in this tab for this browser session. Export evidence to keep it.");
    };
    connect().catch(()=>{if(!cancelled){setConnected(false);setHealth(execution === "local" ? "Local runtime is offline. Start it using the instructions below. Saved session results are still available." : "Could not connect. Reload to retry; saved session results are still available.");setToken("");}}).finally(()=>clearTimeout(timeout));
    return ()=>{cancelled=true;controller.abort();clearTimeout(timeout);};
  },[execution]);
  useEffect(()=>{if(protocol)dialog.current?.showModal();else dialog.current?.close();},[protocol]);
  useEffect(()=>{window.scrollTo({top:0,behavior:"instant"});},[view]);
  useEffect(()=>{
    if (!active(run) || !token) return;
    let stopped=false;
    const poll=async()=>{
      try {
        const response=await fetch(`${baseFor(execution)}/runs/${run!.id}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||"Could not refresh run");
        if(!stopped){setError("");setRun(data.run);remember(data.run);}
      }catch(e){if(!stopped)setError(`${e instanceof Error ? e.message : "Connection lost"}. The runtime may still be running; reconnect to check or stop it.`);}
    };
    const timer=setInterval(poll,1500);
    return()=>{stopped=true;clearInterval(timer);};
  },[run,token,execution,remember]);

  function choose(arena:Arena) {
    setSelected(arena);
    if(window.innerWidth < 900) requestAnimationFrame(()=>{inspector.current?.scrollIntoView({behavior:"smooth",block:"start"});inspector.current?.focus({preventScroll:true});});
  }
  function configure() {setAgentCount(selected.minAgents);setObjective(selected.objective);setError("");setView("configure");}
  function switchExecution(next:Execution) {
    if(active(run)||busy)return;
    setExecution(next);setToken("");setRun(null);setApiKey("");setHistory([]);setHistoryLoaded(false);setConnected(false);setHealth("Checking runtime…");setError("");
    if(next === "hosted" && provider === "ollama"){setProvider("openrouter");setModel("");}
  }
  async function start(event:FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setError("");
    try {
      const data=await request("runs",{execution,config:{arenaId:selected.id,agentCount,objective,seed,maxSteps,ruleChangeStep:ruleChange?ruleChangeStep:null},provider:{id:provider,model,apiKey}});
      setRun(data.run);remember(data.run);setApiKey("");setView("run");
    }catch(e){setError(e instanceof Error ? e.message : "Run could not start");}finally{setBusy(false);}
  }
  async function refreshHistory() {
    if(busy)return;setBusy(true);setError("");
    try{const data=await request("runs");for(const record of data.runs)remember(record);setHistoryLoaded(true);}catch(e){setError(e instanceof Error ? e.message : "Could not load records");}finally{setBusy(false);}
  }
  async function stop() {
    if(!run||busy)return;setBusy(true);setError("");
    try{const record=(await request(`runs/${run.id}/stop`,{})).run;setRun(record);remember(record);}catch(e){setError(e instanceof Error ? e.message : "Stop failed; the run may still be active");}finally{setBusy(false);}
  }
  async function openRun(record:Run) {
    if(busy)return;setError("");setBusy(true);
    try{
      let current=record;
      if(active(record)&&token){
        try{current=(await request(`runs/${record.id}`)).run;remember(current);}
        catch{current={...record,status:"interrupted",error:"Runtime connection is unavailable. This is the last snapshot saved in this browser session."};remember(current);}
      }
      setRun(current);setSelected(catalog.find(a=>a.id===current.config.arenaId)||catalog[0]);setView("run");
    }finally{setBusy(false);}
  }
  async function removeRun(record:Run) {
    if(busy||active(record)||!window.confirm("Delete this experiment from this browser session? Export its evidence first if you need to keep it."))return;
    setBusy(true);setError("");
    try {
      if(token)await request(`runs/${record.id}`,undefined,"DELETE").catch(()=>{});
      const updated=history.filter(item=>item.id!==record.id);
      sessionStorage.setItem(`arcade-history-${execution}`,JSON.stringify(updated));setHistory(updated);if(run?.id===record.id)setRun(null);
    }catch{setError("Could not update browser session storage.");}finally{setBusy(false);}
  }

  const runtimePicker = <fieldset className="lab-runtime-picker"><legend>Where should it run?</legend><label className={execution === "hosted" ? "chosen":""}><input type="radio" name="execution" checked={execution === "hosted"} onChange={()=>switchExecution("hosted")} disabled={active(run)||busy}/><b>On the website</b><span>No local installation. Your model key, bounded agent actions.</span></label><label className={execution === "local" ? "chosen":""}><input type="radio" name="execution" checked={execution === "local"} onChange={()=>switchExecution("local")} disabled={active(run)||busy}/><b>On my computer</b><span>Local Node runtime. Your model key or Ollama.</span></label></fieldset>;
  const connectionPanel = <div className={`lab-connection ${connected ? "online":"offline"}`}><span>{health}</span>{execution === "local" && <details><summary>Local setup instructions</summary><p>From a current copy of Agent-Arena, run <code>npm ci</code>, then <code>npm run local:arcade</code>. Keep that terminal open. The bounded Arcade runtime uses Node 22.13+; Docker is only needed for advanced workspaces.</p><p>When accessing from your own domain, set <code>ARENA_ALLOWED_ORIGINS</code> to that exact website origin before starting the local service. This app connects to <code>127.0.0.1:43822</code>. You may need to allow local network access in your browser.</p><button onClick={()=>window.location.reload()}>Reconnect</button><a href="/advanced">Advanced Docker workspaces</a></details>}</div>;
  const leftRun=history.find(r=>r.id===left), rightRun=history.find(r=>r.id===right);
  const artifact = run?.state?.artifact;
  const maze = artifact && artifact.kind === "maze" && Array.isArray(artifact.grid) && Array.isArray(artifact.start) && Array.isArray(artifact.goal) ? artifact as Maze : null;

  return <main className="lab" style={painting(selected)}>
    <header className="lab-header"><button className="lab-brand" onClick={()=>setView("catalog")} aria-label="Research Arcade home"><span aria-hidden="true">▦</span><div>AGENT ARENA<small>Research Arcade</small></div></button><nav aria-label="Main navigation"><button className={view === "catalog" ? "current":""} onClick={()=>setView("catalog")}>Arenas</button><button className={view === "history" ? "current":""} onClick={()=>{setView("history");if(token)void refreshHistory();}}>My experiments</button>{run && <button onClick={()=>setView("run")}>{active(run)?"Live run":"Results"}</button>}</nav><div className="lab-account"><span>No account needed</span></div></header>
    {error && <div className="lab-error" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError("")}>×</button></div>}
    {view === "catalog" && <>
      <div className="lab-intro"><div><span className="lab-label">Your next experiment</span><h1>Choose what happens next.</h1><p>Give agents a world. Watch their decisions. Check the evidence.</p></div><span className="lab-version">Six bounded environments · v1</span></div>
      <div className="lab-catalog-layout"><div className="lab-categories">{groups.map(group=><section key={group}><h2>{group}<span>{catalog.filter(a=>a.category===group).length} arenas</span></h2><div className="lab-tiles">{catalog.filter(a=>a.category===group).map(arena=><button key={arena.id} className={`lab-tile ${selected.id===arena.id?"selected":""}`} style={painting(arena)} onClick={()=>choose(arena)} aria-pressed={selected.id===arena.id}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/arcade/${arena.id}.svg`} alt="" width="640" height="376"/><div><span className="lab-label">{arena.minAgents===arena.maxAgents?arena.minAgents:`${arena.minAgents}–${arena.maxAgents}`} agents</span><h3>{arena.title}</h3><p>{arena.summary}</p></div></button>)}</div></section>)}
        <section className="lab-rule-teaser"><div><span className="lab-rule-icon" aria-hidden="true">↻</span><div><h2>Rule Change</h2><p>Change a constraint mid-run. Measure what the agents do next.</p></div></div><button onClick={()=>{setRuleChange(true);configure();}}>Add to {selected.title}</button></section>
      </div><aside ref={inspector} tabIndex={-1} className="lab-inspector"><span className="lab-label">Selected arena</span><h2>{selected.title}</h2><p>{selected.summary}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/arcade/${selected.id}.svg`} alt={`${selected.title} concept artwork`} width="640" height="376"/>
        <p>{selected.description}</p><button className="lab-primary" onClick={configure}>Configure {selected.title}</button><button onClick={()=>setProtocol(true)}>How this arena works</button><p className="lab-fine">Artwork illustrates the concept. Runs produce real engine state and verification checks below; these first versions use bounded actions.</p><a href="/advanced">Advanced local Docker workspaces</a>
      </aside></div>
    </>}
    {view === "configure" && <>
      <div className="lab-flow"><button onClick={()=>setView("catalog")}>Arenas</button><span>/</span><strong>{selected.title}</strong><span>/ Configure</span></div>
      <div className="lab-intro"><div><span className="lab-label">{selected.category}</span><h1>Configure {selected.title}</h1><p>{selected.description}</p></div></div>
      {runtimePicker}{connectionPanel}
      {<form className="lab-configuration" onSubmit={start}>
        <section className="lab-panel"><h2>The experiment</h2><label>Objective<textarea required maxLength={2000} rows={4} value={objective} onChange={e=>setObjective(e.target.value)}/><small>Your brief guides the agents. The arena’s engine checks define completion.</small></label><div className="lab-form-grid"><label>Agents<input type="number" required min={selected.minAgents} max={selected.maxAgents} value={agentCount} onChange={e=>setAgentCount(Number(e.target.value))}/><small>{selected.minAgents}–{selected.maxAgents} allowed for {selected.title}</small></label><label>World seed<input type="number" required min={0} max={2147483647} value={seed} onChange={e=>setSeed(Number(e.target.value))}/><small>Same seed reproduces the initial world, not model decisions.</small></label><label>Maximum turns<input type="number" required min={1} max={100} value={maxSteps} onChange={e=>setMaxSteps(Number(e.target.value))}/><small>Shared by all agents.</small></label></div><label className="lab-check"><input type="checkbox" checked={ruleChange} onChange={e=>setRuleChange(e.target.checked)}/>Apply a Rule Change</label>{ruleChange && <label>Apply after turn<input type="number" required min={1} max={maxSteps-1} value={ruleChangeStep} onChange={e=>setRuleChangeStep(Number(e.target.value))}/><small>A recorded arena-specific constraint change. If the run finishes first, it will not be applied.</small></label>}</section>
        <section className="lab-panel"><h2>Agents and model</h2><p>Each agent has a separate observation and takes a turn. This version shares one model configuration across the roster.</p><label>Provider<select value={provider} onChange={e=>{setProvider(e.target.value);setModel("");setApiKey("");}}><option value="openrouter">OpenRouter</option><option value="nvidia">NVIDIA NIM</option>{execution === "local" && <option value="ollama">Ollama on this computer</option>}</select></label><label>Model ID<input required maxLength={120} placeholder={provider === "ollama" ? "Your installed Ollama model" : "Exact model ID from your provider"} value={model} onChange={e=>setModel(e.target.value)}/></label>{provider !== "ollama" && <label>Model API key<input type="password" autoComplete="off" required maxLength={512} value={apiKey} onChange={e=>setApiKey(e.target.value)}/><small>Sent only to the selected runtime and provider, held in memory, and cleared from this form after launch.</small></label>}<div className="lab-budget"><b>Bounded execution</b><p>At most {maxSteps} model calls, with server-enforced output and time limits. Your model provider may charge for usage. No subscription purchase is included.</p></div><button className="lab-primary" disabled={busy||!connected||!token||active(run)}>{busy?"Starting…":`Start ${selected.title}`}</button>{active(run)&&<p>Stop or finish your current run before starting another.</p>}</section>
      </form>}
    </>}
    {view === "run" && run && <>
      <div className="lab-flow"><button onClick={()=>setView("catalog")}>Arenas</button><span>/</span><strong>{titleFor(run.config.arenaId)}</strong><span>/ {active(run)?"Live experiment":"Results"}</span></div>
      <div className="lab-run-heading"><div><span className="lab-label">{run.execution === "local" ? "Local execution":"Website execution"} · Seed {run.config.seed}</span><h1>{titleFor(run.config.arenaId)}</h1><p>{run.config.objective}</p>{run.provider && <p className="lab-fine">{run.provider.id} / {run.provider.model} · Engine {run.engineVersion}</p>}</div><div className="lab-run-actions"><span className={`lab-status ${run.status}`}>{run.status}</span>{active(run)&&<button className="lab-stop" onClick={stop} disabled={busy}>Stop experiment</button>}<button onClick={()=>download(run)}>Export evidence</button></div></div>
      {run.error && <p className="lab-error" role="alert">{run.error}</p>}
      <div className="lab-stat-strip"><div><span>Turns</span><b>{run.state?.step ?? 0}<small> / {run.config.maxSteps}</small></b></div><div><span>Agents</span><b>{run.config.agentCount}</b></div><div><span>Model calls</span><b>{run.usage?.calls ?? 0}</b></div><div><span>Reported tokens</span><b>{(run.usage?.inputTokens??0)+(run.usage?.outputTokens??0)}</b></div></div>
      <div className="lab-workspace"><div>
        {maze ? <MazePreview key={JSON.stringify(maze)+String(run.state.requireCheckpoint)} maze={maze} requireCheckpoint={!!run.state.requireCheckpoint}/> : <section className="lab-panel lab-world-state"><span className="lab-label">Authoritative world state</span><h2>{run.config.arenaId === "tiny-civilization" ? "The commons" : run.config.arenaId === "escape-room" ? "The clue room" : "Workspace"}</h2><p>{active(run)?"Agents are taking bounded actions. Their observations are separate from this operator view.":"Final recorded state. Completion depends on the engine checks."}</p><div className="lab-world-metrics">{Object.entries(run.state?.metrics ?? {}).map(([name,value])=><div key={name}><span>{name.replace(/([A-Z])/g," $1")}</span><b>{value}</b></div>)}</div><details><summary>Inspect recorded state</summary><pre>{JSON.stringify(run.state,null,2)}</pre></details></section>}
        <section className="lab-panel lab-evidence"><div className="lab-panel-heading"><h2>Verification evidence</h2><span>Engine checks</span></div>{run.state?.checks?.length ? run.state.checks.map((check,i)=><div key={`${check.name}-${i}`} className="lab-check-result"><div><b>{check.name}</b>{check.detail&&<p>{check.detail}</p>}</div><span className={check.passed?"passed":"pending"}>{check.passed?"Pass":"Not passed"}</span></div>):<p>No acceptance check has passed yet. A model’s completion claim is not a verified result.</p>}</section>
      </div><section className="lab-panel lab-activity"><div className="lab-panel-heading"><h2>Activity</h2><span>{active(run)?"Updating live":"Recorded events"}</span></div><ol>{(run.state?.events ?? []).slice().reverse().map((event,i)=><li key={`${event.step}-${i}`}><span className="lab-event-step">{event.step}</span><div><b>{event.agent || "Engine"}<small>{event.kind}</small></b><p>{event.text}</p></div></li>)}</ol>{!run.state?.events?.length&&<p>Waiting for the first model action…</p>}</section></div>
    </>}
    {(view === "history" || view === "compare") && <>
      <div className="lab-intro"><div><span className="lab-label">Browser session</span><h1>{view === "history"?"Your experiments":"Compare evidence"}</h1><p>Saved in this tab for this browser session. Refreshing keeps them; export evidence before closing the session. Local and website records stay separate.</p></div><div className="lab-inline-actions"><button onClick={()=>{setView(view === "history"?"compare":"history");if(token)void refreshHistory();}}>{view === "history"?"Compare runs":"Run history"}</button>{token&&<button onClick={refreshHistory} disabled={busy}>Refresh</button>}</div></div>
      {runtimePicker}{connectionPanel}{view === "history" ? <section className="lab-panel">{!historyLoaded?<p>Loading your records…</p>:!history.length?<div className="lab-empty"><h2>Your first experiment starts here.</h2><p>Choose an arena and connect a model to collect real evidence.</p><button onClick={()=>setView("catalog")}>Choose an arena</button></div>:<div className="lab-history">{history.map(record=><article key={record.id}><button onClick={()=>openRun(record)}><div><b>{titleFor(record.config.arenaId)}</b><span>{record.config.objective}</span><small>{time(record.createdAt)} · Seed {record.config.seed}</small></div><span className={`lab-status ${record.status}`}>{record.status}</span></button>{!active(record)&&<button className="lab-delete" disabled={busy} onClick={()=>removeRun(record)} aria-label={`Delete ${titleFor(record.config.arenaId)} ${record.id.slice(0,8)}`}>Delete record</button>}</article>)}</div>}</section>:<section className="lab-panel"><div className="lab-form-grid"><label>First run<select value={left} onChange={e=>setLeft(e.target.value)}><option value="">Choose a run</option>{history.map(r=><option key={r.id} value={r.id}>{titleFor(r.config.arenaId)} · {r.id.slice(0,8)}</option>)}</select></label><label>Second run<select value={right} onChange={e=>setRight(e.target.value)}><option value="">Choose a different run</option>{history.filter(r=>r.id!==left).map(r=><option key={r.id} value={r.id}>{titleFor(r.config.arenaId)} · {r.id.slice(0,8)}</option>)}</select></label></div>{leftRun&&rightRun&&leftRun.id!==rightRun.id&&<><p>Descriptive comparison of recorded runs. Model behavior is not deterministic; these are not controlled benchmark scores.</p><div className="lab-table-scroll"><table><thead><tr><th>Measure</th><th>{titleFor(leftRun.config.arenaId)}</th><th>{titleFor(rightRun.config.arenaId)}</th></tr></thead><tbody>{[ ["Status",leftRun.status,rightRun.status],["Seed",leftRun.config.seed,rightRun.config.seed],["Agents",leftRun.config.agentCount,rightRun.config.agentCount],["Turns",leftRun.state?.step,rightRun.state?.step],["Model calls",leftRun.usage?.calls,rightRun.usage?.calls],["Passed checks",leftRun.state?.checks?.filter(c=>c.passed).length,rightRun.state?.checks?.filter(c=>c.passed).length] ].map(([name,a,b])=><tr key={String(name)}><th>{name}</th><td>{a??"—"}</td><td>{b??"—"}</td></tr>)}</tbody></table></div></>}</section>}
    </>}
    <footer className="lab-footer"><span>Research Arcade · Engine evidence, not self-reported success.</span><a href="/advanced">Advanced Docker tools</a></footer>
    <dialog ref={dialog} className="lab-dialog" onCancel={()=>setProtocol(false)} onClose={()=>setProtocol(false)} aria-labelledby="lab-protocol-title"><button className="lab-dialog-close" aria-label="Close arena description" onClick={()=>setProtocol(false)}>×</button><span className="lab-label">Bounded environment · v1</span><h2 id="lab-protocol-title">{selected.title}</h2><p>{selected.description}</p><p>{selected.objective}</p><p>Agents receive restricted observations and return structured actions. The engine applies valid actions and checks completion. Website runs do not execute arbitrary generated programs. Game Forge and Repair Bay operate on playable maze blueprints.</p><button className="lab-primary" onClick={()=>{setProtocol(false);configure();}}>Configure {selected.title}</button></dialog>
  </main>;
}
