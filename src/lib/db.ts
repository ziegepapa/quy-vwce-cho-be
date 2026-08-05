/** Public data surface. */
export {
  VwceDB, db, migrateTransactionIsin, ensureMultiAssetMigrated,
  runPendingMigrations, isQuoteMigrationComplete, assertQuoteWritesUnlocked,
  QUOTE_MIGRATION_META_ID, coerceQuoteSource, validateQuoteRowForMigration,
} from "./db.m01";
export { ensureQuoteFoundationMigrated } from "./db.m02";
export { applyResolvedEffective, listInstruments, upsertInstrument } from "./db.m03";
export { listQuotes, upsertQuote, getQuoteForIsin } from "./db.m04";
export type { ManualQuoteInput, ManualQuoteSaveResult } from "./db.m05";
export { saveManualQuoteForIsin } from "./db.m05";
export {
  setQuotePreference,
  putAutoCandidateAndResolve,
  isSameAutoQuoteSemantics,
} from "./db.m06";
export {
  ensureInitialized, getSettings, saveSettings, listGoals, listTransactions,
  findTransactionByExternalRef, upsertTransaction, deleteTransaction,
  upsertGoal, deleteGoal,
} from "./db.m07";
export {
  listDepotStatements,
  findDepotStatementByStatementId,
  saveDepotStatement,
  deleteDepotStatement,
} from "./depotStatements";
export { exportBackup } from "./db.m08";
export { importBackup } from "./db.m09";
export {
  clearAllData, clearUserBusinessData, getOrCreateChecklist, countLocalData,
} from "./db.m10";
export { uid } from "./defaults";
export {
  defaultQuoteFeedUrl,
  ingestQuotesFeed,
  validateQuoteFeed,
} from "./quoteFeed";
export type {
  IngestQuotesFeedOptions,
  QuoteFeedIngestResult,
  QuoteFeedIngestStatus,
  QuoteFeedRowIssue,
  QuoteFeedValidationResult,
} from "./quoteFeed";
export {
  candidateStatusLabel,
  listQuoteSelectionStates,
} from "./quoteStatus";
export type { QuoteSelectionState } from "./quoteStatus";
