import type { SyncStatus } from "../lib/sync/types";
import type { Quote, Transaction, DepotStatement } from "../lib/types";

export type ConfidenceEventKind = "quote" | "transaction_created" | "transaction_updated" | "import";
export type ConfidenceTimelineSource = "quote" | "ledger" | "import";
export type ConfidenceTimelineLens = "all" | "30d" | "90d" | "thisYear";
export type ConfidenceTimelineEvent = {
  id: string;
  kind: ConfidenceEventKind;
  at: string;
  source: ConfidenceTimelineSource;
  /** Price facts are the session/value from the stored quote, not the local write timestamp. */
  quote?: Pick<Quote, "instrumentIsin" | "currency" | "price" | "asOf" | "fetchedAt" | "source" | "venue">;
  /** Sensitive notes are available to the local UI only when the owner expands the event. */
  transaction?: Pick<Transaction, "type" | "amount" | "date" | "notes" | "instrumentIsin" | "quantity" | "unitPrice" | "fee" | "tax">;
  /** A depot statement is a dated snapshot; account references and contact details are deliberately excluded. */
  statement?: { date: string; broker: string; positionsCount: number };
};

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
  quotes: readonly (Pick<Quote, "id" | "updatedAt"> & Partial<Omit<Quote, "id" | "updatedAt">>)[];
  transactions: readonly (Pick<Transaction, "id" | "createdAt" | "updatedAt"> & Partial<Omit<Transaction, "id" | "createdAt" | "updatedAt">>)[];
  depotStatements: readonly (Pick<DepotStatement, "id" | "createdAt"> & Partial<Omit<DepotStatement, "id" | "createdAt">>)[];
  syncStatus: SyncStatus;
  pending: number;
  limit?: number;
  lens?: ConfidenceTimelineLens;
  sources?: readonly ConfidenceTimelineSource[];
  now?: Date;
}): { events: ConfidenceTimelineEvent[]; totalEvents: number; sync: { status: SyncStatus; pending: number } } {
  const events: ConfidenceTimelineEvent[] = [];
  for (const quote of input.quotes ?? []) {
    if (timestamp(quote.updatedAt) == null) continue;
    const quoteDetail = quote.instrumentIsin && quote.currency && typeof quote.price === "number" && quote.asOf
      ? {
          instrumentIsin: quote.instrumentIsin,
          currency: quote.currency,
          price: quote.price,
          asOf: quote.asOf,
          fetchedAt: quote.fetchedAt,
          source: quote.source,
          venue: quote.venue,
        }
      : undefined;
    events.push({
      id: `quote:${quote.id}`,
      kind: "quote",
      at: quote.updatedAt,
      source: "quote",
      ...(quoteDetail ? { quote: quoteDetail } : {}),
    });
  }
  for (const tx of input.transactions ?? []) {
    if (tx.deletedAt || timestamp(tx.updatedAt) == null) continue;
    const createdAt = timestamp(tx.createdAt);
    const kind: ConfidenceEventKind = tx.source === "trade_republic_pdf"
      ? "import"
      : createdAt != null && createdAt === timestamp(tx.updatedAt)
        ? "transaction_created"
        : "transaction_updated";
    const transactionDetail = typeof tx.type === "string" && typeof tx.amount === "number" && typeof tx.date === "string"
      ? {
          type: tx.type,
          amount: tx.amount,
          date: tx.date,
          notes: typeof tx.notes === "string" && tx.notes.trim() ? tx.notes : undefined,
          instrumentIsin: tx.instrumentIsin,
          quantity: tx.quantity,
          unitPrice: tx.unitPrice,
          fee: tx.fee,
          tax: tx.tax,
        }
      : undefined;
    events.push({
      id: `transaction:${tx.id}`,
      kind,
      at: tx.updatedAt,
      source: kind === "import" ? "import" : "ledger",
      ...(transactionDetail ? { transaction: transactionDetail } : {}),
    });
  }
  for (const statement of input.depotStatements ?? []) {
    if (statement.deletedAt || timestamp(statement.createdAt) == null) continue;
    const statementDetail = typeof statement.date === "string" && typeof statement.broker === "string"
      ? {
          date: statement.date,
          broker: statement.broker,
          positionsCount: Array.isArray(statement.positions) ? statement.positions.length : 0,
        }
      : undefined;
    events.push({
      id: `statement:${statement.id}`,
      kind: "import",
      at: statement.createdAt,
      source: "import",
      ...(statementDetail ? { statement: statementDetail } : {}),
    });
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
