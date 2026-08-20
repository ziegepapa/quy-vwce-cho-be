import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeBundle, evaluateBundleBudget } from "./analyze-bundle.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "vwce-bundle-"));
  const assets = path.join(root, "assets");
  await mkdir(assets, { recursive: true });
  await writeFile(path.join(assets, "index-a1b2c3.js"), "export const boot = true;\n".repeat(20));
  await writeFile(path.join(assets, "index-a1b2c3.css"), ".app { color: #123456; }\n".repeat(10));
  await writeFile(path.join(assets, "pdf.worker-a1b2c3.js"), "worker\n".repeat(500));
  return root;
}

test("analyzeBundle reports deterministic entry metrics and the largest asset", async () => {
  const root = await fixture();
  try {
    const metrics = await analyzeBundle(root);
    assert.equal(metrics.assetCount, 3);
    assert.equal(metrics.initialEntry.javascript.file, "assets/index-a1b2c3.js");
    assert.equal(metrics.initialEntry.css.file, "assets/index-a1b2c3.css");
    assert.equal(metrics.largestAsset.file, "assets/pdf.worker-a1b2c3.js");
    assert.ok(metrics.initialEntry.javascript.gzipBytes > 0);
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
