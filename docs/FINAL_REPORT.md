# Agent Arena — Arena Redesign: Final Report

## What was requested

The product owner rejected the existing ~13 experiment worlds ("the 8.10 environments are not good") and asked for a full redesign of the **arena structure and dashboard presentation** — not the backend runtime. Goals: delete the existing environments, create a smaller set of genuinely different arenas, support one / two / many agents (not just two), and make the arenas feel like different research instruments (an agent in a game, an agent building until it gets something).

Confirmed scope decisions (owner, 2026-09-03): themes **Duel, Solo Sandbox, Builder, Society**; **user-configurable agent count** within each arena's min/max.

## What was implemented

### 1. Single source of truth for arenas — `arena/`

The core defect was that a world was a magic string duplicated across four registries that had to agree by hand. Replaced with one plain-data registry:

- `arena/arenas.mjs` — the `ARENAS` array. The ONLY place arenas are defined. Each entry declares id, name, tagline, research question, framing, objective, instructions, metric, `agentRange { min, max, default }`, explicit `mechanics` flags, `places`, `home`, `tasks`, `scoring`, `simulation.beats`, and `presentation`.
- `arena/validate.mjs` — `validateArenas()` enforces shape, unique ids, sane ranges, known mechanic flags, and safe place names. The bridge asserts validity at boot.
- `arena/slots.mjs` — `agentSlots(arena, count)` derives the roster as a list of slots. Two-agent arenas keep the familiar `alpha`/`omega` ids; other rosters are `agent-1..N`. `clampCount`/`countAllowed` enforce ranges.
- `arena/mechanics.mjs` — feature-flag readers (`useFilesystem`, `isScored`, `hasGoalCheck`, …).
- `arena/index.d.ts` — TypeScript declarations so the dashboard gets full typing from the `.mjs` data.

The dashboard (`app/page.tsx`) and the bridge (`local-bridge/server.mjs`) both import this same module. Deleted from the dashboard: the `ExperimentMode` union, `experimentModes`, `scripts`, `bareWorld`. Deleted from the bridge: `modeRules`, the legacy `mission` mode, the `alpha`/`omega` `buildAgent` literals, and `world-fs`'s hardcoded `PLACES`/`HOME`/`SHORE_MODES`.

### 2. The four arenas

- **Duel** (`duel`, 2 agents): same objective + public score, winner at the evidence threshold. Mechanics: scored, sharedPool, scarcity.
- **Solo Sandbox** (`solo`, 1 agent): open-ended, no goal/opponent/score, fs places. Mechanics: fs, openEnded, solo.
- **Builder** (`builder`, 1–3 agents): iterate toward a verifiable goal; the run ends when the goal check passes. Mechanics: fs, goalCheck.
- **Society** (`society`, 3–8 agents): many agents, one scarce shared world, trade + institutions. Mechanics: fs, sharedPool, scarcity, institutions, needs.

### 3. Agent-slot model (replaces the two-agent hardwire)

`AgentId` is now `string` (a slot id), not `"alpha" | "omega"`. All per-agent state (`agents`, `agentProviders`, `personas`, `temperatures`, `completions`, key drafts/visibility) is keyed by slot id and rebuilt from the roster. The selection (arena + count) is a single atomic state object so the derived roster can never mix one arena with another's count — this fixed a real dual-write race the E2E test caught.

### 4. Dashboard UI

- The setup selector renders the four arenas from the registry, each showing its agent range.
- A new **agent-count stepper** (in the runtime panel) lets the operator pick the roster size within the arena's min/max; the grid of credential/persona cards is generated from the slot list.
- The arena board, world-agents stats, score/market panels, place map, evidence board, and per-agent control cards are all slot-driven.
- `globals.css`: replaced the fixed `grid-template-areas: "alpha feed omega"` with a flexible `auto-fit` grid + a `slot-0..3` accent palette, so 1, 2, 3, or 8 agents lay out correctly.

### 5. Bridge rewiring (runtime preserved)

The Docker process model, provider-key/redaction boundary, turn loop, kill switch, perception/resolver/persona/metrics modules, and D1 snapshot contract are unchanged. Rewired: `createWorld(arena, config, slots)` builds the world from the arena; `/sessions/start` reads a `roster` array (or legacy keyed object), enforces the arena's agent range (400 on out-of-range), and rejects unknown arena ids; the per-agent system prompt is generated from the arena's framing + declared mechanics; `world-fs` derives places/home from the arena; `marketTick` works for any roster size.

### 6. API hardening

`app/api/experiments/route.ts` now validates input: id/length checks, a status allowlist, a 500 KB payload cap, JSON validity, and a `payload.arenaId` string check.

## Architecture

See `docs/ARCHITECTURE.md`. One diagram sentence: `arena/arenas.mjs` is the single definition; the dashboard renders the selector and roster from it, and POSTs `{ arenaId, roster, config }` to the local bridge, which builds the world from the same definition and starts one Docker container per roster slot.

## Features completed

- [x] Four redesigned arenas, each with a distinct mechanic
- [x] User-configurable agent count per arena (Duel=2, Solo=1, Builder 1–3, Society 3–8)
- [x] Single arena registry shared by dashboard + bridge (no parallel hardcoded lists)
- [x] Agent-slot identity replacing the alpha/omega union (1, 2, or N agents)
- [x] Slot-driven setup UI, world board, evidence board, and per-agent controls
- [x] Flexible CSS grid for any roster size
- [x] Legacy/removed arenas load read-only in history without crashing
- [x] API input validation + payload cap
- [x] Simulation rehearsal mode per arena (canned beats across the roster)

## Tests executed and results

- `npm test` (vinext production build + `tests/rendered-html.test.mjs`): **build OK, 4/4 pass.**
- `arena/arena.test.mjs` (registry/validator/slots/mechanics): **5/5 pass.**
- `local-bridge` `node --test tests/*.test.mjs` (world-fs, perception, persona, resolver, metrics): **21/21 pass.**
- `tests/e2e-smoke.mjs` (headless Chromium against the running app): **18/18 pass** — app loads, all four arenas render, Builder defaults to 1 and steps to 3, Society starts at 4 and clamps to its minimum of 3, Duel is fixed at 2, simulation launches into the board and produces activity, no major console errors.
- Typecheck `tsc --noEmit`: **0 errors** (also fixed pre-existing cloudflare/D1/drizzle type errors, so the suite is cleaner than the baseline).
- Lint `eslint`: **clean.**
- `npm audit`: **0 production vulnerabilities** (sharp/libvips CVEs are confined to dev-only `miniflare`/`@cloudflare/vite-plugin` tooling).
- API validation exercised live: valid POST → 201; bad arenaId type, bad status, missing fields → 400.

## Browser validation

The running dashboard was exercised in headless Chromium (Playwright) at desktop (1440×1000) and mobile (390×844) viewports. Critical journeys verified end-to-end: load, arena selection for all four arenas, agent-count stepper, roster min/max enforcement, and a simulation launch that advances the activity feed on the board. DOM audit: **0 px horizontal overflow** on both viewports; all form inputs labeled (added the one missing `aria-label`).

Note on environment: the sandbox's remote browser cannot reach a localhost dev server, and outbound tunneling (localtunnel/cloudflared) was blocked/unreliable, so live-Docker runs and a hosted browser session were not exercised here. Simulation mode and the full setup/configure/board flow were exercised for real in headless Chromium against the actual running app. Live Docker runs require the operator's machine (Docker Desktop + provider keys) and are covered by the bridge's own smoke tests, which require Docker and so were not run in this sandbox.

## Security checks

- Provider keys are sent only to the local bridge and cleared from dashboard fields on launch; the D1 payload carries only provider/url metadata, never keys.
- The bridge holds keys memory-only (`session.apiKey` never exists; keys wiped on stop/terminate); `sanitizeSummary` redaction is intact.
- Bridge rejects unknown arena ids and out-of-range rosters; place/slot names are sanitized (`safePlace`) so no path injection.
- No secrets in source; no new dependencies except dev-only `playwright-core` for the E2E test.
- `npm audit`: 0 production vulnerabilities.

## Known limitations

- Live Docker multi-container runs were not executed in this sandbox (no Docker). The bridge boots, validates the registry, and serves `/health` with the four arenas; container orchestration is exercised by `local-bridge` smoke tests on the operator's machine.
- The `Builder` goal-check is wired as a `finish → awaiting_verification` flow; an automated build-pass evaluator (running the agent's code and auto-scoring) is a defined extension point, not yet implemented.
- Saved history from the deleted legacy worlds renders read-only; it is not migrated into the new arenas.

## Assumptions

- "8.10 environments not good" meant the world set and its structure, confirmed by the owner choosing a full arena-structure redesign.
- The bridge stays a local node process; the registry is shared as plain `.mjs` data so no build step is added to the bridge.
- Two-agent arenas keep the `alpha`/`omega` ids for visual/historical continuity; all other rosters are `agent-1..N`.

## How to run

```powershell
# Dashboard (hosted build)
$env:WRANGLER_LOG_PATH='.wrangler/wrangler.log'
npm exec vinext build
node --test tests/rendered-html.test.mjs   # product-surface assertions
node --test arena/arena.test.mjs           # registry unit tests

# Local dev + E2E
npm run dev                                # http://localhost:3000
node tests/e2e-smoke.mjs                   # headless browser journey test

# Live runs (operator machine, Docker Desktop running)
START_AGENT_ARENA.cmd
cd local-bridge; npm run smoke             # key-isolation smoke test
```

## Recommended next steps

1. Run a live Docker Duel and a live Society (4 agents) on the operator's machine to validate the container path end-to-end.
2. Implement Builder's automated goal-check evaluator (run the artifact, parse pass/fail, auto-verify).
3. Add a "custom arena" affordance that writes a new entry into the registry from the UI (now trivial, since a world is one artifact).
4. Add per-arena accent color to the registry's `presentation.accent` and drive the CSS var from it, removing the last hardcoded arena-class CSS.
