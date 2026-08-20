import { describe, expect, it } from "vitest";
import { buildImportReviewWorkspace } from "./importReviewWorkspace";

const draft = {
  date: "2026-08-20",
  type: "buy_vwce" as const,
  amount: 100,
  unitPrice: 100,
  quantity: 1,
  fee: 0,
  tax: 0,
  notes: "Trade Republic · TR-42",
  isin: "IE00BK5BQT80",
  docNumber: "TR-42",
  externalRef: "trade_republic:TR-42",
  source: "trade_republic_pdf" as const,
  sourceVersion: 2,
};

describe("buildImportReviewWorkspace", () => {
  it("permits confirmation only for a validated draft with a clear dedupe result", () => {
    expect(buildImportReviewWorkspace({ draft, validation: { ok: true }, duplicateStatus: "clear", warningCount: 2 }))
      .toEqual({ documentRef: "TR-42", isValidationReady: true, duplicateStatus: "clear", warningCount: 2, canConfirm: true });
  });

  it("keeps the confirmation locked while duplicate checking, after a duplicate, or when validation fails", () => {
    expect(buildImportReviewWorkspace({ draft, validation: { ok: true }, duplicateStatus: "checking", warningCount: 0 }).canConfirm).toBe(false);
    expect(buildImportReviewWorkspace({ draft, validation: { ok: true }, duplicateStatus: "duplicate", warningCount: 0 }).canConfirm).toBe(false);
    expect(buildImportReviewWorkspace({ draft, validation: { ok: false, error: "invalid" }, duplicateStatus: "clear", warningCount: 0 }).canConfirm).toBe(false);
  });

  it("handles the empty review state without turning negative warning counts into data", () => {
    expect(buildImportReviewWorkspace({ draft: null, validation: null, duplicateStatus: "idle", warningCount: -3 }))
      .toEqual({ documentRef: null, isValidationReady: false, duplicateStatus: "idle", warningCount: 0, canConfirm: false });
  });
});
