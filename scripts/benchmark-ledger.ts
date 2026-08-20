import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  LEDGER_BENCHMARK_SCENARIOS,
  LEDGER_WINDOW_PERFORMANCE_BUDGET_MS,
  buildDeterministicLedger,
  measureLedgerWindow,
  type LedgerBenchmarkScenario,
} from "../src/pages/ledgerBenchmark";

type Sample = {
  initialDurationMs: number;
  expandedDurationMs: number;
};

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index];
}

function summarize(transactionCount: number, scenario: LedgerBenchmarkScenario, samples: Sample[]) {
  const initial = samples.map((sample) => sample.initialDurationMs);
  const expanded = samples.map((sample) => sample.expandedDurationMs);
  return {
    transactionCount,
    scenario: scenario.id,
    runs: samples.length,
    initialMedianMs: percentile(initial, 0.5),
    initialP95Ms: percentile(initial, 0.95),
    expandedMedianMs: percentile(expanded, 0.5),
    expandedP95Ms: percentile(expanded, 0.95),
  };
}

function readPositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const runCount = Math.max(1, Math.floor(readPositiveNumber(process.env.LEDGER_BENCHMARK_RUNS, 5)));
const transactionCounts = [100, 1_000, 5_000, 10_000];
const enforceBudget = process.env.LEDGER_BENCHMARK_ASSERT_BUDGET === "1";
const performanceBudgetMs = readPositiveNumber(process.env.LEDGER_BENCHMARK_MAX_P95_MS, LEDGER_WINDOW_PERFORMANCE_BUDGET_MS);
const reports = transactionCounts.flatMap((transactionCount) => {
  const transactions = buildDeterministicLedger(transactionCount);
  return LEDGER_BENCHMARK_SCENARIOS.map((scenario) => {
    const samples: Sample[] = [];
    for (let run = 0; run < runCount; run += 1) {
      const report = measureLedgerWindow(transactions, scenario.filters);
      const expectedInitial = Math.min(60, report.filteredCount);
      const expectedExpanded = Math.min(120, report.filteredCount);
      if (
        report.initialVisible !== expectedInitial
        || report.expandedVisible !== expectedExpanded
        || !report.uniqueExpandedRows
        || !report.expandedRowsWithinFilteredSet
      ) {
        throw new Error(`Ledger window contract failed for ${transactionCount} transactions (${scenario.id}).`);
      }
      samples.push(report);
    }
    const summary = summarize(transactionCount, scenario, samples);
    if (enforceBudget && (summary.initialP95Ms > performanceBudgetMs || summary.expandedP95Ms > performanceBudgetMs)) {
      throw new Error(`Ledger performance budget exceeded for ${transactionCount} transactions (${scenario.id}): ${JSON.stringify(summary)}; budget=${performanceBudgetMs}ms.`);
    }
    return summary;
  });
});

const artifact = {
  generatedAt: new Date().toISOString(),
  runtime: process.version,
  platform: process.platform,
  architecture: process.arch,
  runCount,
  enforceBudget,
  performanceBudgetMs: enforceBudget ? performanceBudgetMs : null,
  scenarios: LEDGER_BENCHMARK_SCENARIOS.map((scenario) => scenario.id),
  reports,
};
const outputPath = resolve(process.env.LEDGER_BENCHMARK_OUTPUT ?? "artifacts/ledger-benchmark.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
