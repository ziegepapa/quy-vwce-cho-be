import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

// Budgets are regression ceilings, not targets. New totals measured on the
// dist/ build present on 2026-11-19 (node gzipSync, before the modern-stack
// upgrade rebuild):
//   total route-chunk JS gzip 730,992 B (713.9 KiB, 24 files, incl. the
//     394 KiB pdf.worker chunk) -> budget 800 KiB (+12.1% headroom)
//   total PWA precache gzip 790,352 B (771.8 KiB, 56 listed / 48 unique
//     entries in dist/sw.js) -> budget 900 KiB (+16.6% headroom)
export const DEFAULT_BUNDLE_BUDGETS = Object.freeze({
  initialJsGzipBytes: 400 * 1024,
  initialCssGzipBytes: 40 * 1024,
  totalJsGzipBytes: 800 * 1024,
  totalPrecacheGzipBytes: 900 * 1024,
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

function sumBytes(assets) {
  return assets.reduce(
    (totals, asset) => ({
      rawBytes: totals.rawBytes + asset.rawBytes,
      gzipBytes: totals.gzipBytes + asset.gzipBytes,
    }),
    { rawBytes: 0, gzipBytes: 0 },
  );
}

// The precache manifest lives inline in dist/sw.js as the array passed to
// workbox's precacheAndRoute([...]) (vite-plugin-pwa generates it; there is
// no separate precache manifest file). Entries are dist-relative URLs; the
// list contains duplicates (workbox emits some URLs twice), so byte totals
// are computed over unique URLs only.
async function precacheMetrics(root) {
  const empty = {
    entryCount: 0,
    uniqueEntryCount: 0,
    totalRawBytes: 0,
    totalGzipBytes: 0,
    missingEntries: [],
    entries: [],
  };
  let swContent;
  try {
    swContent = await readFile(path.join(root, "sw.js"), "utf8");
  } catch {
    return empty; // No service worker yet (e.g. a test fixture): no precache.
  }
  const match = swContent.match(/precacheAndRoute\(\[([\s\S]*?)\]/);
  if (!match) {
    throw new Error("Expected a precacheAndRoute([...]) manifest in dist/sw.js, found none.");
  }
  const listedUrls = [...match[1].matchAll(/url:"([^"]+)"/g)].map((entry) => entry[1]);
  const uniqueUrls = [...new Set(listedUrls)];
  const entries = [];
  const missingEntries = [];
  for (const url of uniqueUrls) {
    const relative = url.replace(/^\/+/, "");
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) {
      missingEntries.push(url);
      entries.push({ url, file: null, rawBytes: null, gzipBytes: null });
      continue;
    }
    try {
      entries.push({ url, ...(await assetMetrics(file, root)) });
    } catch {
      missingEntries.push(url);
      entries.push({ url, file: null, rawBytes: null, gzipBytes: null });
    }
  }
  const present = entries.filter((entry) => entry.rawBytes !== null);
  const totals = sumBytes(present);
  return {
    entryCount: listedUrls.length,
    uniqueEntryCount: uniqueUrls.length,
    totalRawBytes: totals.rawBytes,
    totalGzipBytes: totals.gzipBytes,
    missingEntries,
    entries,
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
  // Plain code-unit order: deterministic across locales (localeCompare
  // orders e.g. "index-..." before "Settings-..." in some locales).
  const byFile = (a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  const jsChunks = allAssets
    .filter((asset) => asset.file.endsWith(".js"))
    .sort(byFile);
  const cssChunks = allAssets
    .filter((asset) => asset.file.endsWith(".css"))
    .sort(byFile);

  return {
    distDir: root,
    assetCount: allAssets.length,
    initialEntry: {
      javascript: await assetMetrics(jsFile, root),
      css: await assetMetrics(cssFile, root),
    },
    largestAsset,
    chunks: [...jsChunks, ...cssChunks],
    totals: {
      javascript: { fileCount: jsChunks.length, ...sumBytes(jsChunks) },
      css: { fileCount: cssChunks.length, ...sumBytes(cssChunks) },
    },
    precache: await precacheMetrics(root),
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
  // New checks only apply when the caller supplies the new metrics, so
  // older callers passing just initialEntry keep working unchanged.
  const totalJsGzip = metrics.totals?.javascript?.gzipBytes;
  if (typeof totalJsGzip === "number") {
    checks.push({
      name: "total route-chunk JavaScript gzip",
      actual: totalJsGzip,
      budget: budgets.totalJsGzipBytes,
    });
  }
  const totalPrecacheGzip = metrics.precache?.totalGzipBytes;
  if (typeof totalPrecacheGzip === "number") {
    checks.push({
      name: "total PWA precache gzip",
      actual: totalPrecacheGzip,
      budget: budgets.totalPrecacheGzipBytes,
    });
  }
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
