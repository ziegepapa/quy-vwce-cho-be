import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeBundle, evaluateBundleBudget, DEFAULT_BUNDLE_BUDGETS } from "./analyze-bundle.mjs";

async function fixture({ withServiceWorker = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "vwce-bundle-"));
  const assets = path.join(root, "assets");
  await mkdir(assets, { recursive: true });
  await writeFile(path.join(assets, "index-a1b2c3.js"), "export const boot = true;\n".repeat(20));
  await writeFile(path.join(assets, "index-a1b2c3.css"), ".app { color: #123456; }\n".repeat(10));
  await writeFile(path.join(assets, "pdf.worker-a1b2c3.js"), "worker\n".repeat(500));
  await writeFile(path.join(assets, "Settings-a1b2c3.js"), "settings\n".repeat(100));
  await writeFile(path.join(assets, "Settings-a1b2c3.css"), ".settings { margin: 0; }\n".repeat(5));
  await writeFile(path.join(root, "index.html"), "<!doctype html><html></html>\n");
  if (withServiceWorker) {
    // Mirrors the real dist/sw.js shape: precacheAndRoute([...]) with a
    // duplicate URL and one entry whose file is missing from dist/.
    await writeFile(
      path.join(root, "sw.js"),
      `precacheAndRoute([{url:"index.html",revision:"abc"},{url:"assets/index-a1b2c3.js",revision:null},{url:"assets/index-a1b2c3.js",revision:null},{url:"assets/Settings-a1b2c3.js",revision:null},{url:"assets/gone-a1b2c3.js",revision:null}],{})`,
    );
  }
  return root;
}

test("analyzeBundle reports deterministic entry metrics and the largest asset", async () => {
  const root = await fixture();
  try {
    const metrics = await analyzeBundle(root);
    assert.equal(metrics.assetCount, 5);
    assert.equal(metrics.initialEntry.javascript.file, "assets/index-a1b2c3.js");
    assert.equal(metrics.initialEntry.css.file, "assets/index-a1b2c3.css");
    assert.equal(metrics.largestAsset.file, "assets/pdf.worker-a1b2c3.js");
    assert.ok(metrics.initialEntry.javascript.gzipBytes > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("analyzeBundle lists every route chunk with totals per type", async () => {
  const root = await fixture();
  try {
    const metrics = await analyzeBundle(root);
    assert.deepEqual(
      metrics.chunks.map((chunk) => chunk.file),
      [
        "assets/Settings-a1b2c3.js",
        "assets/index-a1b2c3.js",
        "assets/pdf.worker-a1b2c3.js",
        "assets/Settings-a1b2c3.css",
        "assets/index-a1b2c3.css",
      ],
    );
    assert.equal(metrics.totals.javascript.fileCount, 3);
    assert.equal(metrics.totals.css.fileCount, 2);
    assert.equal(
      metrics.totals.javascript.gzipBytes,
      metrics.chunks
        .filter((chunk) => chunk.file.endsWith(".js"))
        .reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
    );
    assert.equal(
      metrics.totals.css.gzipBytes,
      metrics.chunks
        .filter((chunk) => chunk.file.endsWith(".css"))
        .reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
    );
    for (const chunk of metrics.chunks) {
      assert.ok(chunk.rawBytes > 0 && chunk.gzipBytes > 0);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("analyzeBundle totals the PWA precache from dist/sw.js, deduped", async () => {
  const root = await fixture();
  try {
    const metrics = await analyzeBundle(root);
    // 5 listed entries (one duplicate), 4 unique, 1 missing file.
    assert.equal(metrics.precache.entryCount, 5);
    assert.equal(metrics.precache.uniqueEntryCount, 4);
    assert.deepEqual(metrics.precache.missingEntries, ["assets/gone-a1b2c3.js"]);
    const present = metrics.precache.entries.filter((entry) => entry.rawBytes !== null);
    assert.equal(present.length, 3);
    assert.equal(
      metrics.precache.totalGzipBytes,
      present.reduce((sum, entry) => sum + entry.gzipBytes, 0),
    );
    assert.equal(
      metrics.precache.totalRawBytes,
      present.reduce((sum, entry) => sum + entry.rawBytes, 0),
    );
    // The duplicate URL is counted once in the byte totals.
    assert.equal(
      metrics.precache.entries.filter((entry) => entry.url === "assets/index-a1b2c3.js").length,
      1,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("analyzeBundle reports an empty precache when dist/sw.js is absent", async () => {
  const root = await fixture({ withServiceWorker: false });
  try {
    const metrics = await analyzeBundle(root);
    assert.deepEqual(metrics.precache, {
      entryCount: 0,
      uniqueEntryCount: 0,
      totalRawBytes: 0,
      totalGzipBytes: 0,
      missingEntries: [],
      entries: [],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("evaluateBundleBudget fails only the entry metric that exceeds its limit", () => {
  const metrics = {
    initialEntry: {
      javascript: { gzipBytes: 401 },
      css: { gzipBytes: 40 },
    },
  };
  const result = evaluateBundleBudget(metrics, {
    initialJsGzipBytes: 400,
    initialCssGzipBytes: 40,
  });
  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, [{
    name: "initial JavaScript gzip",
    actual: 401,
    budget: 400,
  }]);
});

test("evaluateBundleBudget fails the new total JS and precache checks when they exceed", () => {
  const metrics = {
    initialEntry: {
      javascript: { gzipBytes: 100 },
      css: { gzipBytes: 10 },
    },
    totals: {
      javascript: { gzipBytes: DEFAULT_BUNDLE_BUDGETS.totalJsGzipBytes + 1 },
      css: { gzipBytes: 10 },
    },
    precache: { totalGzipBytes: DEFAULT_BUNDLE_BUDGETS.totalPrecacheGzipBytes + 1 },
  };
  const result = evaluateBundleBudget(metrics);
  assert.equal(result.passed, false);
  assert.deepEqual(
    result.failures.map((failure) => failure.name),
    ["total route-chunk JavaScript gzip", "total PWA precache gzip"],
  );
  assert.equal(result.checks.length, 4);
});

test("evaluateBundleBudget passes when totals and precache are within the new budgets", () => {
  const metrics = {
    initialEntry: {
      javascript: { gzipBytes: 100 },
      css: { gzipBytes: 10 },
    },
    totals: {
      javascript: { gzipBytes: DEFAULT_BUNDLE_BUDGETS.totalJsGzipBytes },
      css: { gzipBytes: 10 },
    },
    precache: { totalGzipBytes: DEFAULT_BUNDLE_BUDGETS.totalPrecacheGzipBytes },
  };
  assert.equal(evaluateBundleBudget(metrics).passed, true);
});
