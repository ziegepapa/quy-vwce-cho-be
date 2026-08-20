import type { Transaction } from "../lib/types";
import {
  buildTransactionListWindow,
  TRANSACTION_WINDOW_SIZE,
  type TransactionListFilters,
} from "./transactionsListWindow";

export const LEDGER_WINDOW_PERFORMANCE_BUDGET_MS = 100;

export type LedgerBenchmarkScenario = {
  id: "all-newest" | "all-amount-desc" | "year-trade";
  filters: TransactionListFilters;
};

export const LEDGER_BENCHMARK_SCENARIOS: readonly LedgerBenchmarkScenario[] = [
  {
    id: "all-newest",
    filters: { query: "", year: "all", type: "all", activity: "all", sort: "newest", timeLens: "all", today: "2026-12-31" },
  },
  {
    id: "all-amount-desc",
    filters: { query: "", year: "all", type: "all", activity: "all", sort: "amount_desc", timeLens: "all", today: "2026-12-31" },
  },
  {
    id: "year-trade",
    filters: { query: "", year: "2026", type: "all", activity: "trade", sort: "newest", timeLens: "this_year", today: "2026-12-31" },
  },
] as const;

export type LedgerBenchmarkReport = {
  transactionCount: number;
  filteredCount: number;
  initialVisible: number;
  expandedVisible: number;
  initialGroupCount: number;
  expandedGroupCount: number;
  initialDurationMs: number;
  expandedDurationMs: number;
  uniqueExpandedRows: boolean;
  expandedRowsWithinFilteredSet: boolean;
};

export function buildDeterministicLedger(count: number): Transaction[] {
  return Array.from({ length: count }, (_, index) => {
    const year = index % 3 === 0 ? "2026" : index % 3 === 1 ? "2025" : "2024";
    const month = String((index % 12) + 1).padStart(2, "0");
    const day = String((index % 28) + 1).padStart(2, "0");
    return {
      id: `benchmark-${String(index).padStart(5, "0")}`,
      date: `${year}-${month}-${day}`,
      type: index % 3 === 0 ? "buy_vwce" : index % 3 === 1 ? "cash_in" : "fee",
      amount: 25 + index,
      notes: index % 997 === 0 ? "benchmark marker" : `benchmark row ${index}`,
      createdAt: `2026-01-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
      updatedAt: `2026-01-01T00:00:${String((index * 7) % 60).padStart(2, "0")}.000Z`,
      source: "manual",
    };
  });
}

export function measureLedgerWindow(
  transactions: Transaction[],
  filters: TransactionListFilters = LEDGER_BENCHMARK_SCENARIOS[0].filters,
): LedgerBenchmarkReport {
  const initialStart = performance.now();
  const initial = buildTransactionListWindow(transactions, filters, TRANSACTION_WINDOW_SIZE);
  const initialDurationMs = performance.now() - initialStart;

  const expandedStart = performance.now();
  const expanded = buildTransactionListWindow(transactions, filters, TRANSACTION_WINDOW_SIZE * 2);
  const expandedDurationMs = performance.now() - expandedStart;
  const expandedIds = expanded.groups.flatMap((group) => group.transactions.map((transaction) => transaction.id));
  const initialIds = new Set(initial.groups.flatMap((group) => group.transactions.map((transaction) => transaction.id)));

  return {
    transactionCount: transactions.length,
    filteredCount: initial.total,
    initialVisible: initial.visible,
    expandedVisible: expanded.visible,
    initialGroupCount: initial.groups.length,
    expandedGroupCount: expanded.groups.length,
    initialDurationMs,
    expandedDurationMs,
    uniqueExpandedRows: new Set(expandedIds).size === expandedIds.length,
    expandedRowsWithinFilteredSet: [...initialIds].every((id) => expandedIds.includes(id)),
  };
}
