# Research Arcade UI delivery report

Date: September 5, 2026
Base: Agent-Arena main at 04d078d32b702f0d426fbf7796458c175bb379e4.

## Request and scope
Apply the user's uploaded dark Research Arcade reference to the actual app. This is a UI and navigation release, not implementation of six new game environments. The supplied reference repeats two cards; the delivered catalog contains six unique cards in three categories.

## Implemented
- Default Arcade catalog: near-black surfaces, charcoal illustrated cards, category headings, colored accents, selected preview and responsive layouts.
- Build & Repair: Game Forge, Repair Bay. Play & Solve: Game Runner, Escape Room. Collaborate & Evolve: Tiny Civilization, Relay Studio.
- Game Forge and Repair Bay configure existing Builder workspaces with relevant briefs. Tiny Civilization configures the existing Society mode. These are explicitly identified as workspace presets with limitations.
- Game Runner, Escape Room and Relay Studio have real readable example protocols and Planned labels. They do not pretend to launch unimplemented engines.
- Rule Change has an explanatory protocol dialog and Planned status, rather than a nonfunctional toggle.
- Experiments displays real saved records and loading/empty/storage-error states. Compare displays two recorded snapshots without implying controlled benchmark results. Library opens all six example protocols.
- Existing runtime selector, provider controls, personas, simulation, evidence, archive and control buttons remain accessible in matching dark styling.
- Navigation preserves the active run's countdown when viewing the catalog. Simulation pause/resume no longer requires a provider key. Archived Docker records are not labeled as simulated.
- Native protocol dialogs support Escape and focus restoration. Mobile Explore scrolls/focuses the selected inspector. Tablet return navigation remains available.
- Artwork is cropped from the approved user-provided reference and bundled locally as SVG wrappers containing WebP data. No API requests or remote artwork dependencies.

## Architecture
ArcadeCatalog.tsx and arcade-catalog.ts are a presentation layer with explicit mappings to the existing runtime registry. Home still owns run state and the existing API/bridge flow. arcade.css styles the new catalog; globals.css receives a dark accessible override layer for the existing setup/run screens. No backend source, database schema, provider integration or credentials were changed. No dependencies were added.

## Verification
- A separate source-only copy installed successfully with npm ci, built successfully, passed TypeScript/ESLint, and passed all 30 Node tests. No reused build outputs or node_modules were copied.
- Existing registry/helper/source tests: 30 passed.
- Existing runtime browser smoke test adapted to enter Runtime setup from the catalog: 18 checks passed.
- New arcade-ui.mjs: real headless Chromium journeys at 1440x1000, 900x1000 and 390x844. Six cards, category count, selection, image loading, protocol dialog, Escape/focus, library, snapshot compare, workspace configuration, required-field validation, roster stepper, simulated launch, pause/resume, evidence, requests, kill controls and return navigation tested.
- Local D1 API used for real comparison fixtures; no fabricated user results. Only the unavailable Docker bridge health endpoint is stubbed in the new UI test.
- DOM audits at all three widths: zero document horizontal overflow, zero visible buttons below 40px, zero unlabeled fields, zero clipped card headings/actions. A mobile clipping regression found visually was repaired and added to the audit.
- Production build succeeds and starts on localhost:3188; HTTP 200 contains the new heading and all six catalog names.
- Production browser checks also passed at 1440, 900 and 390 pixels: selection, mobile inspector feedback, runtime navigation and storage-error handling.
- Standalone production Node server has no D1 binding: /api/experiments returns 500. This is exposed as Storage unavailable, not a false empty-success state. The existing worker hosting needs its real DB binding.
- No live Docker containers or model-provider calls were exercised in this UI-only release.

## Security and integrity
New examples are text-only protocol content. Artwork is local. Snapshot comparisons are read-only. No secrets added, no credential storage added, no backend policy loosened. Standard React text rendering is used, not raw user HTML. Existing backend limitations identified in the September 5 audit (weak goal/winner evaluation, roster validation defects, world access and scientific metrics) are not repaired by this UI change and remain limitations. Historical architecture/PRD promises should not be read as verification of those capabilities.

## Run and test
Requires Node 22.13+.

```sh
npm ci
npm --prefix local-bridge ci
npm exec tsc -- --noEmit
npm run lint
npm run build
node --test tests/rendered-html.test.mjs arena/arena.test.mjs local-bridge/tests/*.test.mjs
```

For browser tests install the test browser once with `npx playwright-core install chromium-headless-shell`. Start development with `npm run dev -- --port 3187`, then `node tests/arcade-ui.mjs`. Run the existing regression with `ARENA_UI_URL=http://localhost:3187 node tests/e2e-smoke.mjs` (PowerShell: set $env:ARENA_UI_URL first).

For standalone production: `npm start -- --port 3188`, then `node tests/arcade-production.mjs`. That test explicitly expects no production D1 binding in standalone Node and verifies its error UI.

For actual Docker execution on Windows, install both dependency sets, start Docker Desktop, and use START_AGENT_ARENA.cmd. The catalog opens first; use Configure workspace or Runtime setup. The illustrations are not running games.

## Delivery and deployment boundary
Source delivery, local execution, and hosted deployment are separate. Existing hosted URL: https://agent-arena-control.ashish4reddy.chatgpt.site/ . It returned HTTP 401 and a browser sign-in-required page during verification. No deploy credentials are available in this run. A repository push does not prove this host redeployed. Hosted visibility remains unverified; use the existing hosting account's deployment flow, retain D1 binding DB, and verify the new catalog after deployment. Do not create a replacement hosting project or database to bypass that access boundary.

## Next steps
Validate the source release on the operator's machine or redeploy the existing hosted dashboard. Then implement and evaluate the new environments in a separate functional release, starting with Game Forge's executable preview and protected tests.
