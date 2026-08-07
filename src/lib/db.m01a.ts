import Dexie, { type Table } from "dexie";
import type {
  AppMetadata, AppMetadataRow, AppSettings, Instrument, Quote, QuoteCandidate,
  QuoteSelectionPreference, Transaction, AnnualChecklist, Goal, MonthlySnapshot,
} from "./types";
import type { ConflictRecord, OutboxItem, SyncMeta } from "./sync/types";

export class VwceDB extends Dexie {
  settings!: Table<AppSettings, string>;
  goals!: Table<Goal, string>;
  transactions!: Table<Transaction, string>;
  annualChecklists!: Table<AnnualChecklist, string>;
  monthlySnapshots!: Table<MonthlySnapshot, string>;
  /**
   * Handle for the bookkeeping row with id "meta". Every caller of this handle
   * reads or writes that row, which is why it stays narrowly typed.
   */
  appMetadata!: Table<AppMetadata, string>;
  /**
   * The same physical store, typed for every row kind it really holds. Use this
   * handle for the quoteMigration row instead of casting it to AppMetadata.
   */
  appMetadataRows!: Table<AppMetadataRow, string>;
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

    // No new store and no schema change: Dexie returns the cached Table instance
    // for a store name, so this is a second type view of appMetadata rather than
    // a second table. The IndexedDB version stays 4.
    this.appMetadataRows = this.table<AppMetadataRow, string>("appMetadata");
  }
}

export const db = new VwceDB();
