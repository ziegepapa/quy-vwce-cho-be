/**
 * PR 2B.1 foundation public surface.
 * Implementation modules: db.core (Dexie v4 + migration), db.quotesApi (dual-write),
 * db.crud (settings/goals/tx), db.backup (v3 authority).
 */
export {
  VwceDB,
  db,
  migrateTransactionIsin,
  ensureMultiAssetMigrated,
  runPendingMigrations,
  isQuoteMigrationComplete,
  assertQuoteWritesUnlocked,
  ensureQuoteFoundationMigrated,
  listInstruments,
  upsertInstrument,
} from "./db.core";

export {
  listQuotes,
  upsertQuote,
  getQuoteForIsin,
  saveManualQuoteForIsin,
  setQuotePreference,
  putAutoCandidateAndResolve,
} from "./db.quotesApi";
export type { ManualQuoteInput, ManualQuoteSaveResult } from "./db.quotesApi";

export {
  ensureInitialized,
  getSettings,
  saveSettings,
  listGoals,
  listTransactions,
  findTransactionByExternalRef,
  upsertTransaction,
  deleteTransaction,
  upsertGoal,
  deleteGoal,
} from "./db.crud";

export {
  exportBackup,
  importBackup,
  clearAllData,
  clearUserBusinessData,
  getOrCreateChecklist,
  countLocalData,
} from "./db.backup";

export { uid } from "./defaults";
