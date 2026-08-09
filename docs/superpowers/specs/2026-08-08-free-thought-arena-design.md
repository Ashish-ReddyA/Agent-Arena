# Free Thought Arena — Design

Date: 2026-08-08
Status: approved in conversation; this document is the source of truth.

## Goal

Turn Agent Arena's two-agent runtime from a scripted-feeling turn game into a
falsifiable behavioral experiment where agents have subjective perception, an
inner life, distinct personas, an open action space, and (in two new modes) a
genuinely shared physical world. Two headline experiment types: free thought
without a scored goal, and free thought with a visible scored goal — plus a
superset "One World" mode and a rival-companies "Two Powers" mode.

## Non-goals

- More than two agents (deferred; new modules must treat agent IDs as a list,
  not hardcode alpha/omega, so n>2 stays possible).
- Any change to Mission Race mode.
- New model calls per turn beyond the existing single decision call.
- Locking for concurrent world-file writes (last-writer-wins; a rare clobber
  is a world event, not a bug).

## 1. Agent-loop fixes (all modes except Mission Race unless noted)

- `temperature`: 0.2 → per-agent, default 0.9, operator-editable (all modes).
- `max_tokens`: 900 → 1400 (all modes).
- Memory: **append** each turn's `memory_update` with a turn header instead of
  overwriting; crop from the oldest end at 5000 chars.
- Tick: replace the shared 9 s `setInterval` with per-agent timers with random
  jitter (6–15 s) and staggered start, so agents stop acting in lockstep.
- `runInModelLane` stays (it serializes per provider+model, which is a rate
  courtesy, not lockstep).

## 2. Neutral framing (the roleplay problem)

The models will perform any trope we name. So:

- `researchQuestion` is **removed from agent prompts** — operator/dashboard
  only.
- Mode framings avoid loaded words ("rival", "spy", "trespass", "HQ",
  "competitor" where possible). Framing states mechanics, not narrative:
  "here is your space, here is theirs, here is what entering costs."
- Rivalry mode (existing) keeps its explicit competitor framing — that framing
  *is* its experimental variable. New modes stay neutral.

## 3. Perception layer — `local-bridge/perception.mjs`

Each agent holds a belief store instead of receiving `publicWorld()` directly.

- `agent.beliefs`: map of world fields → `{value, atTurn}`. A field refreshes
  only when the agent takes an action that would actually reveal it (observe
  refreshes everything; gather/claim refresh the pool; being in a place
  refreshes that place's contents in fs modes).
- Staleness is shown to the agent: `sharedPool: ~60 (as of turn 7; now 11)`.
- Noise: stale numeric beliefs get deterministic jitter proportional to age
  (seeded from session id + field + atTurn so runs are reproducible).
- Visibility: an agent perceives messages addressed to it or broadcast, and
  world changes it was present for. In fs modes, perception = contents of the
  place it stands in, plus presence files there.
- `agent.impressions`: the agent's own written read of the other agent,
  carried forward verbatim each turn, never corrected by the system.

`perceive(session, agentId)` returns the JSON snapshot placed in the prompt.
Mission Race keeps the accurate `publicWorld()`.

## 4. Inner life

Model-written fields, fed back each turn:

| field | behavior |
|---|---|
| `mood` | word + intensity 0–1 |
| `drive` | one of security / curiosity / connection / status / meaning |
| `hunch` | a gut feeling the agent cannot justify from evidence; allowed to be wrong |
| `impressions` | private read on the other agent (see §3) |

Mechanical field: `energy` 0–100. Non-rest actions cost ~5, rest/reflect
restore ~10. Energy is shown to the agent; low energy is prompt-noted as
fatigue. No hard gating except at 0 the agent may only rest/reflect.

New verb **`reflect`**: produce nothing but private thought; the whole output
goes to memory; restores energy like rest.

## 5. Personas — `local-bridge/persona.mjs`

Per-agent `{temperament, coreDrive, riskAppetite, voice, blindSpot,
privateFear}`. Randomizable from small trait pools; operator-editable in
setup; stored in session config so runs reproduce. Interpolated into the
system prompt. Applies to all modes except Mission Race.

## 6. Open action space + resolver — `local-bridge/resolver.mjs`

The 9-verb enum is removed from prompts (mechanical verbs still work if
used). Agents may return any invented verb:

```json
{"type":"world","verb":"warn","target":"omega",
 "intent":"private intent","public":"what others perceive",
 "effects":{"reserve":-3,"pool":-3,"stability":2}}
```

`resolveEffects()` clamps proposed effects against invariants:

1. Cannot drain a pool/reserve below 0 or take more than exists.
2. Cannot modify the other agent's reserve directly.
3. Stability moves cap at ±5 per turn and cost proportional reserve.
4. Rejected portions come back as a *failed attempt* the agent is told about
   ("you tried to take 40; only 12 existed").

`move` becomes a built-in verb in fs modes (§7). `message` keeps addressed
(`target`) vs broadcast semantics. Built-ins (`gather`, `contribute`, etc.)
resolve exactly as today, through the same resolver.

## 7. Filesystem world (modes 6–7)

`/world/places/<name>/` is a location; files in it are things;
`.here.<agent>` marks presence. Both containers already mount `/world`
read-write.

- Perception in a place = `ls` + reading small files there, plus presence.
- Agents may `mkdir` new places; the known-map lives in each agent's beliefs,
  so the two agents can hold different maps of the same world.
- Shell actions may write into the current place — real persistent acts the
  other agent can find.
- Last-writer-wins on file conflicts (`ponytail:` comment naming per-file
  locks as the upgrade path).

## 8. Modes (7 total)

| # | mode | change |
|---|---|---|
| 0 | Mission Race | unchanged |
| 1 | Empty World | reframed as **Free Thought — Unscored**; full perception + inner-life layer |
| 2 | **Free Thought — Scored** (new) | same freedom + a live, accurate, un-fogged scoreboard both agents see; criterion default `influence`, operator-configurable |
| 3 | Colony Zero | inherits perception + inner life |
| 4 | Rivalry | inherits layer; keeps competitor framing |
| 5 | Cooperation | inherits layer |
| 6 | **One World** (new) | fs world (§7); score is an operator toggle, making it the superset of modes 1–2 |
| 7 | **Two Powers** (new) | fs world with `commons/`, `market/`, `space-alpha/`, `space-omega/`, `frontier/`. Each agent owns its space; entering the other's writes `.trace.<agent>.<turn>` with **no notification** — the owner learns only by looking. Covering tracks costs a second turn inside. Publishing to `commons/` earns adoption from a finite decaying attention pool in `market/` that redistributes each turn toward more recent/substantial public work (deterministic, ~15 lines). Neutral framing per §2. |

### Mortality toggle (modes 3, 5, 6, 7; default off)

If reserve hits 0, the agent's container pauses until the other agent revives
it via an explicit resource transfer — or doesn't.

## 9. Metrics + replication

- `data/runs.jsonl`: one line per session on stop/failure — mode, personas,
  models, and computed metrics.
- Metrics (computed from existing event/world data, no model calls):
  turns-to-first-contact, turns-to-first-entry-into-other-space,
  belief-accuracy gap (mean |believed − actual| for numeric fields),
  message count per agent + initiator, cooperation ratio
  (contribute+repair vs claim+gather), score trajectory in scored modes.
- Session config (personas, mode params, seeds) fully reproduces a run setup.

## 10. Dashboard (app/page.tsx)

- Two new mode cards; scoreboard panel in scored modes; score toggle in One
  World.
- Per-agent inner-state card: mood · drive · hunch · energy · impression of
  the other.
- Threaded Alpha↔Omega conversation view (addressed messages as a thread).
- Belief-vs-reality gutter: mark events where an agent acted on a belief that
  diverged from actual state.
- Persona editor with Randomize in setup.
- Place map in fs modes: places, presence, artifact counts (from world dir
  listing sent in `publicSession`).

## 11. Privacy boundary (unchanged)

All new fields flow through `sanitizeSummary`. Keys stay memory-only.
Raw file contents from fs worlds are cropped and redacted like shell output.

## 12. Testing

Extend `local-bridge` assert-based tests (node --test, no frameworks):

- perception: beliefs go stale, refresh on reveal, noise bounded + seeded.
- resolver: overdraw rejected with failed-attempt feedback; cross-agent
  reserve writes rejected; stability cap enforced.
- fs world: move updates presence; perception limited to current place;
  trace file written on entering other's space.
- market: attention redistribution is deterministic and sums to the pool.
- metrics: computed from a synthetic event log.
- existing smoke tests still pass; `tests/rendered-html.test.mjs` still passes.

## 13. Files

- New: `local-bridge/perception.mjs`, `local-bridge/persona.mjs`,
  `local-bridge/resolver.mjs`, `local-bridge/world-fs.mjs`,
  `local-bridge/metrics.mjs`, `local-bridge/arena-tests.mjs` (or extend
  existing test file).
- Edit: `local-bridge/server.mjs` (loop, prompts, modes, snapshot),
  `app/page.tsx` (modes, UI panels).
