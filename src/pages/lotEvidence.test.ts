import { describe, expect, it } from "vitest";
import { buildLotEvidenceSummary, type LotEvidenceFixtureInput } from "./lotEvidence";

const base: LotEvidenceFixtureInput = {
  evidenceId: "fixture-test",
  eventKind: "purchase",
  eventDate: "2025-01-01",
  instrumentLabel: "Synthetic ETF",
  lotId: "synthetic-lot",
  sourceStatus: "known",
  quantityStatus: "known",
};

describe("P11.1 lot evidence fixture contract", () => {
  it("keeps a complete synthetic evidence row reviewable", () => {
    const result = buildLotEvidenceSummary([base]);
    expect(result.ready).toBe(1);
    expect(result.rows[0]).toMatchObject({ lotStatus: "known", reviewState: "reviewable", reasonCode: "ready" });
  });

  it.each([
    ["missing lot", { lotId: undefined }, "unknown", "missing_lot"],
    ["missing transfer source", { eventKind: "transfer", transferSource: undefined }, "unknown", "missing_transfer_source"],
    ["missing split reference", { eventKind: "split", splitReference: undefined }, "incomplete", "missing_split_reference"],
    ["partial sale without lot", { eventKind: "partial_sale", lotId: undefined }, "unknown", "missing_lot"],
    ["conflicting source", { sourceStatus: "conflict", quantityStatus: "conflict" }, "unknown", "conflicting_source"],
    ["missing quantity", { quantityStatus: "missing" }, "unknown", "missing_quantity"],
  ] as const)("keeps %s as not-ready without fallback", (_name, overrides, lotStatus, reasonCode) => {
    const result = buildLotEvidenceSummary([{ ...base, ...overrides }]);
    expect(result.notReady).toBe(1);
    expect(result.rows[0]).toMatchObject({ lotStatus, reviewState: "not_ready", reasonCode });
  });

  it("does not invent rows for invalid timestamps or empty IDs", () => {
    const result = buildLotEvidenceSummary([
      { ...base, evidenceId: "", eventDate: "2025-01-01" },
      { ...base, evidenceId: "invalid-date", eventDate: "not-a-date" },
    ]);
    expect(result.total).toBe(0);
  });

  it("returns only print-safe allowlist fields and never financial or personal payload", () => {
    const result = buildLotEvidenceSummary([{
      ...base,
      amount: 999999,
      unitPrice: 123,
      accountRef: "secret-account",
      notes: "private note",
      childName: "private child",
      contactPhone: "+49-PRIVATE",
    } as LotEvidenceFixtureInput & Record<string, unknown>]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("999999");
    expect(serialized).not.toContain("secret-account");
    expect(serialized).not.toContain("private note");
    expect(serialized).not.toContain("private child");
    expect(serialized).not.toContain("PRIVATE");
    expect(Object.keys(result.rows[0])).toEqual([
      "evidenceId", "eventKind", "eventDate", "instrumentLabel", "sourceStatus", "quantityStatus", "lotStatus", "reviewState", "reasonCode",
    ]);
  });

  it("does not expose a tax result or FIFO decision", () => {
    const result = buildLotEvidenceSummary([base]);
    expect(JSON.stringify(result)).not.toMatch(/tax|steuer|fifo|vorabpauschale|costbasis/i);
  });
});
