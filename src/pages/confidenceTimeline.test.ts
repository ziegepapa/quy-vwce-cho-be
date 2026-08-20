import { describe, expect, it } from "vitest";
import { buildConfidenceTimeline } from "./confidenceTimeline";

const base = { quotes: [], transactions: [], depotStatements: [], syncStatus: "synced" as const, pending: 0 };

describe("buildConfidenceTimeline", () => {
  it("sorts only valid dated events descending and keeps the sync state separate from history", () => {
    const result = buildConfidenceTimeline({
      ...base,
      syncStatus: "syncing",
      pending: 2,
      quotes: [{ id: "q1", updatedAt: "2026-08-18T10:00:00.000Z" }],
      transactions: [
        { id: "t1", createdAt: "2026-08-19T09:00:00.000Z", updatedAt: "2026-08-19T09:00:00.000Z" },
        { id: "t2", createdAt: "2026-08-10T09:00:00.000Z", updatedAt: "2026-08-20T09:00:00.000Z" },
      ],
      depotStatements: [{ id: "s1", createdAt: "2026-08-17T09:00:00.000Z" }],
    });
    expect(result.events.map((event) => event.kind)).toEqual(["transaction_updated", "transaction_created", "quote", "import"]);
    expect(result.totalEvents).toBe(4);
    expect(result.sync).toEqual({ status: "syncing", pending: 2 });
  });

  it("labels broker sourced transactions as import and excludes deleted or invalid-dated rows", () => {
    const result = buildConfidenceTimeline({
      ...base,
      transactions: [
        { id: "imported", source: "trade_republic_pdf", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
        { id: "deleted", createdAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z", deletedAt: "2026-08-03" },
        { id: "broken", createdAt: "bad", updatedAt: "also bad" },
      ],
      quotes: [{ id: "badquote", updatedAt: "" }],
    });
    expect(result.events).toEqual([{ id: "transaction:imported", kind: "import", at: "2026-08-01T00:00:00.000Z", source: "import" }]);
    expect(result.totalEvents).toBe(1);
  });

  it("applies time/source filters before sorting and windowing without changing sync state", () => {
    const result = buildConfidenceTimeline({
      ...base,
      now: new Date("2026-08-20T12:00:00.000Z"),
      lens: "30d",
      sources: ["ledger"],
      limit: 1,
      syncStatus: "conflict",
      pending: 3,
      quotes: [{ id: "quote-recent", updatedAt: "2026-08-19T00:00:00.000Z" }],
      transactions: [
        { id: "ledger-old", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
        { id: "ledger-older-recent", createdAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" },
        { id: "ledger-newer-recent", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z" },
      ],
      depotStatements: [{ id: "statement", createdAt: "2026-08-15T00:00:00.000Z" }],
    });
    expect(result.totalEvents).toBe(2);
    expect(result.events.map((event) => event.id)).toEqual(["transaction:ledger-newer-recent"]);
    expect(result.sync).toEqual({ status: "conflict", pending: 3 });
  });

  it("enforces a 30-item default window while retaining the filtered total for progressive loading", () => {
    const transactions = Array.from({ length: 45 }, (_, index) => ({ id: String(index), createdAt: `2026-08-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`, updatedAt: `2026-08-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z` }));
    const result = buildConfidenceTimeline({ ...base, transactions });
    expect(result.events).toHaveLength(30);
    expect(result.totalEvents).toBe(45);
    expect(new Set(result.events.map((event) => event.id)).size).toBe(30);
  });

  it("returns an empty view for an empty source selection without inventing timeline events", () => {
    const result = buildConfidenceTimeline({
      ...base,
      sources: [],
      quotes: [{ id: "q1", updatedAt: "2026-08-18T10:00:00.000Z" }],
      transactions: [{ id: "t1", createdAt: "2026-08-19T09:00:00.000Z", updatedAt: "2026-08-19T09:00:00.000Z" }],
    });
    expect(result.events).toEqual([]);
    expect(result.totalEvents).toBe(0);
  });
});
