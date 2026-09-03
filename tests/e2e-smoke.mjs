// Headless end-to-end smoke test for the redesigned dashboard, driven by
// playwright-core against the local vinext dev server on :3000.
// Run: node tests/e2e-smoke.mjs  (dev server must be running)
import { chromium } from "playwright-core";

const base = process.env.ARENA_UI_URL || "http://127.0.0.1:3000";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", (err) => consoleErrors.push(String(err)));

try {
  // 1. Application loads to the setup screen (cache-busted to avoid stale modules).
  await page.goto(`${base}?t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".experiment-mode-grid", { timeout: 30000 });
  // RSC hydrates asynchronously; wait until arena cards are interactive before clicking.
  await page.waitForFunction(() => {
    const el = document.querySelector(".experiment-mode-card.arena-builder");
    return el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, { timeout: 15000 });
  check("app loads and shows the arena selector", true);
  const heading = await page.textContent(".setup-intro h1").catch(() => "");
  check("setup heading is 'Choose the arena.'", /choose the arena/i.test(heading || ""), heading);

  // 2. All four arenas render from the registry.
  const cards = await page.$$eval(".experiment-mode-card", (els) => els.map((el) => el.textContent || ""));
  check("four arena cards render", cards.length === 4, `${cards.length} cards`);
  for (const name of ["DUEL", "SOLO SANDBOX", "BUILDER", "SOCIETY"]) {
    check(`arena card present: ${name}`, cards.some((c) => c.includes(name)));
  }

  // Count provider selects inside the credential (CONTENDERS) panel only — the
  // persona panel reuses .credential-card, so we scope to the credentials grid.
  const credSelects = () => page.$$eval('#agent-credentials .credential-grid select[aria-label$="provider"]', (els) => els.length);

  // Arena cards re-render on each selection, so re-wait for hydration each time.
  const clickArena = async (id, expectCount) => {
    await page.waitForFunction((aid) => {
      const el = document.querySelector(`.experiment-mode-card.arena-${aid}`);
      return el && Object.keys(el).some((k) => k.startsWith("__react"));
    }, id, { timeout: 15000 });
    await page.click(`.experiment-mode-card.arena-${id}`);
    await page.waitForFunction((n) => document.querySelectorAll('#agent-credentials .credential-grid select[aria-label$="provider"]').length === n, expectCount, { timeout: 8000 });
  };

  // 3. Selecting Builder (1–3 agents) shows the count stepper and 1 agent by default.
  await clickArena("builder", 1);
  check("Builder defaults to 1 agent", (await credSelects()) === 1, `${await credSelects()}`);

  // 4. The stepper raises the roster: + twice → 3 provider selects.
  await page.waitForSelector('button[aria-label="More agents"]', { timeout: 5000 });
  check("agent stepper offers a + control for Builder", true);
  await page.click('button[aria-label="More agents"]');
  await page.click('button[aria-label="More agents"]');
  await page.waitForFunction(() => document.querySelectorAll('#agent-credentials .credential-grid select[aria-label$="provider"]').length === 3, { timeout: 5000 });
  check("raising Builder to 3 renders 3 agents", (await credSelects()) === 3, `${await credSelects()}`);

  // 5. Society starts at its default (4) and cannot be driven below its minimum (3).
  await clickArena("society", 4);
  check("Society starts at its default roster (4)", (await credSelects()) === 4, `${await credSelects()}`);
  await page.click('button[aria-label="Fewer agents"]'); // 4 -> 3 (min)
  await page.waitForFunction(() => document.querySelectorAll('#agent-credentials .credential-grid select[aria-label$="provider"]').length === 3, { timeout: 5000 });
  const fewerDisabled = await page.$eval('button[aria-label="Fewer agents"]', (el) => el.disabled);
  check("Society cannot drop below its minimum of 3", fewerDisabled === true, `disabled=${fewerDisabled}`);

  // 6. Duel is fixed at exactly 2 (no stepper shown).
  await clickArena("duel", 2);
  check("Duel is fixed at 2 agents", (await credSelects()) === 2, `${await credSelects()}`);

  // 7. Launch a Simulation run (no model calls) and confirm the arena board appears.
  await page.click('.mode-picker button:nth-child(2)'); // SIMULATION
  await page.waitForSelector(".launch-bar button:not([disabled])", { timeout: 5000 });
  check("launch button is enabled for a simulation", true);
  {
    await page.click(".launch-bar button");
    await page.waitForSelector(".arena-page .world-board", { timeout: 8000 });
    check("simulation launches into the arena board", true);
    const boardTitle = await page.textContent(".world-board h2").catch(() => "");
    check("arena board shows the Duel world", /duel/i.test(boardTitle || ""), boardTitle);
    // Let the simulation tick once.
    await page.waitForTimeout(4000);
    const eventCount = await page.$$eval(".event-feed .event", (els) => els.length).catch(() => 0);
    check("simulation produces activity events", eventCount > 0, `${eventCount} events`);
  }

  // 8. No major console errors during the whole flow (the offline-bridge health
  // probe legitimately logs ERR_CONNECTION_REFUSED when Docker isn't running —
  // that is expected in this environment, so exclude it).
  const realErrors = consoleErrors.filter((e) => !/ERR_CONNECTION_REFUSED|127\.0\.0\.1:43821|Failed to load resource/i.test(e));
  check("no major console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | ") || `${consoleErrors.length} total, all bridge-offline noise`);
} catch (error) {
  check("suite completed without an unexpected exception", false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `, ${failed.length} FAILED` : ""}.`);
process.exit(failed.length ? 1 : 0);
