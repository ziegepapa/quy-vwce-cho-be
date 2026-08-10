import { describe, expect, it } from "vitest";
import type { Transaction, TxType } from "./types";
import {
  presentTransaction,
  takeRecentTransactions,
} from "./transactionPresentation";

function transaction(
  id: string,
  date: string,
  type: TxType,
  updatedAt: string,
  deletedAt?: string,
): Transaction {
  return {
    id,
    date,
    type,
    amount: 100,
    notes: "",
    createdAt: updatedAt,
    updatedAt,
    source: "manual",
    deletedAt,
  } as Transaction;
}

describe("transaction presentation", () => {
  it("keeps investment, inflow and outflow semantics distinct", () => {
    expect(presentTransaction("buy_vwce")).toMatchObject({
      label: "Mua VWCE",
      amountPrefix: "",
      tone: "buy",
    });
    expect(presentTransaction("cash_in")).toMatchObject({
      label: "Nạp tiền",
      amountPrefix: "+",
      tone: "cash-in",
    });
    expect(presentTransaction("fee")).toMatchObject({
      label: "Phí",
      amountPrefix: "−",
      tone: "cash-out",
    });
  });

  it("returns live rows newest first without mutating the ledger", () => {
    const original = [
      transaction("older", "2026-08-08", "cash_in", "2026-08-08T09:00:00Z"),
      transaction("same-day-old", "2026-08-10", "fee", "2026-08-10T08:00:00Z"),
      transaction("deleted", "2026-08-11", "cash_out", "2026-08-11T08:00:00Z", "2026-08-11T09:00:00Z"),
      transaction("newest", "2026-08-10", "buy_vwce", "2026-08-10T10:00:00Z"),
    ];

    expect(takeRecentTransactions(original, 2).map((row) => row.id)).toEqual([
      "newest",
      "same-day-old",
    ]);
    expect(original.map((row) => row.id)).toEqual([
      "older",
      "same-day-old",
      "deleted",
      "newest",
    ]);
  });
});
