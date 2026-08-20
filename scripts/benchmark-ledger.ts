import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildDeterministicLedger, measureLedgerWindow } from "../src/pages/ledgerBenchmark";

type Sample = {
  transactionCount: number;
  initialDurationMs: number;
  expandedDurationMs: number;
};

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index];
}

function summarize(transactionCount: number, samples: Sample[]) {
  const initial = samples.map((sample) => sample.initialDurationMs);
  const expanded = samples.map((sample) => sample.expandedDurationMs);
  return {
    transactionCount,
    runs: samples.length,
    initialMedianMs: percentile(initial, 0.5),
    initialP95Ms: percentile(initial, 0.95),
    expandedMedianMs: percentile(expanded, 0.5),
    expandedP95Ms: percentile(expanded, 0.95),
  };
}

const runCount = Math.max(1, Number(process.env.LEDGER_BENCHMARK_RUNS ?? 5));
const transactionCounts = [100, 1000, 5000];
const reports = transactionCounts.map((transactionCount) => {
  const transactions = buildDeterministicLedger(transactionCount);
  const samples: Sample[] = [];
  for (let run = 0; run < runCount; run += 1) {
    const report = measureLedgerWindow(transactions);
    const expectedInitial = Math.min(60, transactionCount);
    const expectedExpanded = Math.min(120, transactionCount);
    if (
      report.initialVisible !== expectedInitial
      || report.expandedVisible !== expectedExpanded
      || !report.uniqueExpandedRows
    ) {
      throw new Error(`Ledger contract failed for ${transactionCount} transactions.`);
    }
    samples.push(report);
  }
  return summarize(transactionCount, samples);
});

const artifact = {
  generatedAt: new Date().toISOString(),
  runtime: process.version,
  platform: process.platform,
  architecture: process.arch,
  runCount,
  reports,
};
const outputPath = resolve(process.env.LEDGER_BENCHMARK_OUTPUT ?? "artifacts/ledger-benchmark.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
