import { describe, expect, it } from "vitest";
import {
  sideToTxType,
  buildExternalRef,
  trExecutionToDraft,
  validateTrImportDraft,
  draftToTransaction,
  VWCE_ISIN,
  TR_SOURCE,
} from "./toTransaction";
import type { TrExecution } from "./parseTr";

const sampleBuy: TrExecution = {
  side: "buy",
  date: "2024-03-15",
  isin: VWCE_ISIN,
  quantity: 10.5,
  unitPrice: 100.25,
  amount: 1053.63,
  fee: 1,
  docNumber: "ABC-123456",
};

describe("sideToTxType", () => {
  it("buy → buy_vwce", () => expect(sideToTxType("buy")).toBe("buy_vwce"));
  it("sell → sell_vwce", () => expect(sideToTxType("sell")).toBe("sell_vwce"));
});

describe("buildExternalRef", () => {
  it("forms trade_republic:<docNumber>", () => {
    expect(buildExternalRef("ABC-123456")).toBe("trade_republic:ABC-123456");
  });
  it("trims whitespace", () => {
    expect(buildExternalRef("  X9  ")).toBe("trade_republic:X9");
  });
  it("empty → null", () => {
    expect(buildExternalRef("")).toBeNull();
    expect(buildExternalRef("   ")).toBeNull();
  });
});

describe("trExecutionToDraft", () => {
  it("maps buy fields and default notes", () => {
    const d = trExecutionToDraft(sampleBuy);
    expect(d.type).toBe("buy_vwce");
    expect(d.date).toBe("2024-03-15");
    expect(d.quantity).toBe(10.5);
    expect(d.unitPrice).toBe(100.25);
    expect(d.amount).toBe(1053.63);
    expect(d.fee).toBe(1);
    expect(d.tax).toBe(0);
    expect(d.notes).toBe("Trade Republic · ABC-123456");
    expect(d.externalRef).toBe("trade_republic:ABC-123456");
    expect(d.source).toBe(TR_SOURCE);
    expect(d.sourceVersion).toBe(1);
  });

  it("sell maps to sell_vwce", () => {
    const d = trExecutionToDraft({ ...sampleBuy, side: "sell" });
    expect(d.type).toBe("sell_vwce");
  });
});

describe("validateTrImportDraft", () => {
  it("accepts valid VWCE draft", () => {
    expect(validateTrImportDraft(trExecutionToDraft(sampleBuy))).toEqual({ ok: true });
  });

  it("blocks wrong ISIN", () => {
    const d = trExecutionToDraft({ ...sampleBuy, isin: "IE00B4L5Y983" });
    const v = validateTrImportDraft(d);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/ISIN/);
  });

  it("blocks empty docNumber", () => {
    const d = trExecutionToDraft({ ...sampleBuy, docNumber: "" });
    const v = validateTrImportDraft(d);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/hóa đơn/);
  });

  it("blocks non-positive amount", () => {
    const d = trExecutionToDraft(sampleBuy);
    d.amount = 0;
    const v = validateTrImportDraft(d);
    expect(v.ok).toBe(false);
  });
});

describe("draftToTransaction", () => {
  it("preserves source fields", () => {
    const d = trExecutionToDraft(sampleBuy);
    const tx = draftToTransaction(d, {
      id: "tx_1",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(tx.type).toBe("buy_vwce");
    expect(tx.source).toBe("trade_republic_pdf");
    expect(tx.sourceVersion).toBe(1);
    expect(tx.externalRef).toBe("trade_republic:ABC-123456");
    expect(tx.notes).toContain("ABC-123456");
  });
});
