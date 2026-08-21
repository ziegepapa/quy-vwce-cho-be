import { describe, expect, it } from "vitest";
import {
  assertAcceptedTransactionForNewIngestion,
  classifyTransaction,
  classifyTransactionAgainstHoldings,
  compareTransactionReplayOrder,
} from "./transactionValidation";
import { VWCE_ISIN } from "./types";
import type { Transaction } from "./types";

function tx(partial: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    date: "2026-08-21",
    type: "buy_vwce",
    amount: 100,
    unitPrice: 50,
    quantity: 2,
    fee: 0,
    tax: 0,
    notes: "H2-B fixture",
    createdAt: "2026-08-21T08:00:00.000Z",
    updatedAt: "2026-08-21T08:00:00.000Z",
    source: "manual",
    ...partial,
  };
}

describe("H2-B canonical transaction classifier", () => {
  it("accepts a valid explicit security buy and canonicalizes its ISIN", () => {
    const result = classifyTransaction(tx({ instrumentIsin: ` ${VWCE_ISIN.toLowerCase()} ` }));
    expect(result).toMatchObject({
      status: "accepted",
      quantityOrigin: "explicit",
      normalized: { instrumentIsin: VWCE_ISIN, quantity: 2 },
    });
  });

  it("derives buy quantity only from complete positive economics and marks provenance", () => {
    const result = classifyTransaction(tx({ quantity: undefined, amount: 105, unitPrice: 50, fee: 5, tax: 0 }));
    expect(result).toMatchObject({
      status: "accepted",
      quantityOrigin: "derived",
      normalized: { quantity: 2 },
    });
  });

  it("keeps a buy with missing quantity evidence incomplete rather than guessing", () => {
    expect(classifyTransaction(tx({ quantity: undefined, unitPrice: undefined }))).toMatchObject({
      status: "incomplete",
      reasonCode: "MISSING_BUY_QUANTITY_EVIDENCE",
    });
  });

  it("marks a sale with missing quantity incomplete and creates no accepted payload", () => {
    expect(classifyTransaction(tx({ type: "sell_vwce", quantity: undefined }))).toMatchObject({
      status: "incomplete",
      reasonCode: "MISSING_SALE_QUANTITY",
      normalized: null,
    });
  });

  it("marks a zero-quantity sale invalid", () => {
    expect(classifyTransaction(tx({ type: "sell_vwce", quantity: 0 }))).toMatchObject({
      status: "invalid",
      reasonCode: "ZERO_QUANTITY",
    });
  });

  it("marks oversell invalid only after comparing against accepted holdings", () => {
    const result = classifyTransactionAgainstHoldings(tx({ type: "sell_vwce", quantity: 10 }), 2);
    expect(result).toMatchObject({ status: "invalid", reasonCode: "OVERSOLD" });
  });

  it.each([
    ["negative amount", { amount: -1 }, "INVALID_AMOUNT"],
    ["negative fee", { fee: -1 }, "INVALID_FEE"],
    ["negative tax", { tax: -1 }, "INVALID_TAX"],
    ["negative quantity", { quantity: -1 }, "INVALID_QUANTITY"],
    ["zero unit price", { unitPrice: 0 }, "INVALID_UNIT_PRICE"],
    ["invalid ISIN", { instrumentIsin: "BAD" }, "INVALID_ISIN"],
    ["invalid date", { date: "2026-02-30" }, "INVALID_DATE"],
    ["invalid type", { type: "mystery" as Transaction["type"] }, "INVALID_TYPE"],
  ])("classifies %s without an accepted financial payload", (_name, partial, reasonCode) => {
    expect(classifyTransaction(tx(partial))).toMatchObject({
      status: "invalid",
      reasonCode,
      normalized: null,
    });
  });

  it("preserves signed adjustment as the explicitly allowed negative amount type", () => {
    expect(classifyTransaction(tx({ type: "adjust", amount: -25, notes: "Reconciliation" }))).toMatchObject({
      status: "accepted",
      quantityOrigin: "not_applicable",
    });
  });

  it("rejects a new incomplete/invalid write via the strict ingestion gate", () => {
    expect(() => assertAcceptedTransactionForNewIngestion(tx({ type: "sell_vwce", quantity: undefined }))).toThrow(
      /INCOMPLETE: MISSING_SALE_QUANTITY/,
    );
    expect(() => assertAcceptedTransactionForNewIngestion(tx({ fee: -1 }))).toThrow(
      /INVALID: INVALID_FEE/,
    );
  });

  it("orders same-date replay by date, createdAt, then stable id", () => {
    const sameDate = [
      tx({ id: "b", createdAt: "2026-08-21T09:00:00.000Z" }),
      tx({ id: "a", createdAt: "2026-08-21T09:00:00.000Z" }),
      tx({ id: "z", createdAt: "2026-08-21T08:00:00.000Z" }),
      tx({ id: "later", date: "2026-08-22", createdAt: "2026-08-20T00:00:00.000Z" }),
    ];
    expect([...sameDate].sort(compareTransactionReplayOrder).map((entry) => entry.id)).toEqual([
      "z",
      "a",
      "b",
      "later",
    ]);
  });
});
