import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

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

const [indexHtml, manifest, serviceWorker, quotes, legacy] = await Promise.all([
  readText("index.html"),
  readJson("manifest.webmanifest"),
  readText("sw.js"),
  readJson("data/quotes.json"),
  readJson("data/vwce-price.json"),
]);

assert.match(indexHtml, /<meta name="description"/i, "Description metadata is missing");
assert.match(indexHtml, /rel="manifest"/i, "Manifest link is missing");
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

assert.match(serviceWorker, /data\/quotes\.json/, "Quote feed is not precached");
assert.match(serviceWorker, /icon-maskable-512\.png/, "Maskable icon is not precached");
assertQuoteConsistency(quotes, legacy);

console.log(
  `Release artifact OK: installable PWA, offline assets and VWCE ${legacy.price} ${legacy.currency} (${legacy.asOf}).`,
);
