import { BACKUP_SCHEMA_VERSION } from "./types";

/**
 * Backup schema accepted by Settings UI and importBackup.
 * - 1: legacy (pre multi-asset)
 * - 2: instruments + effective quotes
 * - 3: candidates + preferences authoritative; quotes diagnostic only
 *
 * Dexie DB version is independent (DEXIE_DB_VERSION = 4).
 */
export function isSupportedBackupSchema(version: unknown): version is number {
  if (typeof version !== "number" || !Number.isFinite(version)) return false;
  if (!Number.isInteger(version)) return false;
  return version === 1 || version === 2 || version === BACKUP_SCHEMA_VERSION;
}
