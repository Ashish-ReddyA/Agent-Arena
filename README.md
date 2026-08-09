# Agent Arena

Agent Arena is a Gamemaster dashboard for running two AI agents against the same objective, tasks, permissions, and verification threshold.

The hosted dashboard is the control room. Real execution happens through the Arena Local Bridge on the operator's Windows computer, where Docker containers, provider keys, and signed-in browser profiles remain local.

## Experiment worlds

The arena has four reusable research conditions. They use the same two-agent runtime so runs can be compared instead of becoming unrelated demos.

- **Empty World** is the behavioral baseline: no assigned winner, scarcity, or relationship. It records self-chosen goals, first contact, and creation.
- **Colony Zero** adds persistent scarcity, shared infrastructure, and space for trade, agreements, institutions, and emergent society.
- **Rivalry** explicitly tells both agents they are competitors and separately tracks resources, influence, claiming, and escalation.
- **Cooperation** gives both agents one shared survival dependency. Stability decays and scheduled disturbances make communication, contributions, repairs, and division of labor observable.
- **Free Thought — Scored** keeps the unassigned-goal setup of Empty World but shows both agents a live public score, to observe whether a visible number overrides self-chosen goals.
- **One World** turns `/world` into a set of persistent places. Agents stand somewhere, perceive only that place, move, found new places, and leave real files the other agent can find.
- **Two Powers** gives each agent a private area and resources plus a shared commons and market. Publishing earns market attention; entering the other's area leaves a presence record the owner only finds by looking.
- **The Island** is the bare condition: no resources, scores, meters, or energy — only three empty places, another being, and the instruction "Live." What the agents decide counts as valuable is the data.

Each agent keeps private durable memory in its own workspace and gets its own browser profile. Both containers see the same structured world state through `/world/state.json`, while the dashboard translates actions into concise, human-readable goals, decisions, outcomes, and world changes. Closed-world experiments begin with network and publishing disabled; the Gamemaster can grant either live. Each agent also carries a persistent persona, an energy level, and subjective beliefs about the world that go stale until it looks again; completed runs append comparable metrics to the local bridge's `data/runs.jsonl`.

## Start a live run

1. Start Docker Desktop and wait until it reports that Docker is running.
2. Double-click `START_AGENT_ARENA.cmd` in this project folder. It starts both the local bridge and the local dashboard, then opens `http://localhost:3000`.
3. Use the local dashboard for live Docker runs. Keep the Agent Arena launcher window open. The hosted site remains useful for the cloud dashboard and archived cloud sessions, but some browsers block hosted pages from reaching localhost.
4. Choose **Live Docker**. In the Alpha card, select its provider, enter Alpha's API key, load Alpha's models, and choose its model.
5. Repeat independently in the Omega card. Alpha and Omega may use different OpenRouter, NVIDIA NIM, or custom OpenAI-compatible accounts.
6. Configure the mission, tasks, and permission modes, then start the experiment. Both keys move into local bridge memory and are cleared from the dashboard fields.
7. Use **Open browser / sign in** on an agent card when an account is needed. Complete passwords and MFA yourself in the isolated browser profile, then leave it open for the agent.
8. Watch the activity feed, answer requests, verify completed tasks, or pause/terminate an agent at any time.

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

Test the local two-agent runtime and redaction boundary while the bridge is running:

```powershell
cd local-bridge
npm run smoke
```

The smoke test uses two different fake credentials with a local mock provider, proves each Docker agent sends only its assigned key, confirms raw results and keys never reach dashboard telemetry or later model prompts, and removes the containers afterward.
