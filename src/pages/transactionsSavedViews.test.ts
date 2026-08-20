import { describe, expect, it } from "vitest";
import {
  MAX_SAVED_TRANSACTION_VIEWS,
  readTransactionSavedViews,
  sameTransactionViewFilters,
  TRANSACTION_SAVED_VIEWS_KEY,
  writeTransactionSavedViews,
  type SavedTransactionView,
} from "./transactionsSavedViews";

function view(id: string, name = id): SavedTransactionView {
  return {
    id,
    name,
    createdAt: "2026-08-20T00:00:00.000Z",
    filters: { query: "VWCE", year: "2026", type: "buy_vwce", activity: "trade", timeLens: "this_year", sort: "newest" },
  };
}

describe("transactionsSavedViews", () => {
  it("writes and reads a bounded local-only view list without sharing object references", () => {
    const storage = new Map<string, string>();
    const local = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) };
    const views = Array.from({ length: MAX_SAVED_TRANSACTION_VIEWS + 2 }, (_, index) => view(`view-${index}`));

    expect(writeTransactionSavedViews(views, local)).toBe(true);
    const loaded = readTransactionSavedViews(local);

    expect(loaded).toHaveLength(MAX_SAVED_TRANSACTION_VIEWS);
    expect(loaded[0].id).toBe("view-0");
    loaded[0].filters.query = "changed only in memory";
    expect(readTransactionSavedViews(local)[0].filters.query).toBe("VWCE");
  });

  it("ignores malformed stored payloads and compares every filter dimension", () => {
    const storage = new Map<string, string>([[TRANSACTION_SAVED_VIEWS_KEY, JSON.stringify([
      view("valid"),
      { id: "broken", name: "Broken", createdAt: "now", filters: { activity: "unknown" } },
      view("valid", "Duplicate id"),
    ])]]);
    const local = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) };
    const loaded = readTransactionSavedViews(local);

    expect(loaded.map((entry) => entry.id)).toEqual(["valid"]);
    expect(sameTransactionViewFilters(loaded[0].filters, { ...loaded[0].filters })).toBe(true);
    expect(sameTransactionViewFilters(loaded[0].filters, { ...loaded[0].filters, sort: "amount_desc" })).toBe(false);
  });
});
