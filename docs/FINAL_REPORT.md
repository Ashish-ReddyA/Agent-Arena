# Hybrid Research Arcade delivery report

Date: September 5, 2026. Base: edea7453fcb195b0bb68144aac7cfcdd5f9c55b8.

## Implemented

- One Research Arcade catalog/configuration/run/results flow with stable six-arena names and the approved artwork/palette. No second arena selector in the normal journey.
- Six bounded executable state machines: maze construction, maze repair, restricted exploration, private clue sharing, scarce-resource allocation and independent blueprint handoff/review.
- Engine-owned completion, seeded initial worlds, raw input/action validation, private observations and scheduled after-turn Rule Change.
- Local and website Node execution behind one API contract; fixed hosted provider endpoints; local Ollama support. Generated data is validated JSON, never arbitrary code execution.
- Playable trusted maze renderer, checkpoint-aware preview, engine verification, live event polling, stop, evidence export, private history, record deletion and descriptive comparison.
- Salted password hashes, expiring hashed bearer sessions, owner-scoped SQLite records, separate local/hosted storage namespaces, exclusive database locks, restart interruption, bounded requests/turns/tokens/time/concurrency and safe error categories.
- Safe provider/model, engine version and execution limits in saved manifests. Model keys remain only in memory.
- Existing Docker workspace retained at /advanced. The old unauthenticated /api/experiments endpoint returns 410; it cannot disclose ownerless legacy snapshots.

## Verification

- TypeScript and ESLint passed.
- Production Node build passed and served the new catalog and API routes locally.
- All 55 Node tests passed, including 12 completed all-arena integration runs across hosted/local handlers, provider adapter request/response boundaries, account ownership, persistence/restart, stop, limits and engine outcomes.
- Tests used --experimental-test-isolation=none because sandbox policy blocks Node child test processes. This did not alter application logic.
- Browser verified: catalog contains six cards; Game Forge -> local selection -> account registration -> configuration -> completed run -> engine checks -> playable maze -> eight-move exit -> saved history. Model transport in this browser journey was the explicit Game Forge fixture, not a live provider.
- Mobile at 390x844: six cards, no document horizontal overflow, no visible buttons smaller than 40px; Relay Studio opens Configure Relay Studio with correct roster limits and no older arena selector. Navigation scroll reset added after this check exposed retained scroll position.
- Independent review caught and fixed catalog categories, runtime database collision, session/runtime switching during requests, missing model metadata, intervention timing, checkpoint preview requirements and form/server limit mismatches.

## Actual boundaries

These are bounded first-version arenas, not universal game creation, arbitrary repository repair or a full civilization simulator. One provider/model configuration is shared by the roster. Same seed reproduces initial engine state, not model output. Comparison is descriptive, not a controlled scientific score.

No live model-provider call, live Docker container run, paid infrastructure provisioning or production Render deployment is claimed. Hosted data becomes durable only when the existing service has a persistent mount configured. Billing and password recovery are not implemented. Storage is intentionally single-process; horizontal scaling needs a different store/job architecture.

Existing deployment target: https://agent-arena-mmx8.onrender.com . Render service: srv-dae8eanqj5pc73alel1g. Dashboard access required sign-in during this task; source delivery and deployment are tracked separately. See HOSTING.md before deploying.
