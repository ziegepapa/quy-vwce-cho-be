import { SCHEMA_VERSION } from "./types";

/**
 * Backup schema accepted by Settings UI and importBackup.
 * - 1: legacy (pre multi-asset)
 * - SCHEMA_VERSION (2): instruments + quotes
 */
export function isSupportedBackupSchema(version: unknown): version is number {
  if (typeof version !== "number" || !Number.isFinite(version)) return false;
  if (!Number.isInteger(version)) return false;
  return version === 1 || version === SCHEMA_VERSION;
}
