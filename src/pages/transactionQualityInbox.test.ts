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

  it("accepts a security transaction when amount and unit price can infer its quantity", () => {
    const issues = findTransactionQualityIssues([
      tx({ id: "inferred", type: "buy_vwce", amount: 200, unitPrice: 100, quantity: undefined, notes: "Auto quantity" }),
    ]);

    expect(issues).toEqual([]);
  });
});
