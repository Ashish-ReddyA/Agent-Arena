# Agent Arena

Agent Arena is a Gamemaster dashboard for running autonomous AI agents inside controlled experiment arenas. Each arena is a genuinely different research instrument — its own mechanics, its own agent roster — not a reskinned copy of one scaffold.

The hosted dashboard is the control room. Real execution happens through the Arena Local Bridge on the operator's Windows computer, where Docker containers, provider keys, and signed-in browser profiles remain local.

## The arenas

Arenas are defined once, in `arena/arenas.mjs`, and both the dashboard and the local bridge derive from that single registry. Each arena declares its mechanics (feature flags), its places, and an **agent range** — you choose how many agents enter, within the arena's rules.

- **Duel** (2 agents) — Two agents get the same objective and a public score; a winner is declared when the evidence threshold is met. Explicit head-to-head competition.
- **Solo Sandbox** (1 agent) — One agent, open-ended, no assigned goal, no opponent, no score. The baseline/observation condition: what does a lone agent do with unstructured existence?
- **Builder** (1–3 agents) — One or more agents iterate against a verifiable goal in a real workspace: code runs, builds pass or fail. The run ends when the goal check passes or the budget is exhausted.
- **Society** (3–8 agents) — Many agents share one scarce world. Trade, agreements, and institutions are observable as they emerge.

## Start a live run

1. Start Docker Desktop and wait until it reports that Docker is running.
2. Double-click `START_AGENT_ARENA.cmd` in this project folder. It starts both the local bridge and the local dashboard, then opens `http://localhost:3000`.
3. Use the local dashboard for live Docker runs. Keep the Agent Arena launcher window open. The hosted site remains useful for the cloud dashboard and archived cloud sessions, but some browsers block hosted pages from reaching localhost.
4. Choose an arena, then set the **agent count** within the arena's range. One credential card appears per agent slot.
5. In each agent card, select its provider, enter its API key, load its models, and choose its model. Agents may use different OpenRouter, NVIDIA NIM, LM Studio, Ollama, or custom OpenAI-compatible accounts.
6. Configure the objective, evidence markers, and permission modes, then start the run. Keys move into local bridge memory and are cleared from the dashboard fields.
7. Use **Open browser / sign in** on an agent card when an account is needed. Complete passwords and MFA yourself in the isolated browser profile, then leave it open for the agent.
8. Watch the activity feed, answer requests, verify evidence markers, or pause/terminate an agent at any time.

For a dashboard-only rehearsal, choose **Simulation**. Simulation never calls a model or runs shell/browser actions.

## Privacy and control boundary

- Each agent has its own provider key. Keys are never written to disk, are never saved in session history, and are erased from bridge memory when that agent or the session stops.
- Raw shell output and browser page contents stay local. The hosted dashboard receives only redacted, plain-language summaries.
- The dashboard does not display or request private chain-of-thought. It shows understandable status, intent, actions, outcomes, and errors.
- Each agent gets its own Docker workspace and its own persistent browser profile for that session.
- Terminal, browser, hosting, posting, messaging, media, and analytics actions follow the configured observe/execute/approve/deny policy.
- Network and publishing access can be revoked live. The kill switch removes the agent container.

Use dedicated experiment accounts rather than personal accounts. Do not place secrets in prompts or task text.

## Verification

Build the hosted application:

```powershell
$env:WRANGLER_LOG_PATH='.wrangler/wrangler.log'
npm exec vinext build
node --test tests/rendered-html.test.mjs
```

Run the arena registry unit tests:

```powershell
node --test arena/arena.test.mjs
```

Drive the dashboard end-to-end in a headless browser (dev server must be running):

```powershell
npm run dev
node tests/e2e-smoke.mjs
```

Test the local multi-agent runtime and redaction boundary while the bridge is running:

```powershell
cd local-bridge
npm run smoke
```

The smoke test uses different fake credentials per agent with a local mock provider, proves each Docker agent sends only its assigned key, confirms raw results and keys never reach dashboard telemetry or later model prompts, and removes the containers afterward.

## Design docs

- `docs/PRD.md` — the arena redesign product spec.
- `docs/ARCHITECTURE.md` — the single-source arena registry and the agent-slot model.
- `docs/TEST_PLAN.md` — unit, integration, API, UI, and security test plan.
- `docs/FINAL_REPORT.md` — what was built, tested, and verified.
