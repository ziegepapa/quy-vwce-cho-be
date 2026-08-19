import type { Transaction, TxType } from "../lib/types";
import { resolveInstrumentIsin } from "../lib/instrument";

export const TRANSACTION_WINDOW_SIZE = 60;

export type TransactionListFilters = {
  query: string;
  year: string;
  type: "all" | TxType;
};

export type TransactionMonthGroup = {
  key: string;
  transactions: Transaction[];
};

export type TransactionListWindow = {
  total: number;
  visible: number;
  remaining: number;
  hasMore: boolean;
  groups: TransactionMonthGroup[];
};

function monthKey(date: string) {
  return date.slice(0, 7);
}

function compareTransactions(a: Transaction, b: Transaction) {
  const date = b.date.localeCompare(a.date);
  if (date !== 0) return date;
  const updated = (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  if (updated !== 0) return updated;
  return b.id.localeCompare(a.id);
}

/**
 * Display-only list window. It never mutates transactions or changes portfolio
 * analytics; this keeps scrolling/paging independent from financial rules.
 */
export function buildTransactionListWindow(
  transactions: readonly Transaction[],
  filters: TransactionListFilters,
  visibleLimit: number,
): TransactionListWindow {
  const query = filters.query.trim().toLocaleLowerCase();
  const filtered = transactions
    .filter((tx) => {
      if (filters.year !== "all" && !tx.date.startsWith(filters.year)) return false;
      if (filters.type !== "all" && tx.type !== filters.type) return false;
      if (!query) return true;
      const searchable = `${tx.notes} ${tx.type} ${tx.amount} ${resolveInstrumentIsin(tx)}`.toLocaleLowerCase();
      return searchable.includes(query);
    })
    .sort(compareTransactions);

  const total = filtered.length;
  const visible = Math.min(Math.max(0, visibleLimit), total);
  const map = new Map<string, Transaction[]>();
  for (const tx of filtered.slice(0, visible)) {
    const key = monthKey(tx.date);
    const rows = map.get(key) ?? [];
    rows.push(tx);
    map.set(key, rows);
  }

  return {
    total,
    visible,
    remaining: total - visible,
    hasMore: visible < total,
    groups: [...map.entries()].map(([key, rows]) => ({ key, transactions: rows })),
  };
}
