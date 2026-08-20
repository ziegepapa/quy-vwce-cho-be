import { describe, expect, it } from "vitest";
import {
  LEDGER_BENCHMARK_SCENARIOS,
  buildDeterministicLedger,
  measureLedgerWindow,
} from "./ledgerBenchmark";

describe("ledger benchmark harness", () => {
  it("reports the bounded progressive window for the supported 1,000-row envelope", () => {
    const report = measureLedgerWindow(buildDeterministicLedger(1000));

    expect(report.transactionCount).toBe(1000);
    expect(report.filteredCount).toBe(1000);
    expect(report.initialVisible).toBe(60);
    expect(report.expandedVisible).toBe(120);
    expect(report.initialGroupCount).toBeGreaterThan(0);
    expect(report.expandedGroupCount).toBeGreaterThan(0);
    expect(report.uniqueExpandedRows).toBe(true);
    expect(report.expandedRowsWithinFilteredSet).toBe(true);
    expect(report.initialDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.expandedDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("keeps a bounded, unique progressive window for every supported 10,000-row scenario", () => {
    const ledger = buildDeterministicLedger(10_000);

    for (const scenario of LEDGER_BENCHMARK_SCENARIOS) {
      const report = measureLedgerWindow(ledger, scenario.filters);
      const expectedInitial = Math.min(60, report.filteredCount);
      const expectedExpanded = Math.min(120, report.filteredCount);

      expect(report.transactionCount).toBe(10_000);
      expect(report.filteredCount).toBeGreaterThan(0);
      expect(report.initialVisible).toBe(expectedInitial);
      expect(report.expandedVisible).toBe(expectedExpanded);
      expect(report.uniqueExpandedRows).toBe(true);
      expect(report.expandedRowsWithinFilteredSet).toBe(true);
    }
  });
});
