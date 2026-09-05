## September 5 Research Arcade verification

Test catalog selection, six unique concepts, three categories, planned/runnable status, details dialog close/Escape/focus restoration, library, experiment history empty/error states, comparison of saved snapshots, correct workspace preset selection, access to legacy Duel/Solo/Builder/Society modes, and simulated start/pause/resume/end. Repeat at 1440x1000 and 390x844. Audit document horizontal overflow, visible buttons smaller than 40px and fields without labels. Capture screenshots of catalog and setup. Run TypeScript, ESLint, build, existing registry/bridge tests and browser tests. Verify latest remote source on push and distinguish source delivery from hosted deployment.

# Agent Arena — Arena Redesign Test Plan

## Unit tests

- `arena/validate.mjs`
  - accepts the four shipped arenas (duel, solo, builder, society)
  - rejects: duplicate ids, missing required field, `agentRange.min > max`, `default` outside `[min,max]`, unknown mechanic flag, unsafe place name, fs arena without places
- `arena/slots.mjs`
  - `agentSlots(duel, 2)` → exactly 2 slots; `agentSlots(solo, 1)` → 1; builder 1..3; society 3..8
  - clamps/rejects a count outside the arena range
  - slot ids are unique and stable; two-agent arenas label alpha/omega, others label Agent 1..N
- Bridge `createWorld(arena, config, slots)`
  - builds a world whose `agents` map has one entry per slot (not hardcoded two)
  - applies mechanic flags (scored for duel, fs+places for solo/builder/society, sharedPool for duel/society, institutions for society, goalCheck for builder)
- Bridge smoke test (`local-bridge/smoke-test.mjs`)
  - still proves per-agent key isolation and the redaction boundary across the roster (each agent sends only its own key; raw output/keys never reach telemetry)

## Integration tests

- `POST /sessions/start`
  - accepts a valid roster for each arena; enforces agentRange (400 on too few/many)
  - 400 on unknown `arenaId`
  - solo sandbox starts exactly one container; society starts N containers
- `GET /health` lists `arenas: ["duel","solo","builder","society"]`
- Dashboard → bridge snapshot round-trip: a started session's `world.agents` keys match the roster slot ids

## API tests

- `app/api/experiments`: POST upserts with `payload.arenaId`; GET lists; DELETE removes. Payload with a non-string `arenaId` is rejected (400).

## UI tests (source-assertion, `tests/rendered-html.test.mjs`)

- `page.tsx` references the shared registry (imports `arena/`), renders the four arena names, and contains no `experimentModes`/`ExperimentMode`/`bareWorld` remnants
- agent config is slot-driven (no `agentProviders.alpha` / `agentProviders.omega` literals)
- bridge `server.mjs` has no `modeRules`, no `buildAgent("alpha", body.agents.alpha)` literal; still has key-safety invariants (`doesNotMatch(bridge, /session\.apiKey/)`)

## Critical user journeys (browser / manual)

1. App loads to the setup screen showing the four arena cards.
2. Select **Duel** → two agent cards appear → configure → launch **Simulation** → activity feed advances, score panel shows.
3. Select **Solo Sandbox** → exactly one agent card, no opponent UI → launch → single-agent beats play.
4. Select **Builder** → agent count stepper allows 1–3 → pick 2 → two cards → launch.
5. Select **Society** → stepper enforces 3–8 → pick 4 → four cards → launch → shared pool + places panels render.
6. Open History → load a session saved under a deleted legacy world → renders read-only, no crash.
7. Validation: setting an out-of-range count is blocked; required fields show errors.
8. No major console errors; no broken buttons; responsive at desktop (~1440px) and mobile (~390px).

## Edge cases

- Saved history from removed worlds (`island`, `hermit`, …) → read-only render, no crash.
- `agentCount` changed after selecting an arena → roster and per-slot state regenerate cleanly.
- Society at max (8) → board and config remain usable.
- Bridge receives a roster count that disagrees with `arenaId` range → 400, no containers started.

## Security checks

- No provider key is written to D1 `payload` or to disk (grep for `apiKey` in save path; assert `session.apiKey` absent).
- `/api/experiments` validates input; no unbounded payload write (size guard).
- Bridge rejects unknown arena ids and out-of-range rosters (no path injection via place/slot names — names sanitized by `safePlace`).
- `npm audit` reviewed; dependency set unchanged except what's required.
