import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const DEFAULT_BUNDLE_BUDGETS = Object.freeze({
  initialJsGzipBytes: 400 * 1024,
  initialCssGzipBytes: 40 * 1024,
});

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(target);
    return [target];
  }));
  return nested.flat();
}

function entryAsset(files, pattern, label) {
  const matches = files.filter((file) => pattern.test(path.basename(file)));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} entry asset, found ${matches.length}.`);
  }
  return matches[0];
}

async function assetMetrics(file, root) {
  const [content, metadata] = await Promise.all([readFile(file), stat(file)]);
  return {
    file: path.relative(root, file).split(path.sep).join("/"),
    rawBytes: metadata.size,
    gzipBytes: gzipSync(content).length,
  };
}

export async function analyzeBundle(distDir = path.resolve("dist")) {
  const root = path.resolve(distDir);
  const assetsDir = path.join(root, "assets");
  const files = await listFiles(assetsDir);
  const jsFile = entryAsset(files, /^index-[^.]+\.js$/, "JavaScript");
  const cssFile = entryAsset(files, /^index-[^.]+\.css$/, "CSS");
  const allAssets = await Promise.all(files.map((file) => assetMetrics(file, root)));
  const largestAsset = [...allAssets].sort((a, b) => b.rawBytes - a.rawBytes)[0];

  return {
    distDir: root,
    assetCount: allAssets.length,
    initialEntry: {
      javascript: await assetMetrics(jsFile, root),
      css: await assetMetrics(cssFile, root),
    },
    largestAsset,
  };
}

export function evaluateBundleBudget(metrics, budgets = DEFAULT_BUNDLE_BUDGETS) {
  const checks = [
    {
      name: "initial JavaScript gzip",
      actual: metrics.initialEntry.javascript.gzipBytes,
      budget: budgets.initialJsGzipBytes,
    },
    {
      name: "initial CSS gzip",
      actual: metrics.initialEntry.css.gzipBytes,
      budget: budgets.initialCssGzipBytes,
    },
  ];
  const failures = checks.filter((check) => check.actual > check.budget);
  return { checks, failures, passed: failures.length === 0 };
}

export async function main({ distDir = process.env.BUNDLE_ANALYZE_DIST_DIR ?? "dist", assertBudget = process.env.BUNDLE_BUDGET_ASSERT === "1" } = {}) {
  const metrics = await analyzeBundle(distDir);
  const budget = evaluateBundleBudget(metrics);
  const report = {
    ...metrics,
    budget: {
      limits: DEFAULT_BUNDLE_BUDGETS,
      checks: budget.checks,
      passed: budget.passed,
    },
  };
  console.log(JSON.stringify(report, null, 2));
  if (!assertBudget || budget.passed) return report;

  const detail = budget.failures
    .map((failure) => `${failure.name}: ${failure.actual} B exceeds ${failure.budget} B`)
    .join("; ");
  throw new Error(`Bundle budget exceeded: ${detail}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
