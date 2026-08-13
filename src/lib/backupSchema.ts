import type { BackupPayload } from "./types";
import { BACKUP_SCHEMA_VERSION } from "./types";
import { validateTransactionNumbers } from "./transactionValidation";

const REQUIRED_ARRAY_FIELDS = [
  "settings",
  "goals",
  "transactions",
  "annualChecklists",
  "monthlySnapshots",
] as const;

const OPTIONAL_ARRAY_FIELDS = [
  "instruments",
  "quotes",
  "quoteCandidates",
  "quotePreferences",
] as const;

export type BackupPayloadValidation =
  | { ok: true; payload: BackupPayload }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

/**
 * Runtime guard used before the destructive clear-and-restore transaction.
 * TypeScript types cannot protect files loaded from disk, so required arrays
 * must be present at runtime before any local table is cleared.
 */
export function validateBackupPayload(value: unknown): BackupPayloadValidation {
  if (!isRecord(value)) {
    return { ok: false, error: "Cấu trúc backup không hợp lệ" };
  }

  if (!isSupportedBackupSchema(value.schemaVersion)) {
    return {
      ok: false,
      error: `schemaVersion không khớp (file: ${String(value.schemaVersion)}; hỗ trợ: 1, 2 hoặc ${BACKUP_SCHEMA_VERSION})`,
    };
  }

  if (
    typeof value.exportedAt !== "string" ||
    !value.exportedAt.trim() ||
    Number.isNaN(Date.parse(value.exportedAt))
  ) {
    return { ok: false, error: "Backup thiếu hoặc sai trường bắt buộc: exportedAt" };
  }

  const invalidRequired = REQUIRED_ARRAY_FIELDS.filter(
    (field) => !Array.isArray(value[field]),
  );
  if (invalidRequired.length > 0) {
    return {
      ok: false,
      error: `Backup thiếu hoặc sai trường bắt buộc: ${invalidRequired.join(", ")}`,
    };
  }

  const invalidOptional = OPTIONAL_ARRAY_FIELDS.filter(
    (field) => value[field] !== undefined && !Array.isArray(value[field]),
  );
  if (invalidOptional.length > 0) {
    return {
      ok: false,
      error: `Backup có trường không hợp lệ: ${invalidOptional.join(", ")}`,
    };
  }

  for (const [index, transaction] of (value.transactions as unknown[]).entries()) {
    const validation = validateTransactionNumbers(transaction);
    if (!validation.ok) {
      return {
        ok: false,
        error: `Backup transactions[${index}] không hợp lệ: ${validation.error}`,
      };
    }
  }

  return { ok: true, payload: value as unknown as BackupPayload };
}
