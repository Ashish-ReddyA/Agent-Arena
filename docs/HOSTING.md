> Session-only preview update: account registration and login have been removed. The UI automatically opens an anonymous session and saves run snapshots in this tab's sessionStorage. Refreshes preserve history; export to keep it beyond the browser session. The runtime uses temporary, session-scoped execution records with 24-hour credentials. Expired anonymous records are cleaned up on new-session creation. Earlier account/persistent-history details below describe the previous implementation and no longer apply. No paid hosting is required.

# Run Research Arcade

This release runs on Node 22.13 or newer. The six bounded engines use trusted state-machine code and validated model JSON. No agent-generated program is executed in the web process. Game Forge and Repair Bay work on seven-by-seven maze blueprints, not arbitrary application repositories. Use Advanced Docker tools for the existing general local workspaces.

## Local development and standalone website

```
npm ci
npm run build
npm start
```

The app listens on port 3000 unless the host supplies PORT. Set ARENA_DATA_DIR to a durable directory before starting on a host. Exactly one Node process may use a database directory. The app acquires an exclusive runtime lock to prevent two processes from corrupting lifecycle state. A crashed process's stale lock is reclaimed only after its PID no longer exists. Do not manually remove a live process's lock.

Create an account from the configuration screen. Accounts and hashed bearer sessions live in SQLite. The browser holds its bearer in sessionStorage, separate for local and website execution. Passwords are salted and scrypt-hashed; raw session tokens and model keys are not stored in SQLite. There is no email verification or password recovery in this first version: choose a password you can retain. A new login revokes the account's previous session. Hosted operator access to the database still needs normal filesystem and backup protection.

## Run on your computer

In a second terminal in the repository:

```
npm run local:arcade
```

Select On my computer in the website. The app connects to http://127.0.0.1:43822. The local bounded runner needs Node, not Docker. It supports OpenRouter, NVIDIA NIM, or an installed Ollama model served at http://127.0.0.1:11434. This server runs model calls and all engine transitions on your computer; closing the terminal interrupts the run. Local accounts and records are distinct from website accounts and records.

The default origin allowlist includes localhost:3000, 127.0.0.1:3000, and https://agent-arena-mmx8.onrender.com. For a custom origin, set ARENA_ALLOWED_ORIGINS to a comma-separated list of exact HTTP(S) origins before starting. Never use a wildcard. Browser local-network permission may be required. The local service binds only loopback, verifies Host and Origin, and still requires authentication.

Default storage directories are .arena-data/hosted and .arena-data/local. Setting ARENA_DATA_DIR overrides the default; never point two runtimes at the same directory.

## Existing Render service

Update the existing service, not a replacement project. Build command: npm ci && npm run build. Start command: npm start. Runtime: Node 22.13+ (Node 22 LTS recommended). Environment: ARENA_EXECUTION=hosted. The PORT variable is supplied by Render.

Private persistent storage requires an operator-mounted persistent disk and ARENA_DATA_DIR pointing to that mount. An ephemeral filesystem can exercise the app, but redeploys may lose accounts and runs. The UI health message makes this explicit. This repository does not purchase a disk or provision a paid service. Confirm the host's actual disk/service price in the existing account before provisioning. A free, ephemeral deployment is not durable hosted storage.

Run one instance. For horizontal scaling, replace SQLite/single-process jobs with an external durable store and queue before adding instances. On restart, unfinished records become interrupted; the runner does not silently recreate model credentials or resume spending. Export records for backups. New runs require a model key again.

## Limits and model access

Hosted model endpoints are fixed OpenRouter and NVIDIA HTTPS URLs, with redirects rejected. Custom URLs and Ollama are unavailable on the website. One provider/model configuration is shared across the agent roster. Keys are retained in memory only for a run and cleared afterward.

Runs are capped at 100 turns, 512 requested output tokens per call, 8,192 total reported output tokens, and 120 seconds. Provider usage accounting may be approximate; these are execution limits, not a guaranteed currency budget. Each account may have two concurrent runs; the process allows ten. Accounts are capped at 100 runs and approximately 20 MB of saved run data. Authentication and start requests are rate-limited. There is no subscription billing.

Stopping aborts the in-flight provider request and prevents further transitions. A provider may already have processed a request; stop cannot reverse a charge. Completed/failed/stopped records are private and can be exported or deleted. Engine/version, safe provider metadata, seed, limits, rule changes, state and usage are recorded. Same seed guarantees only the initial environment, not deterministic model output.

## Verification

```
npm run typecheck
npm run lint
npm test
npm run build
```

Where Windows sandbox policy blocks Node test workers, run the same test list with --experimental-test-isolation=none. The browser fixture at server/browser-fixture.mjs is explicitly test-only: it substitutes deterministic model JSON for Game Forge. It is not a production provider and is never selected by the normal startup scripts.

The legacy /api/experiments endpoint now returns 410 because its old records have no owner. It does not migrate or disclose those records to new accounts. Existing Docker checkpoints remain in the bridge, accessible through Advanced Docker tools. Cloudflare Worker hosting is not a supported target for this Node/SQLite hybrid runtime.
