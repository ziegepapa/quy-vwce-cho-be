import type { TxType } from "../lib/types";
import type { TransactionActivity, TransactionSort, TransactionTimeLens } from "./transactionsListWindow";

export const TRANSACTION_SAVED_VIEWS_KEY = "vwce-vault:transactions:saved-views:v1";
export const MAX_SAVED_TRANSACTION_VIEWS = 6;
export const MAX_SAVED_TRANSACTION_VIEW_NAME_LENGTH = 28;

export type TransactionViewFilters = {
  query: string;
  year: string;
  type: "all" | TxType;
  activity: TransactionActivity;
  timeLens: TransactionTimeLens;
  sort: TransactionSort;
};

export type SavedTransactionView = {
  id: string;
  name: string;
  createdAt: string;
  filters: TransactionViewFilters;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const types = new Set<string>([
  "all", "buy_vwce", "sell_vwce", "buy_security", "sell_security", "cash_in", "cash_out", "tax", "fee", "safe_interest", "adjust",
]);
const activities = new Set<string>(["all", "trade", "funding", "outflow"]);
const lenses = new Set<string>(["all", "this_month", "last_90_days", "this_year", "last_year"]);
const sorts = new Set<string>(["newest", "oldest", "amount_desc"]);

function isView(value: unknown): value is SavedTransactionView {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedTransactionView>;
  const filters = candidate.filters as Partial<TransactionViewFilters> | undefined;
  if (
    typeof candidate.id !== "string"
    || candidate.id.length === 0
    || typeof candidate.name !== "string"
    || candidate.name.trim().length === 0
    || candidate.name.trim().length > MAX_SAVED_TRANSACTION_VIEW_NAME_LENGTH
    || typeof candidate.createdAt !== "string"
    || !filters
  ) return false;
  return typeof filters.query === "string"
    && typeof filters.year === "string"
    && types.has(String(filters.type))
    && activities.has(String(filters.activity))
    && lenses.has(String(filters.timeLens))
    && sorts.has(String(filters.sort));
}

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Local-only UI preference. Invalid storage is safely ignored, never migrated into the ledger. */
export function readTransactionSavedViews(storage: StorageLike | null = browserStorage()): SavedTransactionView[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(TRANSACTION_SAVED_VIEWS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter(isView)
      .filter((view) => {
        if (seen.has(view.id)) return false;
        seen.add(view.id);
        return true;
      })
      .slice(0, MAX_SAVED_TRANSACTION_VIEWS)
      .map((view) => ({ ...view, name: view.name.trim(), filters: { ...view.filters } }));
  } catch {
    return [];
  }
}

export function writeTransactionSavedViews(
  views: readonly SavedTransactionView[],
  storage: StorageLike | null = browserStorage(),
): boolean {
  if (!storage) return false;
  const safe = views.filter(isView).slice(0, MAX_SAVED_TRANSACTION_VIEWS);
  try {
    storage.setItem(TRANSACTION_SAVED_VIEWS_KEY, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}

export function sameTransactionViewFilters(a: TransactionViewFilters, b: TransactionViewFilters) {
  return a.query === b.query
    && a.year === b.year
    && a.type === b.type
    && a.activity === b.activity
    && a.timeLens === b.timeLens
    && a.sort === b.sort;
}
