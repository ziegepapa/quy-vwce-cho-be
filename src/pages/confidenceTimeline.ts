import type { SyncStatus } from "../lib/sync/types";

export type ConfidenceEventKind = "quote" | "transaction_created" | "transaction_updated" | "import";
export type ConfidenceTimelineEvent = { id: string; kind: ConfidenceEventKind; at: string; source: "quote" | "ledger" | "import" };

function timestamp(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Read-only audit feed. It never fabricates times: rows with invalid timestamps
 * are omitted and sync is exposed as a present state, not a historical event.
 */
export function buildConfidenceTimeline(input: {
  quotes: readonly { id: string; updatedAt: string }[];
  transactions: readonly { id: string; createdAt: string; updatedAt: string; source?: "manual" | "trade_republic_pdf"; deletedAt?: string }[];
  depotStatements: readonly { id: string; createdAt: string; deletedAt?: string }[];
  syncStatus: SyncStatus;
  pending: number;
  limit?: number;
}): { events: ConfidenceTimelineEvent[]; sync: { status: SyncStatus; pending: number } } {
  const events: ConfidenceTimelineEvent[] = [];
  for (const quote of input.quotes ?? []) {
    if (timestamp(quote.updatedAt) != null) events.push({ id: `quote:${quote.id}`, kind: "quote", at: quote.updatedAt, source: "quote" });
  }
  for (const tx of input.transactions ?? []) {
    if (tx.deletedAt || timestamp(tx.updatedAt) == null) continue;
    const createdAt = timestamp(tx.createdAt);
    const kind: ConfidenceEventKind = tx.source === "trade_republic_pdf"
      ? "import"
      : createdAt != null && createdAt === timestamp(tx.updatedAt)
        ? "transaction_created"
        : "transaction_updated";
    events.push({ id: `transaction:${tx.id}`, kind, at: tx.updatedAt, source: kind === "import" ? "import" : "ledger" });
  }
  for (const statement of input.depotStatements ?? []) {
    if (!statement.deletedAt && timestamp(statement.createdAt) != null) events.push({ id: `statement:${statement.id}`, kind: "import", at: statement.createdAt, source: "import" });
  }
  const limit = Math.max(1, Math.min(12, input.limit ?? 6));
  events.sort((a, b) => timestamp(b.at)! - timestamp(a.at)! || a.id.localeCompare(b.id));
  return { events: events.slice(0, limit), sync: { status: input.syncStatus, pending: Math.max(0, input.pending) } };
}
