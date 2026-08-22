import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { assertVersionMatch, readAppReleaseVersion, readReleaseVersionFromHtml } from "./app-release-version.mjs";

const distDir = path.resolve("dist");
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function readText(relativePath) {
  return readFile(path.join(distDir, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function assertFile(relativePath) {
  await access(path.join(distDir, relativePath));
}

async function assertPng(relativePath, expectedSize) {
  const file = await readFile(path.join(distDir, relativePath));
  assert.deepEqual(file.subarray(0, 8), pngSignature, `${relativePath} is not a PNG`);
  assert.equal(file.readUInt32BE(16), expectedSize, `${relativePath} has the wrong width`);
  assert.equal(file.readUInt32BE(20), expectedSize, `${relativePath} has the wrong height`);
}

function assertQuoteConsistency(quotes, legacy) {
  assert.equal(quotes.schemaVersion, 2, "quotes.json must use schema 2");
  assert.ok(Array.isArray(quotes.quotes) && quotes.quotes.length > 0, "quotes.json is empty");
  assert.equal(legacy.schemaVersion, 1, "vwce-price.json must use schema 1");

  const current = quotes.quotes.find((quote) => quote.instrumentIsin === legacy.isin);
  assert.ok(current, "Legacy VWCE quote is missing from quotes.json");
  assert.ok(Number.isFinite(current.price) && current.price > 0, "VWCE price is invalid");
  assert.equal(current.price, legacy.price, "Quote prices disagree");
  assert.equal(current.currency, legacy.currency, "Quote currencies disagree");
  assert.equal(current.venue, legacy.venue, "Quote venues disagree");
  assert.equal(current.asOf, legacy.asOf, "Quote dates disagree");
  assert.ok(Number.isFinite(Date.parse(`${current.asOf}T00:00:00Z`)), "Quote date is invalid");
}

const [expectedAppReleaseVersion, indexHtml, manifest, serviceWorker, registerBridge, recoveryHook, finalRecoveryHook, p34RecoveryHook, quotes, legacy] = await Promise.all([
  readAppReleaseVersion(),
  readText("index.html"),
  readJson("manifest.webmanifest"),
  readText("sw.js"),
  readText("registerSW.js"),
  readText("pwa-update-recovery.js"),
  readText("pwa-final-runtime-recovery.js"),
  readText("pwa-p34-update-recovery.js"),
  readJson("data/quotes.json"),
  readJson("data/vwce-price.json"),
]);

assert.match(indexHtml, /<meta name="description"/i, "Description metadata is missing");
assertVersionMatch(expectedAppReleaseVersion, readReleaseVersionFromHtml(indexHtml), "Release artifact");
assert.match(indexHtml, /rel="manifest"/i, "Manifest link is missing");
assert.match(indexHtml, /registerSW\.js/i, "Stable PWA registration bridge is missing");
assert.match(indexHtml, /icons\/apple-touch-icon\.png/i, "Apple touch icon is missing");
assert.equal(manifest.id, "/quy-vwce-cho-be/");
assert.equal(manifest.start_url, "/quy-vwce-cho-be/");
assert.equal(manifest.scope, "/quy-vwce-cho-be/");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.theme_color, "#1e3a5f");
assert.ok(Array.isArray(manifest.icons), "Manifest icons are missing");
assert.ok(
  manifest.icons.some((icon) => icon.type === "image/png" && icon.sizes === "192x192"),
  "192px PNG icon is missing",
);
assert.ok(
  manifest.icons.some(
    (icon) => icon.type === "image/png" && icon.purpose?.split(/\s+/).includes("maskable"),
  ),
  "Maskable PNG icon is missing",
);

await Promise.all([
  assertFile("icons/icon-maskable.svg"),
  assertPng("icons/apple-touch-icon.png", 180),
  assertPng("icons/icon-192.png", 192),
  assertPng("icons/icon-512.png", 512),
  assertPng("icons/icon-maskable-512.png", 512),
]);

assert.match(serviceWorker, /index\.html/, "App shell is not precached");
assert.match(serviceWorker, /data\/quotes\.json/, "Quote feed is not precached");
assert.match(serviceWorker, /icon-maskable-512\.png/, "Maskable icon is not precached");
assert.match(serviceWorker, /pwa-update-recovery\.js/, "P26 recovery hook is not imported by the worker");
assert.match(serviceWorker, /pwa-final-runtime-recovery\.js/, "P27 final runtime recovery hook is not imported by the worker");
assert.match(serviceWorker, /pwa-p34-update-recovery\.js/, "P35 bounded P33 bootstrap is not imported by the worker");
assert.match(serviceWorker, /SKIP_WAITING/, "Explicit update activation protocol is missing");
assert.match(registerBridge, /updateViaCache:\s*"none"/, "Bridge must refresh the service-worker script without HTTP-cache reuse");
assert.match(registerBridge, /SKIP_WAITING/, "Bridge must request explicit worker activation");
assert.match(registerBridge, /Đã có phiên bản mới/, "Vietnamese update copy is missing");
assert.match(registerBridge, /Neue App-Version verfügbar/, "German update copy is missing");
assert.match(registerBridge, /pageshow/, "Bridge must recheck pending updates when an app page returns");
assert.match(registerBridge, /dismissedWaitingWorker/, "Bridge must scope a temporary dismissal to a single waiting worker");
assert.match(registerBridge, /inspectAgain/, "Bridge must re-inspect delayed waiting-worker state");
assert.match(recoveryHook, /04b919dfdb8554a9d303a9d535f7839f/, "Recovery hook must remain limited to the P25 legacy cache revision");
assert.match(recoveryHook, /self\.skipWaiting\(\)/, "Recovery hook must activate only the documented legacy controller");
assert.match(finalRecoveryHook, /__pwa-update-migration-v1__/, "P27 recovery must depend on the prior bounded migration marker");
assert.match(finalRecoveryHook, /#\/overview/, "P27 recovery must limit automatic navigation to the safe Overview route");
assert.match(finalRecoveryHook, /client\.navigate/, "P27 recovery must navigate only selected safe legacy clients");
assert.match(p34RecoveryHook, /0a19d4c3d2fdcddc9ad27bd6a1b88215/, "P35 bootstrap must remain limited to the documented P33 bridge revision");
assert.match(p34RecoveryHook, /self\.skipWaiting\(\)/, "P35 bootstrap must activate only the documented P33 worker");
assert.doesNotMatch(p34RecoveryHook, /clients\.navigate|clients\.claim|caches\.delete/, "P35 bootstrap must not navigate clients, claim them or delete caches");
assert.doesNotMatch(indexHtml, /index-j-lylgkQ\.js/, "Retired P25 app asset remains referenced by index.html");
assert.doesNotMatch(serviceWorker, /index-j-lylgkQ\.js/, "Retired P25 app asset remains referenced by sw.js");
assertQuoteConsistency(quotes, legacy);

console.log(
  `Release artifact OK: app ${expectedAppReleaseVersion}, installable PWA, offline assets and VWCE ${legacy.price} ${legacy.currency} (${legacy.asOf}).`,
);
