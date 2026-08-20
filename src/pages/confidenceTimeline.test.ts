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
  });

  it("enforces a bounded timeline window", () => {
    const transactions = Array.from({ length: 20 }, (_, index) => ({ id: String(index), createdAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, updatedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z` }));
    const result = buildConfidenceTimeline({ ...base, transactions, limit: 4 });
    expect(result.events).toHaveLength(4);
    expect(result.events[0]?.id).toBe("transaction:19");
  });
});
