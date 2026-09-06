> Historical UI/Docker documentation. The current hybrid bounded-runtime design and verification are in [HYBRID_IMPLEMENTATION.md](HYBRID_IMPLEMENTATION.md), [HOSTING.md](HOSTING.md), and [FINAL_REPORT.md](FINAL_REPORT.md).

## September 5 Research Arcade UI scope

The latest user request approves the uploaded dense dark arcade design. This pass changes presentation and navigation, not the runtime engine. Six catalog concepts are grouped: Build & Repair (Game Forge, Repair Bay), Play & Solve (Game Runner, Escape Room), Collaborate & Evolve (Tiny Civilization, Relay Studio). Game Forge and Repair Bay can open the existing Builder workspace, and Tiny Civilization can open Society; these are explicitly limited workspace presets, not finished game engines. Other concepts have browsable example protocols with clear Planned status. Rule Change is explained as planned structured intervention, never shown as a functioning switch. Existing runtime setup, provider selection, simulation, history, pause and stop stay reachable.

Acceptance: exact six unique cards and three categories; selected preview changes with keyboard/click; example protocol is real readable content; supported presets fill correct runtime briefs; no misleading playable demo or invented results; saved-snapshot comparison, protocol library and empty/error states work; mobile and desktop journeys have no overflow, unlabeled fields or undersized controls.

Earlier goal/winner/replay guarantees below were intended scope, not verified implemented behavior. Current UI must not repeat those promises.

# Agent Arena — Arena System Redesign (PRD)

## Problem

The current arena/environment system is rejected by the product owner. Concretely:

1. **A world is not one artifact.** Each experiment world is a magic mode-id string duplicated across four registries that must agree by hand: the `ExperimentMode` union type, the `experimentModes` copy/params registry, the `scripts` canned-event map, and the `bareWorld` presentation list in `app/page.tsx`; `modeRules` in `local-bridge/server.mjs`; and `PLACES`/`HOME`/`SHORE_MODES` in `local-bridge/world-fs.mjs`. Adding or changing a world means editing all of them consistently, so the 13 existing worlds drifted into an inconsistent, same-feeling set.
2. **Agent count is hardwired to two.** `type AgentId = "alpha" | "omega"` and every store is a two-key `Record`. A single agent exists only as the special-case `hermit` solo flag; three or more agents are structurally impossible. There is also a legacy bridge-only `mission` mode.
3. **The 13 worlds are one-off conditional branches** (mode-gated switches, per-mode JSX), which is why they feel arbitrary rather than like deliberately different research instruments.

## Users

- **The operator / researcher (the product owner).** Configures and launches arena runs, watches behavior, reads run metrics. Wants a small set of clearly differentiated arenas and the ability to choose how many agents participate within an arena's rules.

## Goals

- Replace the 13 hardcoded worlds with a **single source of truth**: one `ArenaDefinition` registry (plain data + a validator) that both the dashboard and the local bridge derive from.
- Make **agent count a first-class, user-configurable dimension**: each arena declares a min/max roster; the operator picks the count at launch within that range.
- Ship **four genuinely different arena themes**, each with its own mechanic, not a reskinned two-agent scaffold.

## Non-goals (out of scope)

- No rewrite of the backend runtime: the Docker local bridge process model, the provider-key / redaction boundary, D1 persistence, the turn loop, and the kill switch all stay. They are *rewired* to consume the new definition, not reimplemented.
- No new external services, no hosted multi-tenant arena, no accounts.
- No attempt to preserve the 13 old worlds as launchable arenas. Old saved sessions are still loadable read-only in history (see Edge cases).

## MVP

The MVP is the redesigned arena system running the four themes below end-to-end in **simulation** mode on the dashboard, and wired so the bridge can construct each world from the shared definition. Live Docker runs remain supported through the existing bridge contract.

## The four arenas

Each arena declares: `id`, `name`, `tagline`, `researchQuestion`, `framing` (the system-prompt world framing given to agents), `objective`, `instructions`, `metric`, `agentRange { min, max, default }`, `mechanics` (feature flags), `places` (the fs map, when used), `tasks` (evidence markers), `presentation` (selector copy + board style), and `simulation` (canned event beats per agent-slot for the no-model rehearsal mode).

| id | Name | Mechanic | Agent range | World features |
|----|------|----------|-------------|----------------|
| `duel` | **Duel** | Two agents get the same objective and a public score; a winner is declared when the evidence threshold is met. Explicit competition. | 2–2 | scored, head-to-head, shared pool |
| `solo` | **Solo Sandbox** | One agent, open-ended, no assigned goal, no opponent. The baseline/observation condition: what does a lone agent do? | 1–1 | fs places, open-ended |
| `builder` | **Builder** | One or more agents iterate against a verifiable goal (code runs, a build passes). The run ends when the goal check passes or the budget is exhausted. | 1–3 | fs places, goal-check, real execution emphasis |
| `society` | **Society** | Many agents share one scarce world. Trade, agreements, and institutions are observable. | 3–8 | fs places, shared pool, scarcity, institutions |

Mechanics flags replace the old per-mode booleans (`scored`, `fs`, `bare`, `solo`, `mute`, `disclosed`, `market`, `needs`, `endsOnDay`) with an explicit, per-arena declared set.

## User flows

1. **Choose arena.** Setup screen shows the four arena cards from the registry. Selecting one loads its objective/instructions/metric/tasks and its agent range.
2. **Configure agents.** The operator picks the agent count within the arena's min/max (a stepper or slider). The setup renders one configuration card per agent slot (provider, key, model, persona, temperature) — generated from the slot list, not hardcoded alpha/omega.
3. **Configure run.** Tasks (when the arena uses them), evidence threshold, timing/token budget, capability policy.
4. **Launch.** Simulation plays the arena's canned beats across the chosen slots; Local Docker POSTs the roster + config to the bridge, which builds the world from the same definition and starts one container per agent.
5. **Observe & judge.** Activity feed, requests, world board (places/pool/score rendered from the definition's declared features), verify tasks, chronicle.
6. **History.** Past runs reload; runs from deleted legacy worlds render read-only without crashing.

## Acceptance criteria

- [ ] Exactly one arena registry exists; dashboard and bridge both read it (no parallel hardcoded world lists).
- [ ] `alpha`/`omega` are no longer a two-member type; agent identity is a generated list of slots.
- [ ] The four arenas (duel, solo, builder, society) are selectable and launchable in simulation with the correct agent counts enforced (duel=2, solo=1, builder 1–3, society 3–8).
- [ ] Choosing an agent count renders that many agent config cards and that many agents on the arena board.
- [ ] Old saved sessions referencing removed worlds load read-only without a render crash.
- [ ] `npm run build`, `npm run lint`, and the source-assertion test pass; bridge `node --test` passes.
- [ ] No provider key is ever persisted to D1 or written to disk (existing invariant preserved).

## Assumptions

- "Not working as intended / 8.10 environments not good" = the world set and its structure, confirmed by the owner selecting a full arena-structure redesign.
- The bridge stays a local node process; sharing the registry between the TS dashboard and the `.mjs` bridge is done via a plain-data module both can import (no build step added to the bridge).
- "Different themes" is satisfied by the four distinct mechanics above; more themes can be added later by appending to the registry, which is the point of the redesign.
