import assert from "node:assert/strict";
import { assertVersionMatch, readAppReleaseVersion, readReleaseVersionFromHtml } from "./app-release-version.mjs";

const defaultBaseUrl = "https://ziegepapa.github.io/quy-vwce-cho-be/";
const baseUrl = new URL(process.env.BASE_URL ?? defaultBaseUrl);
const maxQuoteAgeDays = Number(process.env.MAX_QUOTE_AGE_DAYS ?? 7);

async function fetchResource(relativePath, format = "text") {
  const url = new URL(relativePath, baseUrl);
  url.searchParams.set("health", Date.now().toString());
  const response = await fetch(url, {
    redirect: "follow",
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
  });
  assert.ok(response.ok, `${url.pathname} returned HTTP ${response.status}`);
  return format === "json" ? response.json() : response.text();
}

function assertQuoteConsistency(quotes, legacy) {
  assert.equal(quotes.schemaVersion, 2, "Production quotes.json must use schema 2");
  assert.equal(legacy.schemaVersion, 1, "Production vwce-price.json must use schema 1");
  const current = quotes.quotes?.find((quote) => quote.instrumentIsin === legacy.isin);
  assert.ok(current, "Production VWCE quote is missing");
  assert.ok(Number.isFinite(current.price) && current.price > 0, "Production VWCE price is invalid");
  assert.equal(current.price, legacy.price, "Production quote prices disagree");
  assert.equal(current.currency, legacy.currency, "Production quote currencies disagree");
  assert.equal(current.venue, legacy.venue, "Production quote venues disagree");
  assert.equal(current.asOf, legacy.asOf, "Production quote dates disagree");

  const quoteTimestamp = Date.parse(`${current.asOf}T23:59:59.999Z`);
  assert.ok(Number.isFinite(quoteTimestamp), "Production quote date is invalid");
  const ageDays = (Date.now() - quoteTimestamp) / 86_400_000;
  assert.ok(ageDays <= maxQuoteAgeDays, `Production quote is ${ageDays.toFixed(1)} days old`);
  assert.ok(ageDays >= -2, "Production quote date is unexpectedly far in the future");
  return current;
}

const [expectedAppReleaseVersion, indexHtml, manifest, serviceWorker, quotes, legacy] = await Promise.all([
  readAppReleaseVersion(),
  fetchResource("./"),
  fetchResource("manifest.webmanifest", "json"),
  fetchResource("sw.js"),
  fetchResource("data/quotes.json", "json"),
  fetchResource("data/vwce-price.json", "json"),
]);

assert.match(indexHtml, /<title>Quỹ VWCE cho bé<\/title>/i, "Production shell title is missing");
assertVersionMatch(expectedAppReleaseVersion, readReleaseVersionFromHtml(indexHtml), "Production artifact");
assert.match(indexHtml, /id="root"/i, "Production root element is missing");
assert.equal(manifest.start_url, "/quy-vwce-cho-be/");
assert.equal(manifest.display, "standalone");
assert.ok(
  manifest.icons?.some(
    (icon) => icon.type === "image/png" && icon.purpose?.split(/\s+/).includes("maskable"),
  ),
  "Production manifest has no maskable PNG icon",
);
assert.match(serviceWorker, /data\/quotes\.json/, "Production service worker does not precache quotes");
const current = assertQuoteConsistency(quotes, legacy);

console.log(
  `Production OK: app ${expectedAppReleaseVersion}, shell, PWA and quote feeds; VWCE ${current.price} ${current.currency} (${current.asOf}).`,
);
