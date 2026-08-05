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

const OTHER_ISIN = "FR0010315770";
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
  it("keeps VWCE legacy aliases", () => {
    expect(sideToTxType("buy", VWCE_ISIN)).toBe("buy_vwce");
    expect(sideToTxType("sell", VWCE_ISIN)).toBe("sell_vwce");
  });
  it("maps other ISINs to generic security types", () => {
    expect(sideToTxType("buy", OTHER_ISIN)).toBe("buy_security");
    expect(sideToTxType("sell", OTHER_ISIN)).toBe("sell_security");
  });
});

describe("buildExternalRef", () => {
  it("forms trade_republic:<docNumber>", () => {
    expect(buildExternalRef("ABC-123456")).toBe("trade_republic:ABC-123456");
  });
  it("trims whitespace", () => expect(buildExternalRef("  X9  ")).toBe("trade_republic:X9"));
  it("empty → null", () => expect(buildExternalRef("   ")).toBeNull());
});

describe("trExecutionToDraft", () => {
  it("maps VWCE fields and source metadata", () => {
    const draft = trExecutionToDraft(sampleBuy);
    expect(draft.type).toBe("buy_vwce");
    expect(draft.externalRef).toBe("trade_republic:ABC-123456");
    expect(draft.source).toBe(TR_SOURCE);
    expect(draft.sourceVersion).toBe(2);
  });

  it("preserves another valid ISIN and generic type", () => {
    const draft = trExecutionToDraft({ ...sampleBuy, isin: OTHER_ISIN });
    expect(draft.type).toBe("buy_security");
    expect(draft.isin).toBe(OTHER_ISIN);
  });
});

describe("validateTrImportDraft", () => {
  it("accepts valid VWCE and non-VWCE drafts", () => {
    expect(validateTrImportDraft(trExecutionToDraft(sampleBuy))).toEqual({ ok: true });
    expect(
      validateTrImportDraft(trExecutionToDraft({ ...sampleBuy, isin: OTHER_ISIN })),
    ).toEqual({ ok: true });
  });

  it("blocks invalid ISIN checksum", () => {
    const result = validateTrImportDraft(
      trExecutionToDraft({ ...sampleBuy, isin: "FR0010315771" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/ISIN/);
  });

  it("blocks empty docNumber", () => {
    const result = validateTrImportDraft(trExecutionToDraft({ ...sampleBuy, docNumber: "" }));
    expect(result.ok).toBe(false);
  });
});

describe("draftToTransaction", () => {
  it("preserves generic ISIN, type and source fields", () => {
    const draft = trExecutionToDraft({ ...sampleBuy, isin: OTHER_ISIN });
    const tx = draftToTransaction(draft, {
      id: "tx_1",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(tx.type).toBe("buy_security");
    expect(tx.instrumentIsin).toBe(OTHER_ISIN);
    expect(tx.source).toBe("trade_republic_pdf");
    expect(tx.externalRef).toBe("trade_republic:ABC-123456");
  });
});
