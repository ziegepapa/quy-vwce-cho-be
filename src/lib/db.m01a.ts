import Dexie, { type Table } from "dexie";
import type {
  AppMetadataRow, AppSettings, Instrument, Quote, QuoteCandidate,
  QuoteSelectionPreference, Transaction, AnnualChecklist, Goal, MonthlySnapshot,
} from "./types";
import type { ConflictRecord, OutboxItem, SyncMeta } from "./sync/types";

export class VwceDB extends Dexie {
  settings!: Table<AppSettings, string>;
  goals!: Table<Goal, string>;
  transactions!: Table<Transaction, string>;
  annualChecklists!: Table<AnnualChecklist, string>;
  monthlySnapshots!: Table<MonthlySnapshot, string>;
  appMetadata!: Table<AppMetadataRow, string>;
  outbox!: Table<OutboxItem, string>;
  conflicts!: Table<ConflictRecord, string>;
  syncMeta!: Table<SyncMeta, string>;
  instruments!: Table<Instrument, string>;
  quotes!: Table<Quote, string>;
  quoteCandidates!: Table<QuoteCandidate, string>;
  quotePreferences!: Table<QuoteSelectionPreference, string>;

  constructor() {
    super("quy_vwce_cho_be");
    this.version(1).stores({
      settings: "id",
      goals: "id, dueDate",
      transactions: "id, date, type",
      annualChecklists: "id, year",
      monthlySnapshots: "id, year, month",
      appMetadata: "id",
    });
    this.version(2).stores({
      settings: "id",
      goals: "id, dueDate",
      transactions: "id, date, type",
      annualChecklists: "id, year",
      monthlySnapshots: "id, year, month",
      appMetadata: "id",
      outbox: "id, table, entityId, createdAt",
      conflicts: "id, table, entityId",
      syncMeta: "id, userId",
    });
    this.version(3).stores({
      settings: "id",
      goals: "id, dueDate",
      transactions: "id, date, type, instrumentIsin",
      annualChecklists: "id, year",
      monthlySnapshots: "id, year, month",
      appMetadata: "id",
      outbox: "id, table, entityId, createdAt",
      conflicts: "id, table, entityId",
      syncMeta: "id, userId",
      instruments: "isin, ticker",
      quotes: "id, instrumentIsin, currency",
    });
    this.version(4).stores({
      settings: "id",
      goals: "id, dueDate",
      transactions: "id, date, type, instrumentIsin",
      annualChecklists: "id, year",
      monthlySnapshots: "id, year, month",
      appMetadata: "id",
      outbox: "id, table, entityId, createdAt",
      conflicts: "id, table, entityId",
      syncMeta: "id, userId",
      instruments: "isin, ticker",
      quotes: "id, instrumentIsin, currency",
      quoteCandidates: "id, instrumentIsin, [instrumentIsin+currency], source",
      quotePreferences: "id, instrumentIsin, [instrumentIsin+currency]",
    });
  }
}

export const db = new VwceDB();
