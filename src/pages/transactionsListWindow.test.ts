import { describe, expect, it } from "vitest";
import type { Transaction } from "../lib/types";
import { buildTransactionListWindow, TRANSACTION_WINDOW_SIZE } from "./transactionsListWindow";

function ledger(count: number): Transaction[] {
  return Array.from({ length: count }, (_, index) => {
    const year = index < count / 2 ? "2026" : "2025";
    const month = String((index % 12) + 1).padStart(2, "0");
    const day = String((index % 28) + 1).padStart(2, "0");
    return {
      id: `tx-${String(index).padStart(4, "0")}`,
      date: `${year}-${month}-${day}`,
      type: index % 2 === 0 ? "buy_vwce" : "cash_in",
      amount: 100 + index,
      notes: index === 777 ? "special marker" : `row ${index}`,
      createdAt: `2026-01-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
      updatedAt: `2026-01-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
    };
  });
}

function visibleIds(window: ReturnType<typeof buildTransactionListWindow>) {
  return window.groups.flatMap((group) => group.transactions.map((transaction) => transaction.id));
}

describe("transactionsListWindow", () => {
  it("bounds the first mobile render to 60 rows for a 1,000-row ledger", () => {
    const result = buildTransactionListWindow(ledger(1000), { query: "", year: "all", type: "all" }, TRANSACTION_WINDOW_SIZE);

    expect(result.total).toBe(1000);
    expect(result.visible).toBe(60);
    expect(result.remaining).toBe(940);
    expect(result.hasMore).toBe(true);
    expect(visibleIds(result)).toHaveLength(60);
    expect(result.groups.every((group) => group.transactions.length > 0)).toBe(true);
  });

  it("reveals the next chronological window without duplicating or losing rows", () => {
    const transactions = ledger(1000);
    const first = buildTransactionListWindow(transactions, { query: "", year: "all", type: "all" }, 60);
    const expanded = buildTransactionListWindow(transactions, { query: "", year: "all", type: "all" }, 120);
    const firstIds = visibleIds(first);
    const expandedIds = visibleIds(expanded);

    expect(expandedIds).toHaveLength(120);
    expect(new Set(expandedIds)).toHaveLength(120);
    expect(expandedIds.slice(0, 60)).toEqual(firstIds);
    expect(expandedIds[60]).not.toBe(firstIds[59]);
  });

  it("filters before windowing and keeps the result deterministic", () => {
    const transactions = ledger(1000);
    const filtered = buildTransactionListWindow(transactions, { query: "", year: "2026", type: "buy_vwce" }, 60);
    const found = buildTransactionListWindow(transactions, { query: "special marker", year: "all", type: "all" }, 60);

    expect(filtered.total).toBe(250);
    expect(filtered.visible).toBe(60);
    expect(visibleIds(filtered).every((id) => Number(id.slice(3)) < 500 && Number(id.slice(3)) % 2 === 0)).toBe(true);
    expect(found.total).toBe(1);
    expect(visibleIds(found)).toEqual(["tx-0777"]);
  });

  it("filters transaction activity before windowing without changing the progressive 60-row contract", () => {
    const transactions = ledger(1000);
    const trades = buildTransactionListWindow(transactions, { query: "", year: "all", type: "all", activity: "trade" }, 60);
    const funding = buildTransactionListWindow(transactions, { query: "", year: "all", type: "all", activity: "funding" }, 60);

    expect(trades.total).toBe(500);
    expect(trades.visible).toBe(60);
    expect(visibleIds(trades).every((id) => Number(id.slice(3)) % 2 === 0)).toBe(true);
    expect(funding.total).toBe(500);
    expect(funding.visible).toBe(60);
    expect(visibleIds(funding).every((id) => Number(id.slice(3)) % 2 === 1)).toBe(true);
  });

  it("supports amount sorting and localized type-label search with deterministic ties", () => {
    const transactions = ledger(1000);
    const byAmount = buildTransactionListWindow(transactions, { query: "", year: "all", type: "all", sort: "amount_desc" }, 60);
    const localizedSearch = buildTransactionListWindow(transactions, {
      query: "mua",
      year: "all",
      type: "all",
      typeSearchTerms: { buy_vwce: "Mua VWCE", cash_in: "Góp tiền" },
    }, 60);

    expect(visibleIds(byAmount)[0]).toBe("tx-0999");
    expect(byAmount.visible).toBe(60);
    expect(localizedSearch.total).toBe(500);
    expect(visibleIds(localizedSearch).every((id) => Number(id.slice(3)) % 2 === 0)).toBe(true);
  });
});
