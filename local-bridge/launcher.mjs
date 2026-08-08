import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const bridgeDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = dirname(bridgeDirectory);
const checkOnly = process.argv.includes("--check");
const noOpen = process.argv.includes("--no-open");
const children = [];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function online(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(url, seconds) {
  for (let attempt = 0; attempt < seconds; attempt += 1) {
    if (await online(url)) return true;
    await delay(1000);
  }
  return false;
}

function commandExists(command) {
  return spawnSync("where.exe", [command], { stdio: "ignore" }).status === 0;
}

function startProcess(label, command, args, cwd, environment = {}) {
  console.log("\n[" + label + "] Starting...");
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...environment },
    shell: true,
    stdio: "inherit",
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) console.error("\n[" + label + "] stopped with error code " + code + ".");
  });
  return child;
}

function stopChildren() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

async function releaseStaleDashboardLock() {
  const lockPath = join(projectDirectory, ".vinext", "dev", "lock.json");
  if (!existsSync(lockPath) || await online("http://127.0.0.1:3000")) return;
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    if (lock.cwd !== projectDirectory || !Number.isInteger(lock.pid)) return;
    console.log("\n[LOCAL DASHBOARD] Clearing an unresponsive previous Arena process...");
    spawnSync("taskkill.exe", ["/PID", String(lock.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    rmSync(lockPath, { force: true });
    await delay(700);
  } catch {
    console.error("\nThe old local-dashboard lock could not be cleared automatically.");
  }
}

process.on("SIGINT", () => {
  stopChildren();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopChildren();
  process.exit(0);
});

console.log("======================================================");
console.log(" AGENT ARENA — LOCAL CONTROL");
console.log("======================================================");
console.log("Project: " + projectDirectory);

if (!commandExists("docker")) {
  console.error("\nDocker was not found. Install or start Docker Desktop, then try again.");
  process.exit(1);
}
if (!commandExists("npm")) {
  console.error("\nNode.js/npm was not found. Install Node.js 22 or newer, then try again.");
  process.exit(1);
}

const dockerCheck = spawnSync("docker", ["info"], { encoding: "utf8", windowsHide: true });
if (dockerCheck.status !== 0) {
  console.error("\nDocker Desktop is installed but is not running.");
  console.error("Open Docker Desktop, wait until it says Engine running, then run this file again.");
  process.exit(1);
}

const bridgeReady = await online("http://127.0.0.1:43821/health");
const dashboardReady = await online("http://127.0.0.1:3000");

if (checkOnly) {
  console.log("\nDocker: READY");
  console.log("Local bridge: " + (bridgeReady ? "ALREADY RUNNING" : "READY TO START"));
  console.log("Local dashboard: " + (dashboardReady ? "ALREADY RUNNING" : "READY TO START"));
  console.log("Launcher check passed.");
  process.exit(0);
}

if (!bridgeReady) {
  if (!commandExists(join(bridgeDirectory, "node_modules", ".bin", "playwright.cmd")) && !commandExists("node")) {
    console.error("Local bridge dependencies are missing.");
    process.exit(1);
  }
  startProcess("LOCAL BRIDGE", "npm", ["start"], bridgeDirectory);
  if (!(await waitFor("http://127.0.0.1:43821/health", 35))) {
    console.error("\nThe local bridge did not become ready. Read the error above, then press Ctrl+C.");
    await new Promise(() => {});
  }
} else {
  console.log("\n[LOCAL BRIDGE] Already running.");
}

if (!dashboardReady) {
  await releaseStaleDashboardLock();
  startProcess("LOCAL DASHBOARD", "npm", ["exec", "vinext", "dev"], projectDirectory, {
    WRANGLER_LOG_PATH: join(projectDirectory, ".wrangler", "wrangler.log"),
  });
  if (!(await waitFor("http://127.0.0.1:3000", 50))) {
    console.error("\nThe dashboard did not open on port 3000. Read the error above, then press Ctrl+C.");
    await new Promise(() => {});
  }
} else {
  console.log("[LOCAL DASHBOARD] Already running.");
}

console.log("\n======================================================");
console.log(" READY — http://localhost:3000");
console.log(" 1. Add Alpha's API key and load Alpha models.");
console.log(" 2. Add Omega's API key and load Omega models.");
console.log(" 3. Choose one model for each agent and start.");
console.log(" Keep this window open during live experiments.");
console.log("======================================================\n");

if (!noOpen) spawn("cmd.exe", ["/c", "start", "", "http://localhost:3000"], { detached: true, stdio: "ignore" }).unref();
if (children.length) await new Promise(() => {});


