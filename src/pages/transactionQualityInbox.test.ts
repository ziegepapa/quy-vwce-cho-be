import { describe, expect, it } from "vitest";
import type { Transaction } from "../lib/types";
import { findTransactionQualityIssues } from "./transactionQualityInbox";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "tx-default",
    date: "2026-08-20",
    type: "cash_in",
    amount: 100,
    notes: "Monthly contribution",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("findTransactionQualityIssues", () => {
  it("reports actionable incomplete transaction fields without mutating the ledger", () => {
    const transactions = [
      tx({ id: "valid-buy", type: "buy_vwce", amount: 100, unitPrice: 100, notes: "August buy" }),
      tx({ id: "missing-isin", type: "buy_security", quantity: 1, instrumentIsin: "", notes: "Other ETF" }),
      tx({ id: "invalid-isin", type: "buy_security", quantity: 1, instrumentIsin: "NOT-AN-ISIN", notes: "Other ETF" }),
      tx({ id: "bad-amount", amount: 0, notes: "Adjustment" }),
      tx({ id: "missing-quantity", type: "buy_vwce", amount: 100, notes: "Missing quantity" }),
      tx({ id: "missing-price", type: "buy_vwce", amount: 100, quantity: 1, notes: "Missing unit price" }),
      tx({ id: "missing-note", amount: 100, notes: "   " }),
      tx({ id: "deleted", type: "buy_security", amount: 0, notes: "", deletedAt: "2026-08-20T00:00:00.000Z" }),
    ];

    const issues = findTransactionQualityIssues(transactions);

    expect(issues.map((issue) => `${issue.transactionId}:${issue.code}`)).toEqual([
      "bad-amount:invalid_amount",
      "invalid-isin:invalid_isin",
      "missing-isin:missing_isin",
      "missing-quantity:missing_quantity",
      "missing-price:missing_unit_price",
      "missing-note:missing_note",
    ]);
    expect(issues.map((issue) => issue.severity)).toEqual(["action", "action", "action", "action", "review", "tip"]);
    expect(transactions.find((entry) => entry.id === "deleted")?.deletedAt).toBe("2026-08-20T00:00:00.000Z");
  });

  it("surfaces canonical incomplete, invalid and holdings-aware quarantine reasons with source metadata", () => {
    const transactions = [
      tx({ id: "buy-two", date: "2026-08-01", type: "buy_vwce", amount: 200, unitPrice: 100, quantity: 2, notes: "Held", source: "manual" }),
      tx({ id: "valid-sale", date: "2026-08-02", type: "sell_vwce", amount: 100, quantity: 1, notes: "Valid sale", source: "manual" }),
      tx({ id: "oversell", date: "2026-08-03", type: "sell_vwce", amount: 300, quantity: 3, notes: "Unsafe legacy sale", source: "manual" }),
      tx({ id: "missing-sale-quantity", date: "2026-08-04", type: "sell_vwce", amount: 100, quantity: undefined, notes: "TR evidence", source: "trade_republic_pdf" }),
      tx({ id: "negative-legacy", date: "2026-08-05", type: "buy_vwce", amount: 100, unitPrice: 50, quantity: -1, notes: "Raw legacy evidence" }),
    ];

    const issues = findTransactionQualityIssues(transactions);

    expect(issues.map((issue) => `${issue.transactionId}:${issue.code}`)).toEqual([
      "negative-legacy:INVALID_QUANTITY",
      "missing-sale-quantity:MISSING_SALE_QUANTITY",
      "oversell:OVERSOLD",
    ]);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ transactionId: "oversell", source: "canonical_replay", recordSource: "manual", semanticStatus: "invalid", severity: "action" }),
      expect.objectContaining({ transactionId: "missing-sale-quantity", source: "canonical_replay", recordSource: "trade_republic_pdf", semanticStatus: "incomplete", severity: "action" }),
      expect.objectContaining({ transactionId: "negative-legacy", source: "canonical_replay", recordSource: "legacy_or_unknown", semanticStatus: "invalid", severity: "action" }),
    ]));
    expect(transactions.find((entry) => entry.id === "negative-legacy")?.quantity).toBe(-1);
  });

  it("accepts a security transaction when amount and unit price can infer its quantity", () => {
    const issues = findTransactionQualityIssues([
      tx({ id: "inferred", type: "buy_vwce", amount: 200, unitPrice: 100, quantity: undefined, notes: "Auto quantity" }),
    ]);

    expect(issues).toEqual([]);
  });
});
