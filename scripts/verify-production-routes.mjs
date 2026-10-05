// Production UI route smoke (Production Health v2).
//
// Headless Playwright against the DEPLOYED site. This is a production smoke
// test, not a replacement for the full Playwright preview-smoke in CI.
//
// Fails on:
// - navigation errors (goto failure / non-OK document response)
// - uncaught page errors (pageerror)
// - console.error
// - blank render (main landmark without real content)
// - missing route identity marker or wrong active nav state
//
// Markers are deliberately locale-free and layout-tolerant:
// - route identity: `main.premium-screen-<name>`, a class derived from the URL
//   path, so VI/DE wording changes and UI polish cannot cause false failures
// - structural hooks (`h1`, `ul`, `section`) instead of text assertions
// - nav state via `aria-current="page"`, not link labels
//
// Fresh browser profile lands on Onboarding (single button); the script
// completes it through the real UI, then smokes the routes. No login, no data
// mutation, no Supabase/RLS testing.
//
// Screenshots are written ONLY on failure (to SCREENSHOT_DIR).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.BASE_URL ?? "https://ziegepapa.github.io/quy-vwce-cho-be/";
const screenshotDir = process.env.SCREENSHOT_DIR ?? "/tmp/prod-route-smoke";
const headless = process.env.HEADLESS !== "0";

const ROUTES = [
  { hash: "#/", screen: "overview", extra: "main h2" },
  { hash: "#/transactions", screen: "transactions", extra: "main h1" },
  { hash: "#/settings", screen: "settings", extra: "main h1" },
  { hash: "#/simulation", screen: "simulation", extra: "main section" },
];

const failures = [];
let activeRoute = "(boot)";

function shot(page, name) {
  fs.mkdirSync(screenshotDir, { recursive: true });
  return page.screenshot({ path: path.join(screenshotDir, `${name}.png`) });
}

async function dismissOnboardingIfPresent(page) {
  // Fresh profile → Onboarding (single button). Either it or the app main
  // appears after boot; they are mutually exclusive.
  await Promise.race([
    page.waitForSelector(".card.disclaimer", { timeout: 20000 }),
    page.waitForSelector("main[class*='premium-screen-']", { timeout: 20000 }),
  ]);
  if (await page.locator(".card.disclaimer").count()) {
    await page.locator(".app-shell button").first().click();
    await page.waitForSelector("main[class*='premium-screen-']", { timeout: 20000 });
  }
}

async function checkRoute(page, route) {
  activeRoute = route.hash;
  // Hash-only change: set location.hash directly (page.goto treats it as a
  // same-document no-op and React Router may not pick it up reliably).
  await page.evaluate((h) => {
    location.hash = h;
  }, route.hash);
  await page.waitForFunction((h) => location.hash === h, route.hash, { timeout: 10000 });
  // 1. Route identity: deterministic class derived from the URL path (locale-free).
  const main = page.locator(`main.premium-screen-${route.screen}`);
  await main.waitFor({ state: "visible", timeout: 20000 });
  // 2. Real content, not a blank render.
  const textLength = (await main.innerText()).trim().length;
  if (textLength < 100) {
    throw new Error(`blank render suspected: main text is only ${textLength} chars`);
  }
  // 3. Router state: this route's nav link is marked current (locale-free).
  const activeHref = await page.locator('a[aria-current="page"]').first().getAttribute("href");
  if (activeHref !== `#${route.hash.slice(1)}`) {
    throw new Error(`active nav mismatch: got ${activeHref}`);
  }
  // 4. Characteristic structural marker (locale-free, layout-tolerant).
  if (route.extra) {
    await page.waitForSelector(route.extra, { state: "attached", timeout: 15000 });
  }
}

const browser = await chromium.launch({ headless });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const runtimeErrors = [];
page.on("pageerror", (err) => {
  runtimeErrors.push({ route: activeRoute, kind: "pageerror", message: String((err && err.message) || err) });
});
page.on("console", (msg) => {
  if (msg.type() === "error") {
    runtimeErrors.push({ route: activeRoute, kind: "console.error", message: msg.text() });
  }
});

let bootError = null;
try {
  let bootResponse = null;
  try {
    bootResponse = await page.goto(new URL("#/", baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  } catch (err) {
    throw new Error(`navigation failed: ${String((err && err.message) || err).split("\n")[0]}`);
  }
  if (bootResponse && !bootResponse.ok()) {
    throw new Error(`navigation failed: HTTP ${bootResponse.status()}`);
  }
  await dismissOnboardingIfPresent(page);
  for (const route of ROUTES) {
    try {
      await checkRoute(page, route);
      console.log(`OK ${route.hash}`);
    } catch (err) {
      failures.push({ route: route.hash, error: err.message });
      await shot(page, route.screen);
      console.error(`FAIL ${route.hash}: ${err.message}`);
    }
  }
  if (runtimeErrors.length) {
    await shot(page, "runtime-errors");
  }
} catch (err) {
  bootError = err.message;
  console.error(`FAIL (boot): ${err.message}`);
} finally {
  await browser.close();
}

for (const e of runtimeErrors) {
  failures.push({ route: e.route, error: `${e.kind}: ${e.message}` });
  console.error(`FAIL ${e.route}: ${e.kind}: ${e.message}`);
}

if (bootError || failures.length) {
  const total = failures.length + (bootError ? 1 : 0);
  console.error(`\n${total} failure(s)`);
  process.exit(1);
}
console.log(`\nAll ${ROUTES.length} production routes OK`);
