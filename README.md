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

Website execution runs the trusted engine on the server, using your model key in memory. Register a private account to save runs. Billing is not implemented. Hosted persistence requires an operator-mounted disk and `ARENA_DATA_DIR`; free ephemeral hosting does not provide durable accounts or history.

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
