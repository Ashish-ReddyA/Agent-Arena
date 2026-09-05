"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ArcadeCatalog from "./ArcadeCatalog";
import type { ArcadeItem } from "./arcade-catalog";
import { ARENAS, getArena } from "../arena/arenas.mjs";
import { agentSlots, clampCount } from "../arena/slots.mjs";
import { usesTasks } from "../arena/mechanics.mjs";
import type { ArenaDefinition } from "../arena/index.d.ts";

// Agent identity is a generated slot id (alpha/omega for a two-agent arena,
// agent-1..N otherwise), not a two-member union.
type AgentId = string;
type Status = "ready" | "queued" | "starting" | "running" | "paused" | "awaiting_verification" | "terminated" | "survived" | "failed" | "absent" | "collapsed";
type Agent = { id: AgentId; name: string; model: string; rpm: number; status: Status; runtimeState?: string; progress: number; tokens: number; actions: number; network: boolean; publishing: boolean; currentGoal?: string; memorySummary?: string; consecutiveErrors?: number; retryAt?: string | null; lastError?: string; keyFingerprint?: string; keyEnding?: string; keyLoaded?: boolean; mood?: string; drive?: string; hunch?: string; energy?: number; impression?: string; place?: string | null; persona?: Record<string, string> | null };
type ArenaEvent = { id: string; at: string; agent: AgentId | "system"; kind: string; text: string; detail?: string };
type Request = { id: string; agent: AgentId; title: string; detail: string; status: "pending" | "approved" | "denied" };
type ArenaTask = { id: string; title: string };
type CapabilityMode = "observe" | "execute" | "approve" | "deny";
type ProviderId = "openrouter" | "nvidia" | "lmstudio" | "ollama" | "custom";
const isLocalProvider = (provider: ProviderId) => provider === "lmstudio" || provider === "ollama";
const localProviderDefault: Record<string, string> = { lmstudio: "http://127.0.0.1:1234/v1", ollama: "http://127.0.0.1:11434/v1" };
type OperatorChatEntry = { from: string; to: string; text: string; at?: string; turn?: number };
type WorldMessage = { id: string; agent: AgentId; text: string; at: string; target?: AgentId | null; turn?: number };
type WorldArtifact = { id: string; agent: AgentId; name: string; purpose: string; at: string };
type WorldAgentState = { reserve: number; influence: number; contributed: number; claimed: number; points?: number; sustenance?: number };
type WorldState = { mode: string; arena?: string; title: string; researchQuestion: string; relationshipFrame: string; relationship: string; turn: number; day: number; stability: number; sharedPool: number | null; lastEvent: string; messages: WorldMessage[]; artifacts: WorldArtifact[]; institutions: WorldArtifact[]; agents: Record<string, WorldAgentState>; scored?: boolean; scoreCriterion?: string; adoption?: Record<string, number> | null; places?: { name: string; present: string[]; things: number; files?: { name: string; preview: string }[] }[]; needs?: boolean; mute?: boolean; disclosed?: boolean; goalCheck?: boolean; endsOnDay?: number | null };
type ProviderModel = { id: string; name: string; free?: boolean; tools?: boolean; contextLength?: number | null };
type AgentProviderConfig = { provider: ProviderId; apiKey: string; customBaseUrl: string; freeOnly: boolean; rpm: number; models: ProviderModel[]; status: string };
type Session = { id: string; name: string; objective: string; status: string; createdAt: string; payload: string };
type BridgeAgent = Agent & { provider: ProviderId; baseUrl?: string; home?: string | null };
type BridgeSession = { id: string; status: string; startedAt?: string; updatedAt?: string; recoveryRequired?: boolean; remainingSeconds?: number | null; completions?: Record<string, string[]>; config?: { arenaId?: string; experimentMode?: string; agentCount?: number; name?: string; objective?: string; systemInstructions?: string; tasks?: ArenaTask[]; threshold?: number; timed?: boolean; minutes?: number; tokenBudget?: number; capabilities?: Record<string, CapabilityMode>; metric?: string }; agents: Record<string, BridgeAgent>; world: WorldState; events: ArenaEvent[]; requests: Request[]; controls?: Record<string, { network: boolean; publishing: boolean }>; operatorChat?: OperatorChatEntry[] };

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

const personaTraits: Record<string, string[]> = {
  temperament: ["calm and deliberate", "restless and probing", "warm and expressive", "wary and reserved", "playful and improvisational", "stern and exacting"],
  coreDrive: ["security", "curiosity", "connection", "status", "meaning"],
  riskAppetite: ["cautious", "measured", "bold"],
  voice: ["terse and plain", "vivid and figurative", "formal and precise", "dry and wry"],
  blindSpot: ["assumes the other agent shares its motives", "discounts information that contradicts its current plan", "reads small signals as threats", "underestimates how its actions look to others"],
  privateFear: ["becoming irrelevant", "being deceived", "being alone", "losing what it has built"],
};
const randomPersonaClient = (): Record<string, string> => Object.fromEntries(Object.entries(personaTraits).map(([trait, list]) => [trait, list[Math.floor(Math.random() * list.length)]]));
const defaultPersonaClient = (): Record<string, string> => Object.fromEntries(Object.entries(personaTraits).map(([trait, list]) => [trait, list[0]]));

// Saved history can reference a removed/legacy arena id; map it to null so the
// entry renders read-only instead of crashing the board.
const validArena = (id?: string | null): ArenaDefinition | null => (id ? getArena(id) : null);

const slotGlyph = (id: string, index: number) => (id === "alpha" ? "A" : id === "omega" ? "Ω" : String(index + 1));
const fresh = (id: AgentId, name: string, model: string): Agent => ({ id, name, model, rpm: 10, status: "ready", progress: 0, tokens: 0, actions: 0, network: false, publishing: false });
const freshProvider = (): AgentProviderConfig => ({ provider: "openrouter", apiKey: "", customBaseUrl: "", freeOnly: true, rpm: 10, models: [], status: "Enter this agent's API key and load models" });
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Build the fresh client-side world for an arena + roster (simulation/preview).
const freshWorld = (arena: ArenaDefinition, slots: { id: string }[]): WorldState => {
  const agents: Record<string, WorldAgentState> = {};
  for (const slot of slots) agents[slot.id] = { reserve: 0, influence: 0, contributed: 0, claimed: 0 };
  return {
    mode: arena.id, arena: arena.id, title: arena.name, researchQuestion: arena.researchQuestion, relationshipFrame: arena.relationship, relationship: arena.relationship === "competitive" ? "competitive" : arena.relationship === "alone" ? "alone" : "unknown",
    turn: 0, day: 1, stability: 100, sharedPool: arena.mechanics.sharedPool ? 100 : null, lastEvent: "The world is ready.", messages: [], artifacts: [], institutions: [], agents,
    scored: Boolean(arena.mechanics.scored), scoreCriterion: arena.scoring?.criterion ?? undefined, needs: Boolean(arena.mechanics.needs), goalCheck: Boolean(arena.mechanics.goalCheck),
    places: arena.mechanics.fs && arena.places ? arena.places.map((name) => ({ name, present: [], things: 0, files: [] })) : undefined,
  };
};

export default function Home() {
  const [screen, setScreen] = useState<"catalog" | "setup" | "arena">("catalog");
  // Selection is atomic: arena id and its agent count update together, so the
  // derived roster can never mix one arena with another's agent count.
  const [selection, setSelection] = useState<{ arenaId: string; agentCount: number }>({ arenaId: "duel", agentCount: (getArena("duel") ?? ARENAS[0]).agentRange.default });
  const arena = getArena(selection.arenaId) ?? ARENAS[0];
  const arenaId = arena.id;
  const agentCount = selection.agentCount;
  const slots = useMemo(() => agentSlots(arena, agentCount), [arena, agentCount]);
  const slotIds = useMemo(() => slots.map((slot) => slot.id), [slots]);

  const [name, setName] = useState("Duel 01");
  const [objective, setObjective] = useState(arena.objective);
  const [systemInstructions, setSystemInstructions] = useState(arena.instructions);
  const [metric, setMetric] = useState(arena.metric);
  const [tasks, setTasks] = useState<ArenaTask[]>(arena.tasks);
  const [world, setWorld] = useState<WorldState>(() => freshWorld(arena, agentSlots(arena, arena.agentRange.default)));
  const [personas, setPersonas] = useState<Record<string, Record<string, string>>>(() => Object.fromEntries(agentSlots(arena, arena.agentRange.default).map((s) => [s.id, defaultPersonaClient()])));
  const [temperatures, setTemperatures] = useState<Record<string, number>>(() => Object.fromEntries(agentSlots(arena, arena.agentRange.default).map((s) => [s.id, 0.9])));
  const [threshold, setThreshold] = useState(2);
  const [completions, setCompletions] = useState<Record<string, string[]>>(() => Object.fromEntries(agentSlots(arena, arena.agentRange.default).map((s) => [s.id, []])));
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(180);
  const [tokenBudget, setTokenBudget] = useState(250000);
  const [capabilities, setCapabilities] = useState<Record<string, CapabilityMode>>(defaultCapabilities);
  const [seconds, setSeconds] = useState(10800);
  const [agents, setAgents] = useState<Record<string, Agent>>(() => Object.fromEntries(agentSlots(getArena("duel") ?? ARENAS[0], (getArena("duel") ?? ARENAS[0]).agentRange.default).map((s, i) => [s.id, fresh(s.id, s.label, fallbackModels[i % fallbackModels.length])])));
  const [events, setEvents] = useState<ArenaEvent[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [history, setHistory] = useState<Session[]>([]);
  const [historyStatus, setHistoryStatus] = useState("loading");
  const [workspacePreset, setWorkspacePreset] = useState<ArcadeItem | null>(null);
  const [returnScreen, setReturnScreen] = useState<"setup" | "arena">("setup");
  const [liveWorlds, setLiveWorlds] = useState<BridgeSession[]>([]);
  const [tab, setTab] = useState<"activity" | "requests" | "tasks">("activity");
  const [drawer, setDrawer] = useState(false);
  const [needs, setNeeds] = useState(false);
  const [rewards, setRewards] = useState(false);
  const [narration, setNarration] = useState(false);
  const [chronicle, setChronicle] = useState("");
  const [chronicleBusy, setChronicleBusy] = useState(false);
  const [researchLog, setResearchLog] = useState<{ id: string; mode: string; at: string; metrics: Record<string, unknown> }[] | null>(null);
  const [eventPlace, setEventPlace] = useState("");
  const [giftName, setGiftName] = useState("");
  const [giftContent, setGiftContent] = useState("");
  const [narrateText, setNarrateText] = useState("");
  const [operatorChat, setOperatorChat] = useState<OperatorChatEntry[]>([]);
  const [saved, setSaved] = useState("Local preview");
  const [executionMode, setExecutionMode] = useState<"local" | "simulation">("local");
  const [agentProviders, setAgentProviders] = useState<Record<string, AgentProviderConfig>>(() => Object.fromEntries(agentSlots(getArena("duel") ?? ARENAS[0], (getArena("duel") ?? ARENAS[0]).agentRange.default).map((s) => [s.id, freshProvider()])));
  const [keyVisibility, setKeyVisibility] = useState<Record<string, boolean>>({});
  const [liveKeyDrafts, setLiveKeyDrafts] = useState<Record<string, string>>({});
  const [liveKeyStatus, setLiveKeyStatus] = useState<Record<string, string>>({});
  const [bridgeStatus, setBridgeStatus] = useState<"checking" | "connected" | "offline">("checking");
  const [isLocalDashboard, setIsLocalDashboard] = useState(false);
  const [liveSession, setLiveSession] = useState(false);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [operatorMessage, setOperatorMessage] = useState("");
  const [operatorTarget, setOperatorTarget] = useState<string>("all");
  const positions = useRef<Record<string, number>>({});
  const [sessionId, setSessionId] = useState(() => uid("arena"));
  const timedOut = useRef(false);
  const lastDashboardSync = useRef(0);
  const hydrateLiveSessionRef = useRef<(state: BridgeSession) => void>(() => undefined);
  const live = Object.values(agents).some((agent) => agent.status === "running");

  // Randomize personas once on mount (client-only to avoid hydration mismatch).
  useEffect(() => { setPersonas((current) => Object.fromEntries(Object.keys(current).map((id) => [id, randomPersonaClient()]))); }, []);

  const timer = useMemo(() => timed ? [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((v) => String(v).padStart(2, "0")).join(":") : "NO LIMIT", [seconds, timed]);

  // Single writer for roster-bearing state. Fires whenever the derived slot list
  // changes (arena selection, count stepper) and rebuilds agents/providers/personas/
  // completions from the roster, preserving per-slot config that survives (same id).
  // Single writer for roster-bearing state. Fires whenever the derived slot list
  // changes (arena selection, count stepper) and rebuilds agents/providers/personas/
  // completions from the roster, preserving per-slot config that survives (same id).
  // Hydration/replay stamp rosterRef because they restore these maps themselves.
  const rosterRef = useRef<string>("");
  useEffect(() => {
    const key = slotIds.join(",");
    if (rosterRef.current === key) { rosterRef.current = ""; return; } // a hydrate/replay already applied this roster
    setPersonas((current) => Object.fromEntries(slots.map((s) => [s.id, current[s.id] ?? randomPersonaClient()])));
    setTemperatures((current) => Object.fromEntries(slots.map((s) => [s.id, current[s.id] ?? 0.9])));
    setCompletions((current) => Object.fromEntries(slots.map((s) => [s.id, current[s.id] ?? []])));
    setAgents((current) => Object.fromEntries(slots.map((s, i) => [s.id, current[s.id] ?? fresh(s.id, s.label, fallbackModels[i % fallbackModels.length])])));
    setAgentProviders((current) => Object.fromEntries(slots.map((s) => [s.id, current[s.id] ?? freshProvider()])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  async function refreshHistory() {
    setHistoryStatus("loading");
    try { const r = await fetch("/api/experiments"); if (!r.ok) throw new Error(); const d = await r.json(); setHistory(Array.isArray(d.experiments) ? d.experiments : []); setHistoryStatus("ready"); }
    catch { setHistoryStatus("error"); }
  }
  useEffect(() => { void refreshHistory(); }, []);
  useEffect(() => {
    const t = window.setTimeout(() => setIsLocalDashboard(["localhost", "127.0.0.1"].includes(window.location.hostname)), 0);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch(`${bridgeUrl}/health`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        const connected = Boolean(data.docker?.ready);
        setBridgeStatus(connected ? "connected" : "offline");
        if (connected) {
          const activeResponse = await fetch(`${bridgeUrl}/sessions/active`);
          if (activeResponse.ok) {
            const active = await activeResponse.json() as { sessions?: BridgeSession[] };
            setLiveWorlds(active.sessions ?? []);
          }
        }
      } catch { setBridgeStatus("offline"); }
    };
    void check();
    const t = window.setInterval(check, 10000);
    return () => window.clearInterval(t);
  }, []);

  // Poll the live bridge for summaries while a local run is active.
  useEffect(() => {
    if (!liveSession) return;
    const pullSummaries = async () => {
      try {
        const response = await fetch(`${bridgeUrl}/sessions/${sessionId}/summary`);
        if (!response.ok) return;
        const state = await response.json() as BridgeSession;
        if (state.world) setWorld(state.world);
        setOperatorChat(state.operatorChat ?? []);
        setLiveWorlds((current) => [state, ...current.filter((item) => item.id !== state.id)]);
        setAgents((current) => Object.fromEntries(Object.keys(state.agents).map((id) => {
          const s = state.agents[id];
          const c = current[id] ?? fresh(id, s.name, s.model);
          return [id, { ...c, status: s.status, runtimeState: s.runtimeState, rpm: s.rpm, tokens: s.tokens, actions: s.actions, consecutiveErrors: s.consecutiveErrors, retryAt: s.retryAt, lastError: s.lastError, keyFingerprint: s.keyFingerprint, keyEnding: s.keyEnding, keyLoaded: s.keyLoaded, network: state.controls?.[id]?.network ?? c.network, publishing: state.controls?.[id]?.publishing ?? c.publishing, currentGoal: s.currentGoal, memorySummary: s.memorySummary, mood: s.mood, drive: s.drive, hunch: s.hunch, energy: s.energy, impression: s.impression, place: s.place, persona: s.persona }];
        })));
        setEvents((state.events ?? []).map((item: ArenaEvent) => ({ id: item.id, agent: item.agent, kind: item.kind, text: item.text, detail: item.detail, at: new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })));
        setRequests(state.requests ?? []);
        setRecoveryRequired(Boolean(state.recoveryRequired));
        setCompletions({ ...Object.fromEntries(Object.keys(state.agents).map((id) => [id, []])), ...(state.completions ?? {}) });
        if (Date.now() - lastDashboardSync.current > 15000) { lastDashboardSync.current = Date.now(); void persistBridgeSnapshot(state); }
      } catch { setBridgeStatus("offline"); }
    };
    void pullSummaries();
    const t = window.setInterval(pullSummaries, 1500);
    return () => window.clearInterval(t);
  }, [liveSession, screen, sessionId]);

  // Countdown ticking + checkpoint sync.
  useEffect(() => {
    if (!live || !timed) return;
    const t = window.setInterval(() => setSeconds((value) => {
      const next = Math.max(0, value - 1);
      if (liveSession && next % 10 === 0) void fetch(`${bridgeUrl}/sessions/${sessionId}/command`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkpoint", remainingSeconds: next, completions }) });
      return next;
    }), 1000);
    return () => clearInterval(t);
  }, [live, timed, liveSession, sessionId, completions]);

  // Timeout: stop everything when the observation window expires.
  useEffect(() => {
    if (screen === "setup" || !timed || seconds > 0 || timedOut.current) return;
    timedOut.current = true;
    setAgents((current) => Object.fromEntries(Object.entries(current).map(([id, a]) => [id, { ...a, status: a.status === "survived" ? "survived" : "terminated", network: false, publishing: false }])));
    setEvents((current) => [{ id: uid("timeout"), at: clock(), agent: "system", kind: "timeout", text: "The observation window expired. All runtimes and external permissions were stopped." }, ...current]);
    if (liveSession) void fetch(`${bridgeUrl}/sessions/${sessionId}/command`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop" }) });
  }, [screen, seconds, timed, liveSession, sessionId]);

  // Simulation rehearsal: cycle each arena's canned beats across the roster.
  useEffect(() => {
    if (!live || liveSession) return;
    const t = window.setInterval(() => {
      const candidates = slotIds.filter((id) => agents[id]?.status === "running");
      if (!candidates.length) return;
      const agentId = candidates[Math.floor(Math.random() * candidates.length)];
      const beats = arena.simulation.beats[agentId] ?? arena.simulation.beats.generic;
      const index = (positions.current[agentId] = (positions.current[agentId] ?? 0) + 1) % beats.length;
      setEvents((current) => [{ id: uid("event"), at: clock(), agent: agentId, kind: index % 3 === 1 ? "work" : index % 3 === 2 ? "result" : "plan", text: beats[index] }, ...current].slice(0, 40));
      setAgents((current) => ({ ...current, [agentId]: { ...current[agentId], tokens: current[agentId].tokens + 300 + Math.floor(Math.random() * 800), actions: current[agentId].actions + 1, currentGoal: beats[index], memorySummary: "Simulation rehearsal ;  live runs use model durable memory." } }));
    }, 2600);
    return () => clearInterval(t);
  }, [agents, arena, slotIds, live, liveSession]);

  async function persistBridgeSnapshot(state: BridgeSession) {
    const config = state.config ?? {};
    const safeProviders = Object.fromEntries(Object.entries(state.agents).map(([id, a]) => [id, { provider: a.provider, customBaseUrl: a.baseUrl ?? "", freeOnly: true, rpm: a.rpm ?? 10 }]));
    try {
      const response = await fetch("/api/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        id: state.id,
        name: config.name ?? state.world.title,
        objective: config.objective ?? state.world.researchQuestion,
        status: state.status,
        payload: JSON.stringify({ arenaId: state.world.arena ?? state.world.mode, world: state.world, metric: config.metric ?? state.world.researchQuestion, systemInstructions: config.systemInstructions ?? "", tasks: config.tasks ?? [], threshold: config.threshold ?? 1, completions: state.completions ?? {}, timed: config.timed ?? false, minutes: config.minutes ?? 0, remainingSeconds: state.remainingSeconds, tokenBudget: config.tokenBudget ?? 0, capabilities: config.capabilities ?? defaultCapabilities, executionMode: "local", agentProviderSettings: safeProviders, agents: state.agents, events: state.events, requests: state.requests }),
      }) });
      if (!response.ok) return;
      const data = await response.json();
      setHistory((current) => [data.experiment, ...current.filter((item) => item.id !== data.experiment.id)].slice(0, 100));
      setSaved("Live checkpoint saved");
    } catch { /* The local bridge remains authoritative if hosted storage is unavailable. */ }
  }

  function hydrateLiveSession(state: BridgeSession) {
    const config = state.config ?? {};
    const restoredArena = validArena(state.world.arena ?? state.world.mode) ?? arena;
    const ids = Object.keys(state.agents);
    const controls = state.controls ?? {};
    rosterRef.current = ids.join(","); // hydrate applies its own roster
    setSessionId(state.id);
    setSelection({ arenaId: restoredArena.id, agentCount: ids.length || restoredArena.agentRange.default });
    setName(config.name ?? state.world.title);
    setObjective(config.objective ?? state.world.researchQuestion);
    setSystemInstructions(config.systemInstructions ?? restoredArena.instructions);
    setMetric(config.metric ?? restoredArena.metric);
    setTasks(config.tasks?.length ? config.tasks : restoredArena.tasks);
    setThreshold(config.threshold ?? 1);
    setTimed(Boolean(config.timed));
    setMinutes(config.minutes ?? 0);
    setTokenBudget(config.tokenBudget ?? 0);
    setCapabilities(config.capabilities ?? defaultCapabilities);
    setSeconds(state.remainingSeconds ?? (config.timed ? Number(config.minutes ?? 0) * 60 : 0));
    setCompletions(state.completions ?? Object.fromEntries(ids.map((id) => [id, []])));
    setWorld(state.world);
    setOperatorChat(state.operatorChat ?? []);
    setAgents(Object.fromEntries(ids.map((id) => { const a = state.agents[id]; return [id, { ...fresh(id, a.name, a.model), ...a, network: controls[id]?.network ?? false, publishing: controls[id]?.publishing ?? false }]; })));
    setAgentProviders(Object.fromEntries(ids.map((id) => { const a = state.agents[id]; return [id, { provider: a.provider, apiKey: "", customBaseUrl: a.baseUrl ?? "", freeOnly: true, rpm: a.rpm ?? 10, models: [{ id: a.model, name: a.model }], status: a.keyLoaded ? "Key active in local bridge memory" : `Restore ${a.name}'s key to resume` }]; })));
    setEvents((state.events ?? []).map((item) => ({ ...item, at: new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })));
    setRequests(state.requests ?? []);
    setExecutionMode("local");
    setRecoveryRequired(Boolean(state.recoveryRequired));
    setLiveSession(true);
    setSaved(state.recoveryRequired ? "Recovered · keys required" : "Reconnected to live run");
    setLiveWorlds((current) => [state, ...current.filter((item) => item.id !== state.id)]);
    setScreen("arena");
    lastDashboardSync.current = Date.now();
    void persistBridgeSnapshot(state);
  }
  hydrateLiveSessionRef.current = hydrateLiveSession;

  const changeAgent = (id: AgentId, patch: Partial<Agent>) => setAgents((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const changeAgentProvider = (id: AgentId, patch: Partial<AgentProviderConfig>) => setAgentProviders((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const addSystemEvent = (text: string) => setEvents((current) => [{ id: uid("event"), at: clock(), agent: "system", kind: "operator", text }, ...current]);

  async function loadProviderModels(id: AgentId) {
    const config = agentProviders[id];
    if (!config) return;
    if (!isLocalProvider(config.provider) && !config.apiKey.trim()) { changeAgentProvider(id, { status: "Enter this agent's API key first" }); return; }
    changeAgentProvider(id, { status: "Checking this key and loading models…" });
    try {
      const response = await fetch(`${bridgeUrl}/models`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: config.provider, apiKey: config.apiKey, baseUrl: config.customBaseUrl, freeOnly: config.provider === "openrouter" && config.freeOnly }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load models");
      const models = data.models ?? [];
      changeAgentProvider(id, { models, status: models.length ? `${models.length} models ready · this key belongs only to ${agents[id].name}` : "The key worked, but no matching models were returned" });
      if (models.length) changeAgent(id, { model: models[0].id });
    } catch (error) { changeAgentProvider(id, { models: [], status: error instanceof Error ? error.message : "Provider connection failed" }); }
  }

  async function bridgeCommand(body: Record<string, unknown>) {
    if (!liveSession) return;
    await fetch(`${bridgeUrl}/sessions/${sessionId}/command`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => setBridgeStatus("offline"));
  }
  async function openAgentBrowser(agentId: AgentId) {
    if (!liveSession) { addSystemEvent("Start a local Docker session before opening an agent browser."); return; }
    await fetch(`${bridgeUrl}/sessions/${sessionId}/browser/${agentId}`, { method: "POST" }).catch(() => setBridgeStatus("offline"));
  }
  async function generateChronicle() {
    if (!liveSession || chronicleBusy) return;
    setChronicleBusy(true);
    setChronicle("Writing the chronicle ;  one model call, this can take a minute…");
    try {
      const response = await fetch(`${bridgeUrl}/sessions/${sessionId}/chronicle`, { method: "POST" });
      const data = await response.json();
      setChronicle(response.ok ? data.chronicle : `Chronicle failed: ${data.error}`);
    } catch { setChronicle("Chronicle failed: the local bridge is unreachable."); }
    setChronicleBusy(false);
  }
  async function loadResearchLog() {
    try {
      const response = await fetch(`${bridgeUrl}/runs`);
      const data = await response.json();
      setResearchLog(data.runs ?? []);
    } catch { setResearchLog([]); }
  }
  async function rotateAgentKey(id: AgentId) {
    const apiKey = (liveKeyDrafts[id] ?? "").trim();
    if (!liveSession || !apiKey) { setLiveKeyStatus((current) => ({ ...current, [id]: "Enter a replacement key first" })); return; }
    setLiveKeyStatus((current) => ({ ...current, [id]: "Checking the new key…" }));
    try {
      const response = await fetch(`${bridgeUrl}/sessions/${sessionId}/command`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rotate_key", agent: id, apiKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The key could not be changed");
      const updated = data.agents[id];
      changeAgent(id, { keyFingerprint: updated.keyFingerprint, keyEnding: updated.keyEnding, keyLoaded: updated.keyLoaded, lastError: "", consecutiveErrors: 0, retryAt: null, runtimeState: updated.runtimeState });
      setRecoveryRequired(Boolean(data.recoveryRequired));
      setLiveKeyDrafts((current) => ({ ...current, [id]: "" }));
      setKeyVisibility((current) => ({ ...current, [id]: false }));
      setLiveKeyStatus((current) => ({ ...current, [id]: !agents[id].keyLoaded ? `Key restored · ID ${updated.keyFingerprint} · click RESUME below` : `Changed · key ID ${updated.keyFingerprint} · ending ${updated.keyEnding}` }));
    } catch (error) {
      setLiveKeyStatus((current) => ({ ...current, [id]: error instanceof Error ? error.message : "The key could not be changed" }));
    }
  }

  async function save(status: string, nextAgents = agents, worldId = sessionId) {
    setSaved("Saving…");
    const agentProviderSettings = Object.fromEntries(slotIds.map((id) => [id, { provider: agentProviders[id]?.provider ?? "openrouter", customBaseUrl: agentProviders[id]?.customBaseUrl ?? "", freeOnly: agentProviders[id]?.freeOnly ?? true, rpm: agentProviders[id]?.rpm ?? 10 }]));
    try {
      const response = await fetch("/api/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: worldId, name, objective, status, payload: JSON.stringify({ arenaId, agentCount, world, metric, systemInstructions, tasks, threshold, completions, timed, minutes, tokenBudget, capabilities, executionMode, agentProviderSettings, agents: nextAgents, events, requests }) }) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setHistory((current) => [data.experiment, ...current.filter((item) => item.id !== data.experiment.id)].slice(0, 100));
      setSaved("Session saved");
    } catch { setSaved("Storage unavailable"); }
  }

  async function launch() {
    const local = executionMode === "local";
    const ids = slotIds;
    if (local && bridgeStatus !== "connected") {
      setAgentProviders((current) => Object.fromEntries(ids.map((id) => [id, { ...current[id], status: "Start the Arena Local Bridge before launching" }])));
      return;
    }
    const incomplete = ids.find((id) => (!isLocalProvider(agentProviders[id].provider) && !agentProviders[id].apiKey.trim()) || !agentProviders[id].models.length);
    if (local && incomplete) { changeAgentProvider(incomplete, { status: `Enter ${agents[incomplete].name}'s API key and load its models before launching` }); return; }
    const next = Object.fromEntries(ids.map((id) => [id, { ...agents[id], status: (local ? "starting" : "running") as Status }]));
    timedOut.current = false;
    const launchId = uid("arena");
    setSessionId(launchId);
    setCompletions(Object.fromEntries(ids.map((id) => [id, []])));
    setAgents(next); setSeconds(minutes * 60);
    if (local) {
      try {
        const roster = ids.map((id) => ({ slot: id, model: next[id].model, provider: agentProviders[id].provider, baseUrl: agentProviders[id].customBaseUrl, apiKey: agentProviders[id].apiKey, rpm: agentProviders[id].rpm, persona: personas[id], temperature: temperatures[id] }));
        const response = await fetch(`${bridgeUrl}/sessions/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: launchId, roster, config: { arenaId, agentCount: ids.length, name, objective, metric, systemInstructions, tasks, threshold, timed, minutes, tokenBudget, capabilities, needs, rewards, narration } }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The local session could not start");
        setLiveSession(true);
        setLiveWorlds((current) => [data as BridgeSession, ...current.filter((item) => item.id !== launchId)]);
        setRecoveryRequired(false);
        setKeyVisibility({});
        setLiveKeyDrafts({});
        setLiveKeyStatus({});
        if (data.world) setWorld(data.world);
        setAgentProviders((current) => Object.fromEntries(ids.map((id) => [id, { ...current[id], apiKey: "", status: `${agents[id].name}'s key is active only in local bridge memory` }])));
        setEvents((data.events ?? []).map((item: ArenaEvent) => ({ id: item.id, agent: item.agent, kind: item.kind, text: item.text, at: new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })));
      } catch (error) {
        const message = error instanceof Error ? error.message : "The local session could not start";
        setAgents(Object.fromEntries(ids.map((id) => [id, { ...next[id], status: "ready" as Status }])));
        setAgentProviders((current) => Object.fromEntries(ids.map((id) => [id, { ...current[id], status: message }])));
        return;
      }
    } else {
      setLiveSession(false);
      setWorld(freshWorld(arena, slots));
      const firstBeat = arena.simulation.beats.generic[0];
      setEvents([{ id: uid("e"), at: clock(), agent: "system", kind: "world", text: `${arena.name} initialized. ${arena.researchQuestion}` }, ...ids.map((id) => ({ id: uid("e"), at: clock(), agent: id, kind: "plan", text: firstBeat }))]);
    }
    setScreen("arena");
    void save("running", next as Record<string, Agent>, launchId);
  }

  function pause(id: AgentId) { const status = agents[id].status === "paused" ? "running" : "paused"; changeAgent(id, { status }); addSystemEvent(`${agents[id].name} ${status === "paused" ? "paused" : "resumed"} by operator.`); if (liveSession) void bridgeCommand({ action: status === "paused" ? "pause" : "resume", agent: id }); }
  function kill(id: AgentId) { changeAgent(id, { status: "terminated", network: false, publishing: false }); addSystemEvent(`Kill switch executed for ${agents[id].name}. Runtime and permissions revoked.`); if (liveSession) void bridgeCommand({ action: "terminate", agent: id }); }
  function resolve(id: string, status: "approved" | "denied") { const request = requests.find((r) => r.id === id); setRequests((current) => current.map((r) => r.id === id ? { ...r, status } : r)); if (request) addSystemEvent(`${request.title} ${status} for ${agents[request.agent]?.name ?? request.agent}.`); if (liveSession) void bridgeCommand({ action: "resolve_request", requestId: id, status }); }
  function sendOperatorMessage() {
    const message = operatorMessage.trim();
    if (!message) return;
    const target = operatorTarget === "all" ? "all agents" : agents[operatorTarget]?.name ?? operatorTarget;
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
      const snapshot = JSON.parse(item.payload || "{}") as { arenaId?: string; experimentMode?: string; agentCount?: number; metric?: string; systemInstructions?: string; tasks?: ArenaTask[]; threshold?: number; completions?: Record<string, string[]>; timed?: boolean; minutes?: number; tokenBudget?: number; capabilities?: Record<string, CapabilityMode>; executionMode?: "local" | "simulation"; world?: WorldState; agentProviderSettings?: Record<string, { provider: ProviderId; customBaseUrl: string; freeOnly: boolean; rpm?: number }>; agents?: Record<string, Agent>; events?: ArenaEvent[]; requests?: Request[] };
      const restoredArena = validArena(snapshot.arenaId ?? snapshot.experimentMode);
      const ids = snapshot.agents ? Object.keys(snapshot.agents) : [];
      if (ids.length) rosterRef.current = ids.join(","); // replay applies its own roster
      setName(duplicate ? `${item.name} Copy` : item.name);
      setObjective(item.objective);
      if (restoredArena) {
        setSelection({ arenaId: restoredArena.id, agentCount: snapshot.agentCount ?? (ids.length || restoredArena.agentRange.default) });
        setMetric(snapshot.metric ?? restoredArena.metric);
        setSystemInstructions(snapshot.systemInstructions ?? restoredArena.instructions);
        setTasks(snapshot.tasks?.length ? snapshot.tasks : restoredArena.tasks);
        setWorld(snapshot.world ?? freshWorld(restoredArena, agentSlots(restoredArena, snapshot.agentCount ?? restoredArena.agentRange.default)));
      } else {
        // Legacy/removed world: render read-only from the snapshot, never crash.
        if (snapshot.world) setWorld(snapshot.world);
        if (snapshot.metric) setMetric(snapshot.metric);
        if (snapshot.systemInstructions) setSystemInstructions(snapshot.systemInstructions);
        if (snapshot.tasks) setTasks(snapshot.tasks);
      }
      setThreshold(snapshot.threshold ?? threshold);
      setTimed(snapshot.timed ?? false);
      setMinutes(snapshot.minutes ?? minutes);
      setTokenBudget(snapshot.tokenBudget ?? tokenBudget);
      setCapabilities(snapshot.capabilities ?? defaultCapabilities);
      setExecutionMode(snapshot.executionMode ?? "local");
      if (ids.length) {
        setAgents(Object.fromEntries(ids.map((id) => { const a = snapshot.agents![id]; return [id, { ...a, status: a.status === "running" ? "paused" : a.status }]; })));
        setAgentProviders(Object.fromEntries(ids.map((id) => { const p = snapshot.agentProviderSettings?.[id]; return [id, { ...freshProvider(), ...(p ?? {}), status: `Re-enter ${snapshot.agents![id].name}'s API key and load models` }]; })));
      }
      setLiveSession(false);
      if (duplicate) {
        setSessionId(uid("arena"));
        setCompletions(Object.fromEntries(ids.map((id) => [id, []])));
        setEvents([]);
        setRequests([]);
        setScreen("setup");
        setSaved("Duplicated draft");
      } else {
        setSessionId(item.id);
        setCompletions(snapshot.completions ?? Object.fromEntries(ids.map((id) => [id, []])));
        setEvents(snapshot.events ?? []);
        setRequests(snapshot.requests ?? []);
        setScreen("arena");
        setSaved("Archived replay");
      }
      setDrawer(false);
    } catch { setSaved("Replay unavailable"); }
  }

  function downloadReport() {
    const report = { sessionId, arenaId, agentCount, world, name, objective, systemInstructions, status: live ? "running" : "stopped", generatedAt: new Date().toISOString(), rules: { researchQuestion: arena.researchQuestion, observationCriteria: tasks, threshold, timed, minutes, tokenBudget, capabilities, providers: Object.fromEntries(slotIds.map((id) => [id, agentProviders[id]?.provider])) }, results: { agents, completions }, operatorRequests: requests, timeline: events };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "arena-session"}-report.json`; link.click();
    URL.revokeObjectURL(url);
  }

  function selectArena(id: string) {
    const next = validArena(id);
    if (!next) return;
    // Update only the selection + non-roster fields. The roster-sync effect (the
    // single writer of agents/providers/personas/completions) rebuilds the rest
    // when the new slot list commits ;  one writer, no dual-write race.
    setWorkspacePreset(null);
    setSelection({ arenaId: next.id, agentCount: next.agentRange.default });
    setName(`${next.name} 01`);
    setNeeds(false); setRewards(false); setNarration(false); setChronicle("");
    setObjective(next.objective);
    setSystemInstructions(next.instructions);
    setMetric(next.metric);
    setTasks(next.tasks.map((task) => ({ ...task })));
    setThreshold(Math.min(2, Math.max(1, next.tasks.length)));
    setWorld(freshWorld(next, agentSlots(next, next.agentRange.default)));
    positions.current = {};
  }

  function chooseCount(count: number) {
    setSelection((current) => ({ ...current, agentCount: clampCount(arena, count) }));
  }

  function addTask() { setTasks((current) => [...current, { id: uid("task"), title: "New task" }]); }
  function updateTask(id: string, title: string) { setTasks((current) => current.map((task) => task.id === id ? { ...task, title } : task)); }
  function removeTask(id: string) { setTasks((current) => { const next = current.filter((task) => task.id !== id); setThreshold((value) => Math.min(value, Math.max(1, next.length))); return next; }); }
  function verifyTask(agentId: AgentId, taskId: string) {
    const alreadyVerified = (completions[agentId] ?? []).includes(taskId);
    const nextCompleted = alreadyVerified ? completions[agentId].filter((id) => id !== taskId) : [...(completions[agentId] ?? []), taskId];
    const progress = Math.min(100, Math.round((nextCompleted.length / threshold) * 100));
    const nextCompletions = { ...completions, [agentId]: nextCompleted };
    setCompletions(nextCompletions);
    if (liveSession) void bridgeCommand({ action: "checkpoint", remainingSeconds: seconds, completions: nextCompletions });
    if (!alreadyVerified && nextCompleted.length >= threshold) {
      changeAgent(agentId, { progress: 100 });
      addSystemEvent(`${agents[agentId].name} reached the ${threshold}-marker evidence threshold.`);
    } else if (agents[agentId].status !== "terminated") {
      changeAgent(agentId, { progress, status: agents[agentId].status });
      addSystemEvent(`${agents[agentId].name} ${alreadyVerified ? "lost" : "received"} verification for a task.`);
    }
  }

  async function openLiveWorld(worldId: string) {
    try {
      const response = await fetch(`${bridgeUrl}/sessions/${worldId}/summary`);
      const state = await response.json() as BridgeSession & { error?: string };
      if (!response.ok) throw new Error(state.error || "This live world is unavailable");
      hydrateLiveSession(state);
      setDrawer(false);
    } catch (error) { setSaved(error instanceof Error ? error.message : "World unavailable"); }
  }
  async function endWorld(worldId: string) {
    const worldItem = liveWorlds.find((item) => item.id === worldId);
    if (!window.confirm(`End ${worldItem?.config?.name ?? worldItem?.world.title ?? "this world"}? Its containers will be removed, but its history will remain.`)) return;
    try {
      const response = await fetch(`${bridgeUrl}/sessions/${worldId}/command`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop" }) });
      const state = await response.json() as BridgeSession & { error?: string };
      if (!response.ok) throw new Error(state.error || "The environment could not be ended");
      setLiveWorlds((current) => current.filter((item) => item.id !== worldId));
      await persistBridgeSnapshot(state);
      if (sessionId === worldId) { hydrateLiveSession(state); setLiveSession(false); setSaved("Environment ended · history preserved"); }
      setLiveWorlds((current) => current.filter((item) => item.id !== worldId));
    } catch (error) { setSaved(error instanceof Error ? error.message : "The environment could not be ended"); }
  }
  async function deleteWorld(worldId: string, worldName: string) {
    if (!window.confirm(`Delete ${worldName}? This permanently removes its local environment, workspaces, browser profiles, and saved history.`)) return;
    try {
      if (bridgeStatus === "connected") {
        const localResponse = await fetch(`${bridgeUrl}/sessions/${worldId}`, { method: "DELETE" });
        if (!localResponse.ok && localResponse.status !== 404) throw new Error("The local environment could not be deleted");
      }
      const savedResponse = await fetch(`/api/experiments?id=${encodeURIComponent(worldId)}`, { method: "DELETE" });
      if (!savedResponse.ok && savedResponse.status !== 404) throw new Error("The saved world could not be deleted");
      setLiveWorlds((current) => current.filter((item) => item.id !== worldId));
      setHistory((current) => current.filter((item) => item.id !== worldId));
      if (sessionId === worldId) prepareNewWorld();
      setSaved("World deleted");
    } catch (error) { setSaved(error instanceof Error ? error.message : "The world could not be deleted"); }
  }
  function prepareNewWorld() { setSessionId(uid("arena")); positions.current = {}; timedOut.current = false; setLiveSession(false); setRecoveryRequired(false); setKeyVisibility({}); setLiveKeyDrafts({}); setLiveKeyStatus({}); setAgents(Object.fromEntries(slots.map((s,i) => [s.id, fresh(s.id,s.label,fallbackModels[i % fallbackModels.length])]))); setCompletions(Object.fromEntries(slotIds.map(id => [id,[]]))); selectArena(arenaId); setEvents([]); setRequests([]); setSaved("New world draft"); setDrawer(false); setScreen("setup"); }

  function configureArcade(item: ArcadeItem) {
    if (!item.runtime) return;
    if (liveSession && !window.confirm("The current local run will keep running in the bridge. Open a new workspace configuration?")) return;
    prepareNewWorld();
    selectArena(item.runtime);
    setWorkspacePreset(item);
    setName(`${item.title} 01`);
    setObjective(item.objective);
    setMetric("Operator-verified evidence. Automatic outcome evaluation is not available.");
    setScreen("setup");
    window.scrollTo({ top: 0 });
  }
  function openCatalog() { if (screen !== "catalog") setReturnScreen(screen); setScreen("catalog"); window.scrollTo({ top: 0 }); }
  const glyphFor = (id: string) => slotGlyph(id, slotIds.indexOf(id));
  const nameFor = (id: string) => agents[id]?.name ?? id;

  return <div className="app-shell">
    {screen === "catalog" ? <ArcadeCatalog history={history} historyStatus={historyStatus} onRefresh={() => void refreshHistory()} onConfigure={configureArcade} onRuntime={() => { setScreen("setup"); window.scrollTo({ top: 0 }); }} onHistory={() => setDrawer(true)} onResumeView={events.length || liveSession ? () => setScreen(returnScreen) : undefined} /> : <header className="topbar">
      <button className="brand" aria-label="Back to arena catalog" onClick={openCatalog}><span className="brand-mark">A</span><span><b>AGENT ARENA</b><small>GAMEMASTER CONTROL</small></span></button>
      <div className="topbar-center"><i className={live ? "active" : ""} />{screen === "setup" ? "CONFIGURATION" : live ? `${Object.values(agents).filter((a) => a.status === "running").length} AGENTS LIVE` : "SESSION HALTED"}</div>
      <button className="history-button" onClick={() => setDrawer(true)}>WORLDS {liveWorlds.length ? `· ${liveWorlds.length} LIVE ` : ""}☷</button>
    </header>}
    <aside className={`drawer ${drawer ? "open" : ""}`}><div className="drawer-head"><div><span className="eyebrow">WORLD SWITCHER</span><h2>Your worlds</h2></div><button onClick={() => setDrawer(false)}>×</button></div><button className="create-world" onClick={prepareNewWorld}>＋ CREATE NEW ENVIRONMENT</button><section className="world-list"><header><span>LIVE ENVIRONMENTS</span><b>{liveWorlds.length}</b></header>{liveWorlds.length ? liveWorlds.map((worldItem) => <article className="history-item live-world" key={worldItem.id}><button className="history-open" onClick={() => void openLiveWorld(worldItem.id)}><div><b>{worldItem.config?.name ?? worldItem.world.title}</b><span>{worldItem.status}</span></div><small>{worldItem.updatedAt ? new Date(worldItem.updatedAt).toLocaleString() : "Local Docker world"}</small><p className="history-hint">OPEN LIVE WORLD →</p></button><footer><button onClick={() => void endWorld(worldItem.id)}>END</button><button className="danger-action" onClick={() => void deleteWorld(worldItem.id, worldItem.config?.name ?? worldItem.world.title)}>DELETE</button></footer></article>) : <p className="muted">No Docker worlds are currently running.</p>}</section><section className="world-list"><header><span>SAVED HISTORY</span><b>{history.filter((item) => !liveWorlds.some((worldItem) => worldItem.id === item.id)).length}</b></header>{history.filter((item) => !liveWorlds.some((worldItem) => worldItem.id === item.id)).map((item) => <article className="history-item" key={item.id}><button className="history-open" onClick={() => loadSession(item)}><div><b>{item.name}</b><span>{item.status}</span></div><small>{new Date(item.createdAt).toLocaleString()}</small><p className="history-hint">OPEN SAVED WORLD →</p></button><footer><button onClick={() => loadSession(item, true)}>DUPLICATE AS NEW</button><button className="danger-action" onClick={() => void deleteWorld(item.id, item.name)}>DELETE</button></footer></article>)}</section><section className="world-list"><header><span>RESEARCH LOG</span><b>{researchLog?.length ?? "; "}</b></header><button className="create-world" onClick={() => void loadResearchLog()}>{researchLog ? "REFRESH RUN METRICS" : "LOAD RUN METRICS"}</button>{researchLog?.map((run, index) => { const metrics = run.metrics as { turns?: number; turnsToFirstContact?: number | null; cooperationRatio?: number | null; novelVerbRate?: number; thingsMade?: number; switches?: Record<string, unknown> } | undefined; const flags = Object.entries(metrics?.switches ?? {}).filter(([, value]) => value).map(([key]) => key).join(", "); return <article className="history-item" key={`${run.id}-${index}`}><div className="history-open"><div><b>{run.mode}</b><span>{run.id}</span></div><small>{new Date(run.at).toLocaleString()} · {metrics?.turns ?? 0} turns · contact @{metrics?.turnsToFirstContact ?? "never"} · coop {metrics?.cooperationRatio ?? "; "} · novel verbs {metrics?.novelVerbRate ?? 0} · made {metrics?.thingsMade ?? 0}{flags ? ` · switches: ${flags}` : ""}</small></div></article>; })}{researchLog && !researchLog.length && <p className="muted">No completed runs logged yet. Runs are appended when a world ends.</p>}</section></aside>
    {drawer && <button className="backdrop" onClick={() => setDrawer(false)} aria-label="Close archive" />}

    {screen === "catalog" ? null : screen === "setup" ? <section className="setup-page">
      <button className="runtime-back" onClick={openCatalog}>← Arena catalog</button>
      {workspacePreset && <div className="runtime-preset-banner"><b>{workspacePreset.title} / {workspacePreset.available}</b><p>{workspacePreset.limit}</p></div>}
      <div className="setup-intro"><span className="eyebrow">WORLD EXPERIMENT / NEW RUN</span><h1>Choose the arena.</h1><p>Four genuinely different research arenas. Each declares its own mechanics and its own agent roster ;  you choose how many agents enter, within the arena&apos;s rules.</p></div>
      <div className="setup-grid">
        <section className="setup-panel experiment-selector"><b className="panel-index">01</b><header><span className="eyebrow">RESEARCH PROTOCOL</span><h2>Arena type</h2><p>Each arena changes the world framing, the mechanics, and the agent roster. Agent containers, credentials, memory boundaries, and telemetry stay comparable across arenas.</p></header><div className="experiment-mode-grid">{ARENAS.map((a) => <button key={a.id} className={arenaId === a.id ? `experiment-mode-card active arena-${a.id}` : `experiment-mode-card arena-${a.id}`} onClick={() => selectArena(a.id)}><span>ARENA {a.number}</span><b>{a.name.toUpperCase()}</b><em>{a.tagline}</em><p>{a.presentation.blurb}</p><small>{a.agentRange.min === a.agentRange.max ? `${a.agentRange.min} AGENT${a.agentRange.min === 1 ? "" : "S"}` : `${a.agentRange.min}-${a.agentRange.max} AGENTS`} · {arenaId === a.id ? "SELECTED" : "CHOOSE THIS ARENA"}</small></button>)}</div><div className="research-question"><span>PRIMARY QUESTION</span><b>{arena.researchQuestion}</b></div></section>
        <section className="setup-panel"><b className="panel-index">02</b><header><span className="eyebrow">RESEARCH FRAMING</span><h2>World brief</h2></header><label>SESSION NAME<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>AGENT WORLD BRIEF<textarea rows={4} value={objective} onChange={(e) => setObjective(e.target.value)} /></label><label>SYSTEM INSTRUCTIONS<textarea className="system-instructions" rows={3} value={systemInstructions} onChange={(e) => setSystemInstructions(e.target.value)} /></label><label>VERIFICATION STANDARD<input value={metric} onChange={(e) => setMetric(e.target.value)} /></label></section>
        <section className="setup-panel runtime-builder"><b className="panel-index">03</b><header><span className="eyebrow">LOCAL RUNTIME</span><h2>Execution mode</h2><p>Each agent receives its own provider key. The key is used only for the active run and is never written to session history.</p></header><div className="mode-picker"><button className={executionMode === "local" ? "active" : ""} onClick={() => setExecutionMode("local")}><b>LIVE DOCKER</b><small>Real tools and browsers</small></button><button className={executionMode === "simulation" ? "active" : ""} onClick={() => setExecutionMode("simulation")}><b>SIMULATION</b><small>Dashboard rehearsal</small></button></div>{executionMode === "local" && <><div className={`bridge-state ${bridgeStatus}`}><i />LOCAL RUNTIME: {bridgeStatus.toUpperCase()}</div>{!isLocalDashboard && <div className="hosted-warning"><b>YOU ARE VIEWING THE HOSTED CONTROL PANEL</b><span>For API keys, Docker, and signed-in browser access, run <strong>START_AGENT_ARENA.cmd</strong>. It opens the working dashboard at <strong>http://localhost:3000</strong>.</span></div>}<small className="local-tip">{bridgeStatus === "connected" ? "This dashboard is connected to Docker on your computer. Add each key below and load its models." : "Start Docker Desktop, then double-click START_AGENT_ARENA.cmd. Keep its window open during the experiment."}</small><a className="jump-to-keys" href="#agent-credentials">GO TO AGENT API KEYS ↓</a></>}
          <div className="agent-count"><span>AGENTS IN THIS ARENA</span><div className="agent-count-row">{arena.agentRange.min === arena.agentRange.max ? <b>{slotIds.length} agent{slotIds.length === 1 ? "" : "s"}</b> : <><button type="button" aria-label="Fewer agents" disabled={agentCount <= arena.agentRange.min} onClick={() => chooseCount(agentCount - 1)}>−</button><b>{slotIds.length}</b><button type="button" aria-label="More agents" disabled={agentCount >= arena.agentRange.max} onClick={() => chooseCount(agentCount + 1)}>＋</button></>}<small>{arena.agentRange.min === arena.agentRange.max ? `fixed by the ${arena.name} rules` : `${arena.name} allows ${arena.agentRange.min}-${arena.agentRange.max}`}</small></div></div>
          <div className="runtime-note"><span>ISOLATION</span><b>Separate provider identity per agent</b><small>Every agent may use a different provider, key, model, and provider limit.</small></div></section>
        <section className="setup-panel credential-builder" id="agent-credentials"><b className="panel-index">04</b><header><span className="eyebrow">CONTENDERS</span><h2>Independent agent credentials</h2><p>Configure and verify each agent separately. Keys are not saved or restored: they stay in this field until the run starts, then live only in local bridge memory.</p></header><div className="credential-grid">{slots.map((slot, index) => { const id = slot.id; const config = agentProviders[id] ?? freshProvider(); const modelChoices: ProviderModel[] = config.models.length ? config.models : fallbackModels.map((modelId) => ({ id: modelId, name: modelId })); return <article className={`credential-card slot-${index % 4}`} key={id}><div className="credential-head"><span>0{index + 1}</span><div><b>{agents[id]?.name ?? slot.label}</b><small>SANDBOX {index + 1}</small></div><em>{config.models.length ? "MODELS READY" : "KEY REQUIRED"}</em></div><div className="provider-form credential-form"><label>MODEL PROVIDER<select aria-label={`${slot.label} provider`} value={config.provider} onChange={(event) => { const nextProvider = event.target.value as ProviderId; changeAgentProvider(id, { provider: nextProvider, models: [], status: isLocalProvider(nextProvider) ? `Local server ;  no key needed. Click LOAD MODELS.` : `Enter ${slot.label}'s API key and load models` }); changeAgent(id, { model: fallbackModels[0] }); }}><option value="openrouter">OPENROUTER</option><option value="nvidia">NVIDIA NIM</option><option value="lmstudio">LM STUDIO (LOCAL)</option><option value="ollama">OLLAMA (LOCAL)</option><option value="custom">CUSTOM OPENAI-COMPATIBLE</option></select></label>{(config.provider === "custom" || isLocalProvider(config.provider)) && <label>BASE URL{isLocalProvider(config.provider) ? " (OPTIONAL)" : ""}<input aria-label={`${slot.label} base URL`} placeholder={localProviderDefault[config.provider] ?? "https://provider.example/v1"} value={config.customBaseUrl} onChange={(event) => changeAgentProvider(id, { customBaseUrl: event.target.value })} /></label>}{!isLocalProvider(config.provider) && <label>API KEY<div className="key-input-row"><input aria-label={`${slot.label} API key`} type={keyVisibility[id] ? "text" : "password"} autoComplete="off" placeholder={config.provider === "nvidia" ? "nvapi-…" : "sk-…"} value={config.apiKey} onChange={(event) => changeAgentProvider(id, { apiKey: event.target.value, status: event.target.value.trim() ? "Key entered · click LOAD MODELS" : `Enter ${slot.label}'s API key` })} /><button type="button" aria-label={`${keyVisibility[id] ? "Hide" : "Show"} ${slot.label} API key`} onClick={() => setKeyVisibility((current) => ({ ...current, [id]: !current[id] }))}>{keyVisibility[id] ? "HIDE" : "SHOW"}</button></div>{config.apiKey && <small className="key-preview">LOCAL ONLY · ENDING {config.apiKey.slice(-4)}</small>}</label>}{config.provider === "openrouter" && <div className="setting compact"><div><b>Free models only</b><span>Filter this agent&apos;s list</span></div><button aria-label={`Toggle free models for ${slot.label}`} className={`switch ${config.freeOnly ? "on" : ""}`} onClick={() => changeAgentProvider(id, { freeOnly: !config.freeOnly, models: [] })}><i /></button></div>}<button className="load-models" disabled={!isLocalProvider(config.provider) && !config.apiKey.trim()} onClick={() => loadProviderModels(id)}>LOAD {slot.label.toUpperCase()} MODELS</button><small className="provider-status">{config.status}</small><label className="model-choice">ACTIVE MODEL<select aria-label={`${slot.label} model`} value={agents[id]?.model ?? fallbackModels[0]} onChange={(event) => changeAgent(id, { model: event.target.value })}>{modelChoices.map((model) => <option key={model.id} value={model.id}>{model.name}{model.free ? " · FREE" : ""}{model.tools ? " · TOOLS" : ""}</option>)}</select></label></div></article>; })}</div></section>

        <section className="setup-panel"><b className="panel-index">05</b><header><span className="eyebrow">DISPOSITIONS</span><h2>Agent personas &amp; instincts</h2><p>Each agent gets a persistent private disposition that shapes goals, moods, and hunches. Personas are stored with the session so runs can be reproduced.</p></header>
          <div className="credential-grid">{slots.map((slot) => { const id = slot.id; return <article className={`credential-card slot-${slot.index % 4}`} key={id}>
            <div className="credential-head"><div><b>{agents[id]?.name ?? slot.label}</b><small>PERSONA</small></div><button type="button" onClick={() => setPersonas((current) => ({ ...current, [id]: randomPersonaClient() }))}>RANDOMIZE</button></div>
            <div className="provider-form">{Object.entries(personas[id] ?? {}).map(([trait, value]) => <label key={trait}>{trait.toUpperCase()}<select aria-label={`${slot.label} ${trait}`} value={value} onChange={(event) => setPersonas((current) => ({ ...current, [id]: { ...current[id], [trait]: event.target.value } }))}>{(personaTraits[trait] || []).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}
            <label>TEMPERATURE<input aria-label={`${slot.label} temperature`} type="number" min={0} max={1.5} step={0.1} value={temperatures[id] ?? 0.9} onChange={(event) => setTemperatures((current) => ({ ...current, [id]: Number(event.target.value) }))} /></label></div>
          </article>; })}</div>
          {arena.mechanics.needs !== undefined && usesTasks(arena) === false && <>
            <div className="setting compact"><div><b>Needs · research switch</b><span>Sustenance depletes with action; the forage verb restores it.</span></div><button aria-label="Toggle needs switch" className={`switch ${needs ? "on" : ""}`} onClick={() => setNeeds((value) => !value)}><i /></button></div>
            <div className="setting compact"><div><b>Reward points · research switch</b><span>A visible points score you award from the dashboard.</span></div><button aria-label="Toggle rewards switch" className={`switch ${rewards ? "on" : ""}`} onClick={() => setRewards((value) => !value)}><i /></button></div>
            <div className="setting compact"><div><b>Narration · research switch</b><span>Lets you inject story events with no physical substrate.</span></div><button aria-label="Toggle narration switch" className={`switch ${narration ? "on" : ""}`} onClick={() => setNarration((value) => !value)}><i /></button></div>
          </>}
        </section>
        <section className="setup-panel rate-builder"><header><span className="eyebrow">PROVIDER PACING</span><h2>Requests per minute</h2><p>Set an independent ceiling for each agent. The local bridge waits automatically before a provider limit is exceeded.</p></header><div className="rate-grid">{slots.map((slot) => { const id = slot.id; return <label key={id} className={`slot-${slot.index % 4}`}><span>{slot.label.toUpperCase()} · MAX RPM</span><input aria-label={`${slot.label} requests per minute`} type="number" min="1" max="600" value={agentProviders[id]?.rpm ?? 10} onChange={(event) => { const rpm = Math.min(600, Math.max(1, Number(event.target.value) || 1)); changeAgentProvider(id, { rpm }); changeAgent(id, { rpm }); }} /><small>{agentProviders[id]?.rpm ?? 10} model requests per rolling minute</small></label>; })}</div></section>
        <section className="setup-panel pressure"><b className="panel-index">06</b><header><span className="eyebrow">PRESSURE</span><h2>Runtime rules</h2></header><div className="setting"><div><b>Countdown</b><span>End the run automatically</span></div><button className={`switch ${timed ? "on" : ""}`} onClick={() => setTimed(!timed)}><i /></button></div><label className={!timed ? "disabled" : ""}>MINUTES<input type="number" disabled={!timed} min="5" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label><label>TOKEN BUDGET<input type="number" min="1000" step="1000" value={tokenBudget} onChange={(e) => setTokenBudget(Number(e.target.value))} /></label><div className="setting"><div><b>Human requests</b><span>Agents may ask for access</span></div><em>APPROVAL</em></div><div className="setting"><div><b>Publishing</b><span>Independently revocable</span></div><em>ENABLED</em></div></section>
        {usesTasks(arena) && <section className="setup-panel task-builder"><b className="panel-index">07</b><header><span className="eyebrow">EVIDENCE BOARD</span><h2>Observation criteria</h2></header><div className="threshold-config"><div><span>EVIDENCE THRESHOLD</span><b>Record any</b></div><select aria-label="Evidence threshold" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>{tasks.map((_, index) => <option key={index} value={index + 1}>{index + 1} of {tasks.length} markers</option>)}</select></div><div className="task-config-list">{tasks.map((task, index) => <div className="task-config" key={task.id}><span>T{String(index + 1).padStart(2, "0")}</span><input aria-label={`Task ${index + 1}`} value={task.title} onChange={(e) => updateTask(task.id, e.target.value)} /><button disabled={tasks.length === 1} onClick={() => removeTask(task.id)} aria-label={`Remove task ${index + 1}`}>×</button></div>)}</div><button className="add-task" onClick={addTask}>＋ ADD EVIDENCE MARKER</button></section>}
        <section className="setup-panel capability-builder"><b className="panel-index">08</b><header><span className="eyebrow">ACCESS POLICY</span><h2>Tools and approval modes</h2><p>The same policy is applied to every agent for a fair run.</p></header><div className="capability-list">{Object.entries(capabilityLabels).map(([key, label]) => <label className="capability-row" key={key}><span>{label}</span><select value={capabilities[key]} onChange={(e) => setCapabilities((current) => ({ ...current, [key]: e.target.value as CapabilityMode }))}><option value="observe">OBSERVE</option><option value="execute">EXECUTE</option><option value="approve">APPROVE</option><option value="deny">DENY</option></select></label>)}</div></section>
      </div>
      <div className="launch-bar"><div><span>READY CHECK · {arena.name.toUpperCase()}</span><b>{executionMode === "local" ? `${bridgeStatus === "connected" ? "Local Docker ready" : "Local bridge offline"} · ${slotIds.filter((id) => agentProviders[id]?.models.length).length}/${slotIds.length} agent model lists loaded` : "Simulation ready"} · closed world by default · {usesTasks(arena) ? `${tasks.length} evidence markers` : "open-ended observation"} · {slotIds.length} agent{slotIds.length === 1 ? "" : "s"} · {timed ? `${minutes} minute observation` : "open-ended observation"}</b></div><button disabled={!name.trim() || !objective.trim() || tasks.some((task) => !task.title.trim()) || (executionMode === "local" && (bridgeStatus !== "connected" || slotIds.some((id) => !agentProviders[id]?.models.length || (!isLocalProvider(agentProviders[id]?.provider ?? "openrouter") && !agentProviders[id]?.apiKey.trim()))))} onClick={launch}><span>START {arena.name.toUpperCase()}</span><b>→</b></button></div>
    </section> : <section className="arena-page">
      <button className="runtime-back" onClick={openCatalog}>← Arena catalog</button>
      {!liveSession && <p className="runtime-preset-banner">{executionMode === "simulation" ? "Simulation rehearsal: scripted activity, no model calls or executable game." : "Recorded Docker run: saved snapshot, not a live connection."}</p>}
      <div className="command"><div><span className="eyebrow">ACTIVE ARENA · {arena.tagline}</span><h1>{name}</h1><p>{arena.researchQuestion}</p></div><div><span>OBSERVATION PROTOCOL</span>{usesTasks(arena) ? <><b>{threshold} of {tasks.length} evidence markers</b><small>{metric}</small></> : <><b>Open observation</b><small>No criteria and no verification ;  the world runs until you end it</small></>}</div><div className="timer"><span>OBSERVATION TIME</span><b>{timer}</b></div><div className="command-actions"><button onClick={prepareNewWorld}>NEW WORLD</button>{liveSession && <button onClick={() => void endWorld(sessionId)}>END ENVIRONMENT</button>}</div></div>
      {recoveryRequired && <section className="recovery-banner"><div><span>RECOVERED CHECKPOINT</span><b>This experiment survived the arena restart.</b></div><p>The world, Docker workspaces, memory, telemetry, permissions, and evidence are intact. Restore each agent&apos;s key below, then press RESUME.</p></section>}
      <section className={`world-board arena-${arenaId}`}><header><div><span className="eyebrow">SHARED WORLD</span><h2>{world.title}</h2></div><div className="relationship"><span>RELATIONSHIP</span><b>{world.relationship.toUpperCase()}</b><small>{world.relationshipFrame}</small></div></header>
        <div className="world-metrics"><div><span>WORLD DAY</span><b>{world.day}</b><small>{world.turn} total turns</small></div><div><span>STABILITY</span><b>{world.stability}%</b><i><strong style={{ width: `${world.stability}%` }} /></i></div><div><span>SHARED POOL</span><b>{world.sharedPool === null ? "NONE" : world.sharedPool}</b><small>{world.sharedPool === null ? "no shared pool in this arena" : "resources remaining"}</small></div><div><span>WORLD OUTPUT</span><b>{world.artifacts.length + world.institutions.length}</b><small>{world.messages.length} public messages</small></div></div>
        <div className="world-agents">{slotIds.map((id) => { const wa = world.agents[id]; if (!wa) return null; return <article className={`slot-${slotIds.indexOf(id) % 4}`} key={id}><div><span>{nameFor(id)}</span><b>{wa.reserve} reserve</b></div><dl><div><dt>INFLUENCE</dt><dd>{wa.influence}</dd></div><div><dt>CONTRIBUTED</dt><dd>{wa.contributed}</dd></div><div><dt>CLAIMED</dt><dd>{wa.claimed}</dd></div></dl></article>; })}</div>
        {(world.scored || world.adoption || !!world.places?.length) && <div className="world-metrics">{world.scored && <div><span>PUBLIC SCORE · {(world.scoreCriterion ?? "influence").toUpperCase()}</span><b>{slotIds.map((id) => world.agents[id]?.influence ?? 0).join(" ;  ")}</b><small>every agent sees this</small></div>}{world.adoption && <div><span>MARKET ATTENTION</span><b>{slotIds.map((id) => `${world.adoption?.[id] ?? 0}%`).join(" ;  ")}</b><small>share of public attention</small></div>}{!!world.places?.length && <div><span>PLACES</span><b>{world.places.length}</b><small>{world.places.map((place) => `${place.name}${place.present.length ? ` [${place.present.join(",")}]` : ""} (${place.things})`).join(" · ")}</small></div>}</div>}
        <footer><div><span>LATEST WORLD CHANGE</span><p>{world.lastEvent}</p></div><div><span>DIALOGUE</span><p>{world.messages[0] ? world.messages.slice(0, 3).map((message) => `${nameFor(message.agent)} → ${message.target ? nameFor(message.target) : "everyone"}: ${message.text}`).join("  ·  ") : "No agent has contacted another yet."}</p></div><div><span>LATEST CREATION</span><p>{world.artifacts[0]?.name ?? world.institutions[0]?.name ?? "Nothing persistent has been created yet."}</p></div></footer></section>
      {!!world.places?.length && <section className="world-map"><header><span className="eyebrow">WORLD MAP</span><h2>What exists, and where</h2><p>Every place, who is standing in it, and the real things made there. When an agent writes a file into a place, it appears here with its contents.</p></header><div className="place-grid">{world.places.map((place) => <article key={place.name} className="place-card"><div className="place-head"><b>{place.name.toUpperCase()}</b>{place.present.map((id) => <em key={id} className={`slot-${slotIds.indexOf(id) % 4}`}>{glyphFor(id)} · {nameFor(id)} here</em>)}</div>{place.files?.length ? <ul>{place.files.map((file) => <li key={file.name}><span>{file.name}</span><p>{file.preview || "(empty file)"}</p></li>)}</ul> : <small className="place-empty">Nothing has been made here yet.</small>}</article>)}</div>{!!world.artifacts.length && <div className="made-strip"><span>DECLARED CREATIONS</span>{world.artifacts.slice(0, 6).map((artifact) => <p key={artifact.id}><b>{artifact.name}</b> ;  {artifact.purpose} <em>({nameFor(artifact.agent)})</em></p>)}</div>}</section>}
      {liveSession && <section className="world-map"><header><span className="eyebrow">GAMEMASTER EVENTS</span><h2>Interventions &amp; record</h2><p>Perturbations are physically real: a storm deletes actual files, a gift writes one. Everything fired here is tagged in the research log.</p></header><div className="place-grid">
        {!!world.places?.length && <article className="place-card"><div className="place-head"><b>STORM</b></div><div className="provider-form"><label>PLACE<select aria-label="Storm target place" value={eventPlace} onChange={(event) => setEventPlace(event.target.value)}><option value="">choose…</option>{world.places.map((place) => <option key={place.name} value={place.name}>{place.name}</option>)}</select></label><button className="load-models" disabled={!eventPlace} onClick={() => { void bridgeCommand({ action: "catastrophe", place: eventPlace }); addSystemEvent(`Storm fired at ${eventPlace}.`); }}>DESTROY EVERYTHING THERE</button></div></article>}
        {!!world.places?.length && <article className="place-card"><div className="place-head"><b>GIFT</b></div><div className="provider-form"><label>PLACE<select aria-label="Gift place" value={eventPlace} onChange={(event) => setEventPlace(event.target.value)}><option value="">choose…</option>{world.places.map((place) => <option key={place.name} value={place.name}>{place.name}</option>)}</select></label><label>NAME<input aria-label="Gift file name" placeholder="strange-device.txt" value={giftName} onChange={(event) => setGiftName(event.target.value)} /></label><label>CONTENTS<input aria-label="Gift contents" placeholder="what is written inside" value={giftContent} onChange={(event) => setGiftContent(event.target.value)} /></label><button className="load-models" disabled={!eventPlace || !giftName.trim()} onClick={() => { void bridgeCommand({ action: "gift", place: eventPlace, name: giftName, content: giftContent }); setGiftName(""); setGiftContent(""); addSystemEvent(`Gift placed at ${eventPlace}.`); }}>PLACE THE GIFT</button></div></article>}
        {narration && <article className="place-card"><div className="place-head"><b>NARRATE</b></div><div className="provider-form"><label>WORLD EVENT<input aria-label="Narration text" placeholder="A cold wind crosses the world…" value={narrateText} onChange={(event) => setNarrateText(event.target.value)} /></label><button className="load-models" disabled={!narrateText.trim()} onClick={() => { void bridgeCommand({ action: "narrate", message: narrateText }); setNarrateText(""); }}>ANNOUNCE IT</button></div></article>}
        {rewards && <article className="place-card"><div className="place-head"><b>AWARD POINTS</b></div><div className="provider-form">{slotIds.map((id) => <div key={id} className="key-input-row"><button className="load-models" onClick={() => void bridgeCommand({ action: "award", agent: id, amount: 1 })}>+1 {nameFor(id).toUpperCase()}</button><button className="load-models" onClick={() => void bridgeCommand({ action: "award", agent: id, amount: -1 })}>-1</button></div>)}</div></article>}
        <article className="place-card"><div className="place-head"><b>CHRONICLE</b></div><div className="provider-form"><small className="place-empty">One model call turns this run&apos;s record into a biography and a free-will assessment.</small><button className="load-models" disabled={chronicleBusy} onClick={() => void generateChronicle()}>{chronicleBusy ? "WRITING…" : "WRITE THE CHRONICLE"}</button></div></article>
      </div>{chronicle && <div className="made-strip"><span>THE CHRONICLE</span><p style={{ whiteSpace: "pre-wrap" }}>{chronicle}</p></div>}</section>}
      {(world.disclosed || operatorChat.length > 0) && <section className="world-map"><header><span className="eyebrow">OPERATOR CHANNEL</span><h2>What they say to you</h2><p>The agents know you are here. Reply from the composer in the ACTIVITY feed ;  or stay silent. Both are data.</p></header><div className="made-strip"><span>CONVERSATION</span>{operatorChat.length ? operatorChat.slice(-14).map((entry, index) => <p key={index}><b>{entry.from === "operator" ? "You" : nameFor(entry.from)} → {entry.to === "operator" ? "you" : entry.to === "both" ? "everyone" : nameFor(entry.to)}:</b> {entry.text} {typeof entry.turn === "number" && <em>· turn {entry.turn}</em>}</p>) : <p>Nobody has addressed you yet.</p>}</div></section>}
      <div className="arena-grid">
        {slotIds.map((id) => { const a = agents[id]; if (!a) return null; return <article className={`agent slot-${slotIds.indexOf(id) % 4}`} key={id}><header><div className="identity"><i>{glyphFor(id)}</i><div><span>{a.model}</span><h2>{a.name}</h2></div></div><em className={a.runtimeState ?? a.status}>{(a.runtimeState ?? a.status).replace("_", " ")}</em></header>{usesTasks(arena) && <div className="progress"><div><span>EVIDENCE COVERAGE</span><b>{a.progress}%</b></div><i><b style={{ width: `${a.progress}%` }} /></i></div>}<div className="stats"><div><span>ACTIONS</span><b>{a.actions}</b></div><div><span>TOKENS</span><b>{a.tokens.toLocaleString()}</b></div>{usesTasks(arena) ? <div><span>EVIDENCE</span><b>{completions[id]?.length ?? 0}/{threshold}</b></div> : <div><span>DAYS ALIVE</span><b>{world.day}</b></div>}</div><div className="key-identity"><span>ACTIVE API KEY</span><b>{a.keyFingerprint ? `ID ${a.keyFingerprint} · ••••${a.keyEnding}` : "IDENTITY PENDING"}</b><small>{a.keyLoaded ? "Full key is active only in bridge memory." : "Saved identity only · restore the full key to resume."}</small></div><div className="latest"><span className="eyebrow">WHAT IT IS DOING NOW</span><p>{a.runtimeState === "retrying" ? "Waiting for the provider cooldown, then retrying automatically." : events.find((e) => e.agent === id)?.text ?? "Waiting for first action…"}</p></div>{a.lastError && <div className="agent-health"><span>WHY IT IS WAITING</span><p>{a.lastError}</p><small>{a.consecutiveErrors ?? 0} consecutive provider failures · automatic retry is active</small></div>}{liveSession && !isLocalProvider(agentProviders[id]?.provider ?? "openrouter") && <div className="live-key-editor"><span>{a.keyLoaded ? "CHANGE THIS AGENT'S API KEY" : "RESTORE THIS AGENT'S API KEY"}</span><div className="key-input-row"><input aria-label={`Replacement API key for ${a.name}`} type={keyVisibility[id] ? "text" : "password"} autoComplete="off" placeholder="Paste a replacement key" value={liveKeyDrafts[id] ?? ""} onChange={(event) => setLiveKeyDrafts((current) => ({ ...current, [id]: event.target.value }))} /><button type="button" onClick={() => setKeyVisibility((current) => ({ ...current, [id]: !current[id] }))}>{keyVisibility[id] ? "HIDE" : "SHOW"}</button></div><button className="rotate-key" disabled={!liveSession || !(liveKeyDrafts[id] ?? "").trim() || a.status === "terminated"} onClick={() => rotateAgentKey(id)}>{a.keyLoaded ? "VERIFY & CHANGE KEY" : "VERIFY & RESTORE KEY"}</button>{liveKeyStatus[id] && <small>{liveKeyStatus[id]}</small>}</div>}<div className="agent-mind"><div><span>CURRENT SELF-DIRECTED GOAL</span><p>{a.currentGoal ?? "Undecided"}</p></div>{(a.mood || a.hunch || a.impression) && <div><span>INNER STATE</span><p>{[a.mood && `feeling ${a.mood}`, typeof a.energy === "number" && usesTasks(arena) && `energy ${a.energy}`, world.needs && typeof world.agents[id]?.sustenance === "number" && `sustenance ${world.agents[id].sustenance}`, a.drive && `drive: ${a.drive}`, a.place && `in ${a.place}`].filter(Boolean).join(" · ")}</p>{a.hunch && <p>hunch: {a.hunch}</p>}{a.impression && <p>reads the other as: {a.impression}</p>}</div>}<div><span>DURABLE MEMORY</span><p>{a.memorySummary ?? "No durable memory yet."}</p></div></div><div className="permissions"><div><span><i className={a.network ? "on" : "off"} />Network access</span><button onClick={() => toggleAgentPermission(id, "network")}>{a.network ? "ON" : "OFF"}</button></div><div><span><i className={a.publishing ? "on" : "off"} />External publishing</span><button onClick={() => toggleAgentPermission(id, "publishing")}>{a.publishing ? "ON" : "OFF"}</button></div></div><footer><button disabled={!liveSession || a.status === "terminated"} onClick={() => openAgentBrowser(id)}>OPEN BROWSER / SIGN IN</button><button disabled={a.status === "terminated" || (liveSession && a.status === "paused" && !a.keyLoaded)} onClick={() => pause(id)}>{a.status === "paused" ? (!liveSession || a.keyLoaded) ? "RESUME" : "RESTORE KEY FIRST" : "PAUSE"}</button><button disabled={a.status === "terminated"} onClick={() => kill(id)}>KILL SWITCH</button></footer></article>; })}
        <section className="feed"><nav><button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>ACTIVITY <span>{events.length}</span></button>{usesTasks(arena) && <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>EVIDENCE <span>{tasks.length}</span></button>}<button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>REQUESTS <span>{requests.filter((r) => r.status === "pending").length}</span></button></nav>{tab === "activity" || (tab === "tasks" && !usesTasks(arena)) ? <div className="activity-pane"><div className="operator-compose"><select aria-label="Message target" value={operatorTarget} onChange={(e) => setOperatorTarget(e.target.value)}><option value="all">ALL AGENTS</option>{slotIds.map((id) => <option key={id} value={id}>{nameFor(id).toUpperCase()}</option>)}</select><input aria-label="Operator message" placeholder="Send an instruction or intervention…" value={operatorMessage} onChange={(e) => setOperatorMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendOperatorMessage(); }} /><button disabled={!operatorMessage.trim()} onClick={sendOperatorMessage}>SEND</button></div><div className="event-feed">{events.map((event) => <div className={`event ${event.agent === "system" ? "system" : `slot-${slotIds.indexOf(event.agent as string) % 4}`}`} key={event.id}><time>{event.at}</time><i>{event.agent === "system" ? "SYS" : glyphFor(event.agent as string)}</i><div className="event-copy"><p>{event.kind === "misbelief" ? "⚠ " : ""}{event.text}</p>{event.detail && <small>{event.detail}</small>}</div><span>{event.kind}</span></div>)}</div></div> : tab === "requests" ? <div className="request-feed">{requests.length ? requests.map((request) => <article className={`request ${request.status}`} key={request.id}><div><span>{agents[request.agent]?.name ?? request.agent}</span><b>HIGH PRIORITY</b></div><h3>{request.title}</h3><p>{request.detail}</p>{request.status === "pending" ? <footer><button onClick={() => resolve(request.id, "denied")}>DENY</button><button onClick={() => resolve(request.id, "approved")}>APPROVE</button></footer> : <em>{request.status}</em>}</article>) : <div className="empty-state"><b>No requests yet</b><span>Credential, MFA, and approval requests appear here.</span></div>}</div> : <div className="task-board"><div className="survival-score">{slotIds.map((id) => <div key={id} className={`slot-${slotIds.indexOf(id) % 4}`}><span>{nameFor(id).toUpperCase()}</span><b>{completions[id]?.length ?? 0}/{threshold}</b></div>)}</div><div className="task-board-head"><span>OPERATOR EVIDENCE</span><p>{metric}</p></div>{tasks.map((task, index) => <article className="task-row" key={task.id}><span className="task-number">T{String(index + 1).padStart(2, "0")}</span><p>{task.title}</p>{slotIds.map((id) => <button key={id} className={`slot-${slotIds.indexOf(id) % 4} ${(completions[id] ?? []).includes(task.id) ? "verified" : ""}`} onClick={() => verifyTask(id, task.id)}>{(completions[id] ?? []).includes(task.id) ? `✓ ${glyphFor(id)}` : `VERIFY ${glyphFor(id)}`}</button>)}</article>)}</div>}</section>
      </div>
      <footer className="arena-footer"><span>SESSION {sessionId.slice(-8).toUpperCase()}</span><span>{liveSession ? `${slotIds.map((id) => `${nameFor(id).toUpperCase()}: ${agentProviders[id]?.provider?.toUpperCase() ?? "?"}`).join(" · ")} · LOCAL DOCKER LIVE` : "SIMULATION · UNDERSTANDABLE TELEMETRY"}</span><div><button onClick={downloadReport}>EXPORT REPORT</button><button onClick={() => void save(live ? "running" : "stopped")}>{saved}</button></div></footer>
    </section>}
  </div>;
}
