import type { SyncStatus } from "../lib/sync/types";

export type ConfidenceEventKind = "quote" | "transaction_created" | "transaction_updated" | "import";
export type ConfidenceTimelineSource = "quote" | "ledger" | "import";
export type ConfidenceTimelineLens = "all" | "30d" | "90d" | "thisYear";
export type ConfidenceTimelineEvent = { id: string; kind: ConfidenceEventKind; at: string; source: ConfidenceTimelineSource };

function timestamp(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function startForLens(lens: ConfidenceTimelineLens, now: Date): number | null {
  const nowTimestamp = now.getTime();
  if (!Number.isFinite(nowTimestamp)) return null;
  if (lens === "30d") return nowTimestamp - 30 * 86_400_000;
  if (lens === "90d") return nowTimestamp - 90 * 86_400_000;
  if (lens === "thisYear") return new Date(now.getFullYear(), 0, 1).getTime();
  return null;
}

/**
 * Read-only metadata feed. It never fabricates times: rows with invalid
 * timestamps are omitted and sync is exposed as a present state, not history.
 * Filters are applied before sorting/windowing and never mutate source records.
 */
export function buildConfidenceTimeline(input: {
  quotes: readonly { id: string; updatedAt: string }[];
  transactions: readonly { id: string; createdAt: string; updatedAt: string; source?: "manual" | "trade_republic_pdf"; deletedAt?: string }[];
  depotStatements: readonly { id: string; createdAt: string; deletedAt?: string }[];
  syncStatus: SyncStatus;
  pending: number;
  limit?: number;
  lens?: ConfidenceTimelineLens;
  sources?: readonly ConfidenceTimelineSource[];
  now?: Date;
}): { events: ConfidenceTimelineEvent[]; totalEvents: number; sync: { status: SyncStatus; pending: number } } {
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

  const lens = input.lens ?? "all";
  const sourceSet = new Set(input.sources ?? ["quote", "ledger", "import"]);
  const start = startForLens(lens, input.now ?? new Date());
  const filtered = events.filter((event) => sourceSet.has(event.source) && (start == null || timestamp(event.at)! >= start));
  filtered.sort((a, b) => timestamp(b.at)! - timestamp(a.at)! || a.id.localeCompare(b.id));
  const limit = Math.max(1, Math.min(30, input.limit ?? 30));

  return {
    events: filtered.slice(0, limit),
    totalEvents: filtered.length,
    sync: { status: input.syncStatus, pending: Math.max(0, input.pending) },
  };
}
