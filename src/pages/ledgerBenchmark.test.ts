import { describe, expect, it } from "vitest";
import { buildDeterministicLedger, measureLedgerWindow } from "./ledgerBenchmark";

describe("ledger benchmark harness", () => {
  it("reports the bounded progressive window for the supported 1,000-row envelope", () => {
    const report = measureLedgerWindow(buildDeterministicLedger(1000));

    expect(report.transactionCount).toBe(1000);
    expect(report.initialVisible).toBe(60);
    expect(report.expandedVisible).toBe(120);
    expect(report.initialGroupCount).toBeGreaterThan(0);
    expect(report.expandedGroupCount).toBeGreaterThan(0);
    expect(report.uniqueExpandedRows).toBe(true);
    expect(report.initialDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.expandedDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("keeps the same bounded contract for a 5,000-row diagnostic probe", () => {
    const report = measureLedgerWindow(buildDeterministicLedger(5000), {
      query: "",
      year: "all",
      type: "all",
      activity: "all",
      sort: "amount_desc",
    });

    expect(report.transactionCount).toBe(5000);
    expect(report.initialVisible).toBe(60);
    expect(report.expandedVisible).toBe(120);
    expect(report.uniqueExpandedRows).toBe(true);
  });
});
