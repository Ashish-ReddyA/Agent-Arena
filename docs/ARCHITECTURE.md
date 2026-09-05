## September 5 Research Arcade UI architecture

ArcadeCatalog is a client component mounted by Home as its default catalog screen. A separate typed presentation catalog declares six concepts and explicitly maps three to existing Builder/Society workspace presets. It does not add runtime arena ids. The existing arena registry remains authoritative for executable modes. Examples are declarative research protocols, not model-run results. Comparison reads existing snapshots without mutating them. No new API, secret, authentication, database schema or service. Illustration crops from the user-approved reference are bundled in self-contained SVG files embedding WebP images; no third-party image requests. Legacy setup/live controls receive a matching dark CSS layer. Deployment stays on the existing host and is not considered live without HTTP/browser evidence.

# Agent Arena — Arena Redesign Architecture

## Overview

One canonical, data-driven **arena registry** replaces the four parallel hardcoded world lists. The dashboard (TypeScript / vinext / React) and the local bridge (node ESM `.mjs`, no build step) both import the same plain-JavaScript modules. Agent identity is generalized from the `alpha`/`omega` two-member union to a generated **list of agent slots**.

## Single source of truth

New shared folder: `arena/`

```
arena/
  arenas.mjs       # the ARENAS array: plain data, one entry per arena (the ONLY place arenas are defined)
  validate.mjs     # validateArena() / validateArenas(): throws on a malformed entry; used by tests and at bridge boot
  slots.mjs        # agentSlots(arena, count): derive the roster -> [{ id, label, index }]; slotLabel(i) naming (Agent 1..N; alpha/omega labels for 2-agent arenas)
  mechanics.mjs    # feature-flag helpers: useFilesystem(arena), isScored(arena), hasSharedPool(arena), usesInstitutions(arena), hasGoalCheck(arena)
  index.d.ts       # TypeScript declarations so the dashboard gets full types from the .mjs data
```

- **Data, not code.** `arenas.mjs` exports a frozen array of plain objects. No conditionals, no imports. This is what makes "a world is one artifact" true.
- **Importable by both runtimes.** The bridge (`type: module`) imports `../arena/arenas.mjs` directly. The dashboard imports the same file; `index.d.ts` gives it types. No dual maintenance.
- **Validation, not convention.** `validate.mjs` enforces required fields, unique ids, sane `agentRange`, known mechanic flags, and place-name safety. The bridge validates at boot and refuses an unknown arena id with a 400 (replacing the `modeRules[mode]` guard).

### Arena definition shape

```js
{
  id: "duel",                       // unique, kebab-case
  number: "01",
  name: "Duel",
  tagline: "Scored head-to-head",
  researchQuestion: "...",
  framing: "...",                   // system-prompt world framing given to each agent
  objective: "...",
  instructions: "...",
  metric: "...",
  agentRange: { min: 2, max: 2, default: 2 },
  mechanics: {                      // explicit feature flags; absent === false
    scored: true, fs: false, sharedPool: true, scarcity: false,
    institutions: false, goalCheck: false, openEnded: false,
    solo: false, mute: false, disclosed: false, market: false,
    needs: false, endsOnDay: null
  },
  places: ["arena-floor", "workshop"],   // fs map; null when mechanics.fs is false
  home: ["agent-1-area", "agent-2-area"],// per-slot starting place when applicable (<= max slots)
  tasks: [{ id, title }],           // evidence markers (empty for open-ended arenas)
  relationship: "competitive",      // seed frame
  scoring: { criterion: "influence" | "points" | null },
  simulation: {                     // canned beats for the no-model rehearsal mode
    beats: { generic: ["...", "..."] }   // keyed by slot role or "generic"; cycled per slot
  },
  presentation: { accent: "red", blurb: "..." }
}
```

## Frontend (dashboard)

- `app/page.tsx` is refactored to consume the registry. `experimentModes`, `scripts`, `bareWorld`, and the `ExperimentMode` union are **deleted**. The mode selector renders `ARENAS.map(...)`. The world board reads `mechanics` to decide which panels (score, pool, places, institutions) to render, instead of per-mode JSX branches.
- **Agent slots.** `type AgentId = string` (a slot id). `agentSlots(arena, count)` produces the roster. All `Record<"alpha"|"omega", ...>` stores become `Record<string, ...>` keyed by slot id, built by iterating the slot list. The agent-config cards, the arena-board agent panels, personas, temperatures, completions, and provider configs are all slot-driven.
- A legacy-mode guard (`validArena()`) maps any removed/old mode id found in saved history to `null`, and history entries render read-only (name, objective, recorded events) without reconstructing a live board — so deleting the 13 worlds never crashes the render.

## Backend (local bridge) — rewired, not rewritten

Kept intact: the HTTP server, Docker lifecycle, per-agent turn loop, the provider-key/redaction boundary (keys memory-only, `session.apiKey` never present), the resolver/perception/persona/metrics modules, the kill switch, and the D1 snapshot contract.

Rewired to the registry:
- `server.mjs`: `modeRules` and `createWorld(modeId)` are replaced by `createWorld(arena, config, slots)` built from `ARENAS`. The `/sessions/start` handler reads a `roster` (array of slot configs) instead of `agents.alpha/omega`, enforces `agentRange`, and rejects unknown arena ids via the validator. The per-agent system prompt is generated from `arena.framing` + the arena's declared mechanics (replacing the long mode-conditional template string).
- `world-fs.mjs`: the `PLACES`/`HOME`/`SHORE_MODES` constants are replaced by lookups into the arena's `places`/`home`. `marketTick` and the twopowers-specific presence-trace logic are keyed off `mechanics.market` and per-slot home areas instead of literal `alpha`/`omega`.
- `otherOf()` is replaced by "the other slots" semantics for 2-agent mechanics and by group semantics for Society.

## Data model

D1 `experiments` table unchanged (`id, name, objective, status, payload, created_at, updated_at`). The `payload` JSON gains `arenaId` and `roster` (replacing `experimentMode` and the fixed alpha/omega agent objects). `app/api/experiments/route.ts` adds light validation that `payload.arenaId` (when present) is a string; payload remains an opaque snapshot otherwise. Keys are stripped before save (existing `safeProviders` behavior preserved).

## APIs / contracts

- Dashboard → bridge `POST /sessions/start`: `{ id, arenaId, roster: [{ slot, provider, model, baseUrl, apiKey, rpm, persona, temperature }], config: { name, objective, metric, systemInstructions, tasks, threshold, timed, minutes, tokenBudget, capabilities } }`.
- Bridge → dashboard: session snapshots carry `world` (built from the arena) and `agents` keyed by slot id.
- `GET /health` reports `arenas: ARENAS.map(a => a.id)` (replacing `worlds: Object.keys(modeRules)`).

## Environment variables

Unchanged: `ARENA_DATA_ROOT`, `ARENA_BRIDGE_PORT`. No new secrets. Provider keys remain user-supplied per agent, memory-only, never persisted.

## Deployment

Unchanged: dashboard builds with `vinext build` (Cloudflare worker via `worker/index.ts`, D1 binding `DB`); bridge runs locally via `START_AGENT_ARENA.cmd`. The `arena/` folder ships with the repo and is imported by both.
