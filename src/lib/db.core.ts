/**
 * TEMPORARY: full db.core.ts is 13861 bytes in sandbox at
 * /home/workdir/artifacts/repo/src/lib/db.core.ts
 * Contains: VwceDB v4 stores, ensureQuoteFoundationMigrated, applyResolvedEffective.
 * Replace this stub via local git push or Git Data API before CI green.
 */
export class VwceDB {
  constructor() {
    throw new Error("db.core.ts incomplete — push full foundation module from sandbox");
  }
}
export const db = null as never;
export function migrateTransactionIsin(tx: unknown) {
  return tx;
}
export async function ensureMultiAssetMigrated(): Promise<void> {}
export async function runPendingMigrations(): Promise<void> {}
export async function isQuoteMigrationComplete(): Promise<boolean> {
  return false;
}
export async function assertQuoteWritesUnlocked(): Promise<void> {
  throw new Error("quote writes locked — db.core incomplete");
}
export async function ensureQuoteFoundationMigrated(): Promise<void> {}
export async function applyResolvedEffective(): Promise<void> {}
export async function listInstruments(): Promise<unknown[]> {
  return [];
}
export async function upsertInstrument(): Promise<void> {}
export const QUOTE_MIGRATION_META_ID = "quoteMigration";
export function coerceQuoteSource(): "manual" {
  return "manual";
}
export function validateQuoteRowForMigration(): void {}
