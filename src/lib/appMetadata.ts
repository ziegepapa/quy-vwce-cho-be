import type { AppMetadata, QuoteMigrationMeta, QuoteMigrationState } from "./types";

/**
 * The appMetadata store is not homogeneous: id "meta" holds AppMetadata and id
 * "quoteMigration" holds QuoteMigrationMeta. Naming that union is what lets the
 * migration row be written without an unchecked cast.
 *
 * It is declared here rather than in types.ts on purpose: types.ts holds plain
 * data shapes, while this module owns the knowledge of which row kinds live in
 * that one store, together with the ids and the guards that tell them apart.
 */
export type AppMetadataRow = AppMetadata | QuoteMigrationMeta;

/** Row that carries backup and schema bookkeeping. */
export const APP_META_ID = "meta";

/** Row that carries the state of the quote foundation migration. */
export const QUOTE_MIGRATION_META_ID = "quoteMigration";

const QUOTE_MIGRATION_STATES: readonly string[] = ["pending", "complete", "failed"];

function isRecord(row: unknown): row is Record<string, unknown> {
  return typeof row === "object" && row !== null;
}

export function isQuoteMigrationState(raw: unknown): raw is QuoteMigrationState {
  return typeof raw === "string" && QUOTE_MIGRATION_STATES.includes(raw);
}

/**
 * The row comes back from IndexedDB, so its shape is a claim and not a fact: an
 * older build, a restored backup or a hand-edited store can leave anything under
 * this key. Verify it instead of asserting it with a cast.
 *
 * Fail closed on purpose. Anything this rejects is reported as an absent
 * migration row, which keeps quote writes locked rather than unlocking them on a
 * row that merely happens to carry the word "complete".
 */
export function isQuoteMigrationMeta(row: unknown): row is QuoteMigrationMeta {
  if (!isRecord(row)) return false;
  if (row.id !== QUOTE_MIGRATION_META_ID) return false;
  if (!isQuoteMigrationState(row.state)) return false;
  if (typeof row.updatedAt !== "string" || !row.updatedAt) return false;
  if (row.lastError !== undefined && typeof row.lastError !== "string") return false;
  return true;
}

/** Same contract for the bookkeeping row: every field a caller reads must exist. */
export function isAppMetadata(row: unknown): row is AppMetadata {
  if (!isRecord(row)) return false;
  if (row.id !== APP_META_ID) return false;
  if (typeof row.schemaVersion !== "number" || !Number.isFinite(row.schemaVersion)) return false;
  if (typeof row.lastBackupAt !== "string") return false;
  if (typeof row.createdAt !== "string") return false;
  if (typeof row.updatedAt !== "string") return false;
  return true;
}
