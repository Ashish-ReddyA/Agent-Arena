"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { arcadeItems, categories, type ArcadeItem } from "./arcade-catalog";

type SavedRun = { id: string; name: string; objective: string; status: string; payload: string; createdAt: string };
type Props = { history: SavedRun[]; historyStatus: string; onRefresh: () => void; onConfigure: (item: ArcadeItem) => void; onRuntime: () => void; onHistory: () => void; onResumeView?: () => void };
type Tab = "Arenas" | "Experiments" | "Compare" | "Library";
function summarize(run: SavedRun) {
  try {
    const p = JSON.parse(run.payload);
    const agents = Object.values(p.agents ?? {}) as { tokens?: number; actions?: number }[];
    const sum = (key: "tokens" | "actions") => agents.reduce((n, a) => n + (Number.isFinite(a?.[key]) ? Number(a[key]) : 0), 0);
    return { mode: p.arenaId ?? p.experimentMode ?? "Unknown", agents: agents.length, tokens: sum("tokens"), actions: sum("actions"), error: false };
  } catch { return { mode: "Unreadable snapshot", agents: 0, tokens: 0, actions: 0, error: true }; }
}
export default function ArcadeCatalog({ history, historyStatus, onRefresh, onConfigure, onRuntime, onHistory, onResumeView }: Props) {
  const [tab, setTab] = useState<Tab>("Arenas");
  const [selectedId, setSelectedId] = useState(arcadeItems[0].id);
  const selected = arcadeItems.find(a => a.id === selectedId)!;
  const [dialog, setDialog] = useState<"example" | "rules" | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  useEffect(() => { if (dialog) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [dialog]);
  const paint = (a: ArcadeItem) => ({ "--arena-color": a.color }) as CSSProperties;
  // Local SVG artwork embeds its own WebP image; no remote image optimizer is needed.
  // eslint-disable-next-line @next/next/no-img-element
  const art = (a: ArcadeItem, className?: string) => <img className={className} src={`/arcade/${a.id}.svg`} alt="" width="640" height="376" />;
  const inspectorRef = useRef<HTMLElement>(null);
  const select = (id: string) => { setSelectedId(id); };
  const explore = (id: string) => {
    select(id);
    if (window.matchMedia("(max-width: 760px)").matches) requestAnimationFrame(() => { inspectorRef.current?.scrollIntoView({ block: "start" }); inspectorRef.current?.focus({ preventScroll: true }); });
  };
  const unavailable = historyStatus === "error";

  return <div className="arcade-shell">
    <header className="arcade-header">
      <button className="arcade-brand" onClick={() => setTab("Arenas")} aria-label="Agent Arena home"><span className="arcade-brand-symbol" aria-hidden="true">▧</span> AGENT ARENA <span className="arcade-wordmark-tag">RESEARCH ARCADE</span></button>
      <nav aria-label="Main navigation">{(["Arenas", "Experiments", "Compare", "Library"] as Tab[]).map(t => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>{t}</button>)}</nav>
    </header>
    <main className="arcade-main">
      <div className="arcade-heading"><div><p className="arcade-overline">A WORKSPACE FOR CURIOUS MINDS</p><h1>{tab === "Arenas" ? "Choose what happens next." : tab === "Experiments" ? "Every run has a story." : tab === "Compare" ? "Look at the differences." : "Start with a question."}</h1><p>{tab === "Arenas" ? "Build, play, collaborate. Study the decisions." : tab === "Experiments" ? "Your saved experiments and local runtime, in one place." : tab === "Compare" ? "Inspect recorded snapshots. Follow the evidence, not the score." : "Example protocols for your next experiment."}</p></div><div className="arcade-heading-actions">{onResumeView && <button className="arcade-secondary" onClick={onResumeView}>Return to run</button>}<button className="arcade-text-button" onClick={onRuntime}>Runtime setup <span aria-hidden="true">↗</span></button></div></div>

      {tab === "Arenas" && <div className="arcade-layout"><div className="arcade-groups">
        {categories.map((category, index) => <section className="arcade-group" key={category} aria-labelledby={`category-${index}`}><div className="arcade-category"><h2 id={`category-${index}`}>{category}</h2><span>02 arenas</span></div><div className="arcade-card-grid">{arcadeItems.filter(a => a.category === category).map(a => <article className={`arcade-card ${selectedId === a.id ? "selected" : ""}`} key={a.id} style={paint(a)}>
          <button className="arcade-art-button" aria-label={`Preview ${a.title}`} aria-pressed={selectedId === a.id} onClick={() => explore(a.id)}>{art(a)}<span className="arcade-art-arrow" aria-hidden="true">↗</span></button><div className="arcade-card-content"><h3>{a.title}</h3><p>{a.summary}</p><div className="arcade-card-footer"><span className="arcade-tag">{a.tag}</span><button className="arcade-explore" aria-label={`Explore ${a.title}`} onClick={() => explore(a.id)}>Explore <span aria-hidden="true">→</span></button></div><span className="arcade-availability"><i aria-hidden="true" className={a.runtime ? "available" : ""} />{a.available}</span></div>
        </article>)}</div></section>)}
        <p className="arcade-art-note">Illustrated concepts. Availability is shown on each card.</p>
      </div><aside ref={inspectorRef} tabIndex={-1} className="arcade-inspector" aria-label="Selected arena" style={paint(selected)}><section className="arcade-preview"><div className="arcade-preview-heading"><span className="arcade-overline">SELECTED ARENA</span><span className="arcade-preview-number">0{arcadeItems.indexOf(selected) + 1}</span></div><h2>{selected.title}</h2><p>{selected.summary}</p><div className="arcade-preview-art">{art(selected)}<span>CONCEPT PREVIEW</span></div><p className="arcade-description">{selected.description}</p><div className="arcade-preview-actions">{selected.runtime ? <button className="arcade-primary" onClick={() => onConfigure(selected)}>Configure workspace <span aria-hidden="true">↗</span></button> : <button className="arcade-primary" onClick={() => setDialog("example")}>Explore the protocol <span aria-hidden="true">↗</span></button>}<button className="arcade-secondary" onClick={() => setDialog("example")}>View example protocol</button></div><p className="arcade-limit"><b>{selected.available}</b>{selected.limit}</p></section>
        <section className="arcade-rule-card"><div><span className="arcade-overline">EXPERIMENT OPTION</span><span className="arcade-planned">PLANNED</span></div><h3>Rule Change <span aria-hidden="true">⤨</span></h3><p>Change a condition mid-run.</p><button className="arcade-text-button" onClick={() => setDialog("rules")}>How it will work <span aria-hidden="true">→</span></button></section>
      </aside></div>}

      {tab === "Experiments" && <section className="arcade-page-panel"><div className="arcade-section-head"><h2>Saved experiments <span>{history.length}</span></h2><button className="arcade-secondary" onClick={onRefresh}>Refresh</button></div>{historyStatus === "loading" && <p role="status">Loading saved experiments...</p>}{unavailable && <p role="alert">Saved storage is unavailable. Local Docker experiments remain accessible through the runtime archive.</p>}{!history.length && historyStatus !== "loading" && <div className="arcade-empty"><span aria-hidden="true">◎</span><h3>{unavailable ? "Local runtime is still available" : "Your first experiment starts here"}</h3><p>Choose a workspace preset, set up your agents, and record a run. No example results are mixed with your data.</p><button className="arcade-primary" onClick={onRuntime}>Open runtime setup</button></div>}<div className="arcade-run-list">{history.map(run => <article key={run.id}><div><span className="arcade-overline">{run.status}</span><h3>{run.name}</h3><p>{run.objective}</p></div><div><small>{new Date(run.createdAt).toLocaleDateString()}</small><button className="arcade-secondary" onClick={onHistory}>Open archive</button></div></article>)}</div><button className="arcade-text-button" onClick={onHistory}>Open full archive and local sessions →</button></section>}

      {tab === "Compare" && <section className="arcade-page-panel"><h2>Compare saved snapshots</h2><p>These are recorded counters, not controlled benchmark results. Different models, budgets and task settings can make a comparison unfair.</p>{history.length < 2 ? <div className="arcade-empty"><span aria-hidden="true">⇄</span><h3>Two runs tell you more than one</h3><p>Save at least two experiments to inspect their recorded agent counts, actions and token use side by side.</p><button className="arcade-secondary" onClick={() => setTab("Experiments")}>View experiments</button></div> : <><div className="arcade-comparison-selects"><label>First run<select value={left} onChange={e => setLeft(e.target.value)}><option value="">Choose a run</option>{history.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Second run<select value={right} onChange={e => setRight(e.target.value)}><option value="">Choose a different run</option>{history.filter(r => r.id !== left).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label></div>{left && right && left !== right && <div className="arcade-comparison">{[left, right].map(id => { const run = history.find(r => r.id === id); if (!run) return null; const s = summarize(run); return <article key={id}><h3>{run.name}</h3>{s.error ? <p role="alert">This saved snapshot cannot be read.</p> : <dl>{Object.entries({ Runtime: s.mode, Agents: s.agents, Actions: s.actions, Tokens: s.tokens.toLocaleString(), Status: run.status }).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}</article>; })}</div>}</>}</section>}

      {tab === "Library" && <section className="arcade-protocol-grid">{arcadeItems.map(a => <article key={a.id} style={paint(a)}><span className="arcade-tag">{a.category}</span><h2>{a.title}</h2><p>{a.question}</p><button className="arcade-secondary" onClick={() => { select(a.id); setDialog("example"); }}>Read protocol</button></article>)}</section>}
      <footer className="arcade-footer"><span><i aria-hidden="true" /> Local-first experiments. Your agents, your workspace.</span><span>AGENT ARENA / RESEARCH ARCADE</span></footer>
    </main>
    <dialog ref={dialogRef} className="arcade-dialog" onCancel={() => setDialog(null)} onClose={() => setDialog(null)} aria-labelledby="protocol-title"><button className="arcade-dialog-close" aria-label="Close protocol" onClick={() => setDialog(null)}>×</button><span className="arcade-overline">{dialog === "rules" ? "PLANNED EXPERIMENT OPTION" : "EXAMPLE PROTOCOL / NOT A RUN RESULT"}</span><h2 id="protocol-title">{dialog === "rules" ? "Change one thing. Observe what follows." : selected.title}</h2>{dialog === "rules" ? <><p>Rule Change will let an operator introduce a defined intervention into a supported environment and compare it with an unchanged control.</p><ol><li>Choose a supported change: a blocked route, a revised requirement, or a resource shortage.</li><li>Record the condition and when it changes. Repeat with a matched control.</li><li>Measure recovery using the environment evaluator, not a narrative claim.</li></ol><p className="arcade-limit">Structured interventions are not implemented yet. Existing runtime operator messages are instructions, not validated world-rule changes.</p></> : <><p className="arcade-dialog-question">{selected.question}</p><ol>{selected.protocol.map(step => <li key={step}>{step}</li>)}</ol><p className="arcade-limit">{selected.limit}</p>{selected.runtime && <button className="arcade-primary" onClick={() => { setDialog(null); onConfigure(selected); }}>Configure workspace</button>}</>}</dialog>
  </div>;
}
