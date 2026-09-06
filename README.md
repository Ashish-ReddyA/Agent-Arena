# Agent Arena — Research Arcade

Research Arcade now has six executable, bounded environments: Game Forge, Repair Bay, Game Runner, Escape Room, Tiny Civilization and Relay Studio. Choose an arena, select website or local execution, configure a model and budget, then inspect engine-verified results in the same interface.

Game Forge constructs playable 7×7 maze blueprints; Repair Bay repairs them; Game Runner explores a hidden maze; Escape Room combines private clues; Tiny Civilization allocates scarce resources; Relay Studio requires independent review before publishing a blueprint. Scheduled Rule Change interventions alter a constraint after a recorded turn. These first versions do not run arbitrary generated programs on the website.

## Start

Requires Node 22.13+.

```
npm ci
npm run build
npm start
```

To execute on your own computer, start a second terminal with `npm run local:arcade` and select **On my computer**. The bounded runtime uses Node and supports OpenRouter, NVIDIA NIM, or local Ollama. Existing general Docker workspaces remain at `/advanced` and still require Docker and the original local bridge.

Website execution runs the trusted engine on the server, using your model key in memory. No login or account is required. An anonymous session is created automatically; run snapshots and the session credential are saved in this tab's `sessionStorage`, separately for local and website execution. Refreshing preserves them. Export evidence before ending the browser session. Other browsers cannot recover your history. Browser session restoration or duplicated tabs can preserve/copy session storage.

The runtime keeps temporary execution records in SQLite, protected by an unguessable session credential. Credentials expire after 24 hours; expired anonymous records are removed when a new session is created. A server redeploy can lose runtime records, while already saved browser snapshots remain readable in the same browser session. This is a Free preview; no paid disk or subscription is required.

- [Deployment, local setup, limits, storage and security](docs/HOSTING.md)
- [Implementation contract and scope](docs/HYBRID_IMPLEMENTATION.md)
- [Verification and delivery report](docs/FINAL_REPORT.md)

## Test

```
npm run typecheck
npm run lint
npm test
npm run build
```

For Windows environments that block Node worker spawning, add `--experimental-test-isolation=none` to the Node test command. Engine and API integration tests use explicit test model fixtures; they are not evidence of a live model-provider or Render deployment.

The canonical bounded environment registry is `lab/engine.mjs`. The original Docker arena registry remains `arena/arenas.mjs` and is used only by the advanced workspace. Historical goal/winner/scientific benchmark promises for that older runtime are not verified by this release.
