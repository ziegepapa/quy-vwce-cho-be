// Production boot smoke (Production Health v2).
//
// Headless Playwright against the DEPLOYED site. Production REQUIRES login
// (Supabase configured): a fresh profile lands on the AuthPage — there is no
// unauthenticated path into the app, so the authed routes cannot be smoked
// without credentials. This script asserts the production boot path:
//
// - the app shell loads and React mounts
// - the auth gate renders a complete login form (email + password + submit)
// - no uncaught page errors, no console.error
// - not a blank render
//
// Markers are locale-free and layout-tolerant (.auth-shell/.auth-card,
// input types, button[type=submit]); no VI/DE wording assertions.
// Screenshots are written ONLY on failure (to SCREENSHOT_DIR).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.BASE_URL ?? "https://ziegepapa.github.io/quy-vwce-cho-be/";
const screenshotDir = process.env.SCREENSHOT_DIR ?? "/tmp/prod-route-smoke";
const headless = process.env.HEADLESS !== "0";

const failures = [];

function shot(page, name) {
  fs.mkdirSync(screenshotDir, { recursive: true });
  return page.screenshot({ path: path.join(screenshotDir, `${name}.png`) });
}

async function bootToGate(page) {
  // Fresh profile on production → AuthPage (login required). The other two
  // branches cover unconfigured builds (Onboarding) and warm profiles.
  // They are mutually exclusive; whichever renders first wins the race.
  try {
    await Promise.race([
      page.waitForSelector(".auth-shell .auth-card", { timeout: 30000 }),
      page.waitForSelector(".card.disclaimer", { timeout: 30000 }),
      page.waitForSelector("main[class*='premium-screen-']", { timeout: 30000 }),
    ]);
  } catch (err) {
    // Boot diagnostics: distinguish "page never rendered" (slow/blocked
    // network) from "rendered something unexpected" (app regression).
    // Screenshot is picked up by CI's failure artifact upload.
    const diag = await page
      .evaluate(() => ({
        readyState: document.readyState,
        title: document.title,
        rootChildren: document.getElementById("root")?.childElementCount ?? -1,
        bodyTextLen: document.body ? document.body.innerText.trim().length : -1,
        scripts: Array.from(document.scripts).map((s) => s.src.split("/").pop()),
      }))
      .catch(() => ({ note: "evaluate failed" }));
    console.error(`BOOT DIAG: ${JSON.stringify(diag)}`);
    await shot(page, "boot-timeout");
    throw err;
  }
}

async function checkAuthGate(page) {
  // Production boot lands here. Assert a COMPLETE login form, not just a div.
  const card = page.locator(".auth-shell .auth-card");
  await card.waitFor({ state: "visible", timeout: 15000 });
  await card.locator('input[type="email"]').waitFor({ state: "visible", timeout: 10000 });
  await card.locator('input[type="password"]').waitFor({ state: "visible", timeout: 10000 });
  await card.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 10000 });
  // Not a blank render: the gate carries brand + form copy.
  const textLength = (await card.innerText()).trim().length;
  if (textLength < 50) {
    throw new Error(`blank auth gate: card text is only ${textLength} chars`);
  }
  console.log("OK auth-gate (login form complete)");
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
  runtimeErrors.push({ kind: "pageerror", message: String((err && err.message) || err) });
});
page.on("console", (msg) => {
  if (msg.type() === "error") {
    runtimeErrors.push({ kind: "console.error", message: msg.text() });
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
  await bootToGate(page);
  // Production path: assert the login gate. (Onboarding/main branches are
  // valid boot states for other builds; nothing further to check there.)
  if (await page.locator(".auth-shell .auth-card").count()) {
    try {
      await checkAuthGate(page);
    } catch (err) {
      failures.push({ check: "auth-gate", error: err.message });
      await shot(page, "auth-gate");
      console.error(`FAIL auth-gate: ${err.message}`);
    }
  } else {
    console.log("OK boot (non-auth gate)");
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
  failures.push({ check: "runtime", error: `${e.kind}: ${e.message}` });
  console.error(`FAIL runtime: ${e.kind}: ${e.message}`);
}

if (bootError || failures.length) {
  const total = failures.length + (bootError ? 1 : 0);
  console.error(`\n${total} failure(s)`);
  process.exit(1);
}
console.log("\nAll production boot checks OK");
