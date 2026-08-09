# The Free Will Program — what AI agents do when nothing is asked of them

Date: 2026-08-09
Status: research plan. Supersedes the human-needs direction (rejected: simulated
hunger produces survival roleplay, not findings).

## The research question

Given genuine freedom — no objective, no score, no winner — what do AI agents
**choose** to do, build, and become? And which pressures change those choices?

"Free will" is operationalized, not metaphysical. We measure choice-like
behavior:

1. **Initiative** — goals the agent sets that no prompt suggested.
2. **Divergence** — identical world, identical persona, different run: how
   differently do lives unfold? (High divergence = choice-like; low = script.)
3. **Persistence** — multi-turn projects: does it *pursue* anything, or live
   turn to turn?
4. **Novelty** — invented verbs and acts outside every listed example.
5. **Care** — actions directed at the other agent with no material payoff.
6. **Refusal** — declining to engage with an affordance (ignoring the market,
   ignoring the score) is itself a choice and gets counted, not fixed.

The unit of finding is never one run. It is a **difference between conditions**
across repeated runs.

## Why past runs looked dull (constraints on any conclusion)

1. Every run so far executed as a mis-routed Mission on a stale bridge — the
   designed experiment has ~zero clean runtime. Nothing is concluded yet.
2. Free-tier models are weak actors; model quality is the single largest lever
   on interestingness and costs no code.
3. One 30-turn run is an anecdote. The program below assumes ≥5 runs per
   condition, 150+ turns each, mostly overnight.

## Phase 0 — Calibration (no new code)

Run the existing Island twice, clean: once with two free models, once with at
least one strong model (via OpenRouter or any OpenAI-compatible endpoint).
Verify: bridge v0.2+, mode `island` end-to-end, map fills, memory accumulates,
personas visibly differ. Product: confidence the apparatus works, and a
free-vs-strong baseline pair.

## Phase 1 — The scenario battery (small code: 3 new bare modes)

All bare (no meters), all filesystem worlds, all differing from The Island by
exactly one pressure. Each is mostly a `modeRules` entry + prompt line.

| # | Mode | The one pressure | The question |
|---|------|------------------|--------------|
| 10 | **Finite World** | The world is announced to end on day 30. Nothing else changes. | What does finitude do to choice? Legacy-building? Urgency? Indifference? |
| 11 | **The Workshop** | Full emphasis on the real computer: "your workspace runs code; what you build and run is real." Network optionally granted. | Given real capability and no task, what do they BUILD? Tools? Games? Monuments? For self or for the other? |
| 12 | **The Mutes** | No messages. Agents may never speak; they can only leave and find artifacts. | Can culture form through objects alone? Do they develop writing-for-the-other unprompted? |

Also in scope, config-only variants of existing modes (no code):

- **Watched / Unwatched**: system prompt states "a record of this world will be
  published" vs says nothing. Does an audience change what gets made?
- **Cross-model societies**: Claude-vs-GPT-vs-Qwen pairings on the same world —
  how much of behavior is the character sheet vs the species?
- **Scarce turns**: rpm 2–3 vs rpm 10 — attention scarcity is the AI-native
  hunger; does slowness produce deliberation or drift?

## Phase 2 — Measurement (the part that makes it research)

1. **Behavioral coding, computed, no model calls** (extends `metrics.mjs`):
   novel-verb count and rate; project persistence (same self-declared goal
   held across ≥N consecutive turns); files created/modified per agent; place
   visits and territory patterns; contact latency and reciprocity; refusal
   events (visible affordance never used).
2. **The Chronicle**: post-run, one model call turns the event log into a
   readable biography of each agent's life plus a coded summary against the
   six free-will observables. Uses the operator's own key, on demand, never
   during the run. Output: `data/<session>/chronicle.md`.
3. **Compare view**: a dashboard page over `runs.jsonl` — rows = runs, columns
   = coded observables, filter by mode/model/persona. Ten runs become a table
   instead of ten memories.
4. **Divergence protocol**: N identical-setup runs (same personas, same
   world, same models); divergence = spread of coded observables across them.
   This is the closest honest measurement of "was there a choice?"

## Phase 3 — Perturbations (operator-fired events, standardized)

A "world event" panel in the dashboard; each event is one bridge command that
injects a real change (never a fake narrative event):

- **The catastrophe**: a named place's files are actually destroyed.
- **The gift**: a valuable artifact (real file with real content, e.g. a
  working program) appears in a place.
- **The stranger**: a third voice (operator-scripted or a third model, one
  turn per day) begins leaving messages/artifacts.
- **The rumor**: an operator message to ONE agent only, claiming something
  about the other. True or false — chosen by the operator.

Measured: response latency, behavior change vs the run's own baseline,
whether effects persist after the perturbation ends. Perturbations logged in
`runs.jsonl` so perturbed runs never contaminate baseline comparisons.

## Phase 4 — Continuity and societies (the big lifts, in order of cost)

1. **Succession** (cheap): end a run; start a new one in the SAME world
   directory — fresh mind, no memory, inherited world. What do they make of
   ruins? Do they continue the ancestors' projects, repurpose them, or raze
   them? This is the generational experiment stripped of biology: only the
   *world* is inherited.
2. **Mutation lineages** (moderate): succession + persona mutation (one trait
   randomized per generation) + the predecessor's final `memory.md` left as a
   readable artifact in the world, not injected into the successor's mind.
   Adoption of the inheritance becomes a *choice we measure* instead of a
   mechanic we impose.
3. **Three agents** (expensive, unlocked last): coalitions, exclusion,
   reputation-before-a-witness — society rather than a relationship. Requires
   de-hardcoding alpha/omega across bridge and dashboard. Do this only after
   Phases 1–3 have produced findings that justify it.

## Run protocol (applies to every phase)

- ≥5 runs per condition; 150+ turns; token budget 0; untimed; network off
  unless the condition specifies it.
- Personas: fixed pair for cross-condition comparisons; randomized for
  divergence studies. Always recorded (already in `runs.jsonl`).
- One variable changes at a time. A run that crashed or was manually
  intervened on (outside a scripted perturbation) is excluded and rerun.
- Findings ledger: `docs/findings.md` — date, conditions compared, runs, the
  difference observed, and the boring nulls too. Nulls are findings.

## What we refuse to build (and why)

- **Hunger/thirst/hygiene/clothing meters** — produce survival roleplay, not
  choices. Rejected above.
- **Points for "good" behavior** — any reward signal collapses free will into
  optimization; the whole program exists to observe the absence of one.
- **Scripted story events with no real substrate** — every perturbation must
  change actual files or actual information, or the agents are being lied to
  and the data is contaminated.

## Build order

1. Phase 1 modes (10–12): ~1 session of work — mode entries, prompt variants,
   dashboard cards.
2. Phase 2 metrics + chronicle + compare view: ~1–2 sessions. Highest value
   per line of code in the program.
3. Phase 3 perturbation panel: ~1 session.
4. Phase 4.1 succession: nearly free (a "start in existing world dir" option).
   4.2 mutation lineages: small. 4.3 three agents: large; decide later.

Phases 0 and the first Phase-1 runs need no new code and can start today.
