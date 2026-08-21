import type { BackupPayload, BackupPortableDomain } from "./types";
import { BACKUP_PORTABLE_DOMAINS, BACKUP_SCHEMA_VERSION } from "./types";
import { classifyTransaction, validateTransactionNumbers } from "./transactionValidation";

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

const IDENTITY_FIELDS = {
  settings: "id",
  goals: "id",
  transactions: "id",
  annualChecklists: "id",
  monthlySnapshots: "id",
  instruments: "isin",
  quotes: "id",
  quoteCandidates: "id",
  quotePreferences: "id",
  deletedGoals: "id",
  deletedTransactions: "id",
} as const;

export type BackupPayloadValidation =
  | { ok: true; payload: BackupPayload }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataError(message: string): BackupPayloadValidation {
  return { ok: false, error: `Backup metadata không hợp lệ: ${message}` };
}

/**
 * H3 metadata is additive. When present, it is checked before restore clears
 * any table; when absent, backups emitted before H3 remain fully compatible.
 */
function validateCollectionIdentities(value: Record<string, unknown>): BackupPayloadValidation | null {
  for (const [collection, identityField] of Object.entries(IDENTITY_FIELDS)) {
    const rows = value[collection];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) continue; // Required/optional array guards own this message.
    const identities = new Set<string>();
    for (const [index, row] of rows.entries()) {
      if (!isRecord(row) || typeof row[identityField] !== "string" || !row[identityField].trim()) {
        return { ok: false, error: `Backup ${collection}[${index}] thiếu ${identityField}` };
      }
      const identity = row[identityField];
      if (identities.has(identity)) {
        return { ok: false, error: `Backup ${collection}: ${identityField} trùng: ${identity}` };
      }
      identities.add(identity);
    }
  }
  return null;
}

function validateBackupMetadata(value: Record<string, unknown>): BackupPayloadValidation | null {
  const metadata = value.metadata;
  if (metadata === undefined) return null;
  if (!isRecord(metadata)) return metadataError("metadata");
  if (metadata.backupSchemaVersion !== value.schemaVersion) {
    return metadataError("backupSchemaVersion không khớp schemaVersion");
  }
  if (typeof metadata.appReleaseVersion !== "string" || !metadata.appReleaseVersion.trim()) {
    return metadataError("appReleaseVersion");
  }
  if (
    typeof metadata.dexieSchemaVersion !== "number" ||
    !Number.isSafeInteger(metadata.dexieSchemaVersion) ||
    metadata.dexieSchemaVersion < 1
  ) {
    return metadataError("dexieSchemaVersion");
  }
  if (!Array.isArray(metadata.supportedDomains)) return metadataError("supportedDomains");
  const supportedDomains = new Set(metadata.supportedDomains);
  if (
    supportedDomains.size !== BACKUP_PORTABLE_DOMAINS.length ||
    metadata.supportedDomains.length !== BACKUP_PORTABLE_DOMAINS.length ||
    BACKUP_PORTABLE_DOMAINS.some((domain) => !supportedDomains.has(domain))
  ) {
    return metadataError("supportedDomains");
  }
  if (!isRecord(metadata.recordCounts)) return metadataError("recordCounts");
  for (const domain of BACKUP_PORTABLE_DOMAINS) {
    const count = metadata.recordCounts[domain];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      return metadataError(`recordCounts.${domain}`);
    }
    const rows = value[domain as BackupPortableDomain];
    const actual = Array.isArray(rows) ? rows.length : 0;
    if (count !== actual) return metadataError(`recordCounts.${domain} không khớp payload`);
  }
  return null;
}

/**
 * Backup schema accepted by Settings UI and importBackup.
 * - 1: legacy (pre multi-asset)
 * - 2: instruments + effective quotes
 * - 3: candidates + preferences authoritative; quotes diagnostic only
 * - 4: tombstones in deletedGoals / deletedTransactions
 *
 * Dexie DB version is independent (DEXIE_DB_VERSION = 4).
 */
export function isSupportedBackupSchema(version: unknown): version is number {
  if (typeof version !== "number" || !Number.isFinite(version)) return false;
  if (!Number.isInteger(version)) return false;
  // List every supported version explicitly so old files keep loading after
  // BACKUP_SCHEMA_VERSION bumps to the next value.
  return version === 1 || version === 2 || version === 3 || version === BACKUP_SCHEMA_VERSION;
}

/** One canonical user-facing message so the UI cannot omit a supported version. */
export function unsupportedBackupSchemaMessage(version: unknown): string {
  return `schemaVersion kh\u00f4ng kh\u1edbp (file: ${String(version)}; h\u1ed7 tr\u1ee3: 1, 2, 3 ho\u1eb7c ${BACKUP_SCHEMA_VERSION})`;
}

/**
 * Runtime guard used before the destructive clear-and-restore transaction.
 * TypeScript types cannot protect files loaded from disk, so required arrays
 * must be present at runtime before any local table is cleared.
 */
export function validateBackupPayload(value: unknown): BackupPayloadValidation {
  if (!isRecord(value)) {
    return { ok: false, error: "C\u1ea5u tr\u00fac backup kh\u00f4ng h\u1ee3p l\u1ec7" };
  }

  if (!isSupportedBackupSchema(value.schemaVersion)) {
    return {
      ok: false,
      error: unsupportedBackupSchemaMessage(value.schemaVersion),
    };
  }

  if (
    typeof value.exportedAt !== "string" ||
    !value.exportedAt.trim() ||
    Number.isNaN(Date.parse(value.exportedAt))
  ) {
    return { ok: false, error: "Backup thi\u1ebfu ho\u1eb7c sai tr\u01b0\u1eddng b\u1eaft bu\u1ed9c: exportedAt" };
  }

  const invalidRequired = REQUIRED_ARRAY_FIELDS.filter(
    (field) => !Array.isArray(value[field]),
  );
  if (invalidRequired.length > 0) {
    return {
      ok: false,
      error: `Backup thi\u1ebfu ho\u1eb7c sai tr\u01b0\u1eddng b\u1eaft bu\u1ed9c: ${invalidRequired.join(", ")}`,
    };
  }

  const invalidOptional = OPTIONAL_ARRAY_FIELDS.filter(
    (field) => value[field] !== undefined && !Array.isArray(value[field]),
  );
  if (invalidOptional.length > 0) {
    return {
      ok: false,
      error: `Backup c\u00f3 tr\u01b0\u1eddng kh\u00f4ng h\u1ee3p l\u1ec7: ${invalidOptional.join(", ")}`,
    };
  }

  const identityValidation = validateCollectionIdentities(value);
  if (identityValidation) return identityValidation;

  const metadataValidation = validateBackupMetadata(value);
  if (metadataValidation) return metadataValidation;

  for (const [index, transaction] of (value.transactions as unknown[]).entries()) {
    const validation = validateTransactionNumbers(transaction);
    if (!validation.ok) {
      return {
        ok: false,
        error: `Backup transactions[${index}] không hợp lệ: ${validation.error}`,
      };
    }
    // H2-B applies the same pure classifier used by new ingestion/replay. A
    // finite legacy invalid/incomplete result is intentionally not rejected:
    // restore preserves raw evidence and canonical replay quarantines it.
    classifyTransaction(transaction);
  }

  // -------------------------------------------------------------------------
  // v4 tombstone arrays: optional, but if present each entry must carry deletedAt.
  // AN TOAN DU LIEU (DELETE-TOMBSTONE-BACKUP-001-b): do NOT run
  // validateTransactionNumbers on deletedTransactions -- tombstones carry
  // deletion intent only, not live accounting data; their numeric fields were
  // already validated when each row was first written to the database.
  // -------------------------------------------------------------------------
  if (value.deletedGoals !== undefined && !Array.isArray(value.deletedGoals)) {
    return { ok: false, error: "Backup c\u00f3 tr\u01b0\u1eddng kh\u00f4ng h\u1ee3p l\u1ec7: deletedGoals" };
  }
  if (value.deletedTransactions !== undefined && !Array.isArray(value.deletedTransactions)) {
    return { ok: false, error: "Backup c\u00f3 tr\u01b0\u1eddng kh\u00f4ng h\u1ee3p l\u1ec7: deletedTransactions" };
  }
  for (const [index, g] of ((value.deletedGoals as unknown[] | undefined) ?? []).entries()) {
    if (!g || typeof g !== "object" || !((g as { deletedAt?: unknown }).deletedAt)) {
      return { ok: false, error: `Backup deletedGoals[${index}] thi\u1ebfu deletedAt` };
    }
  }
  for (const [index, t] of ((value.deletedTransactions as unknown[] | undefined) ?? []).entries()) {
    if (!t || typeof t !== "object" || !((t as { deletedAt?: unknown }).deletedAt)) {
      return { ok: false, error: `Backup deletedTransactions[${index}] thi\u1ebfu deletedAt` };
    }
  }

  // Fail-closed duplicate-id guard: an id that appears in both the live and
  // the deleted array signals a corrupted or manually edited file.  Check
  // BEFORE any table is cleared so the database is never touched on a bad file.
  const liveGoalIds = new Set(
    (value.goals as Array<{ id: unknown }>).map((g) => g.id),
  );
  for (const g of (value.deletedGoals as Array<{ id: unknown }> | undefined) ?? []) {
    if (liveGoalIds.has(g.id)) {
      return {
        ok: false,
        error: `Backup goals: id tr\u00f9ng gi\u1eefa live v\u00e0 deleted: ${String(g.id)}`,
      };
    }
  }
  const liveTxIds = new Set(
    (value.transactions as Array<{ id: unknown }>).map((t) => t.id),
  );
  for (const t of (value.deletedTransactions as Array<{ id: unknown }> | undefined) ?? []) {
    if (liveTxIds.has(t.id)) {
      return {
        ok: false,
        error: `Backup transactions: id tr\u00f9ng gi\u1eefa live v\u00e0 deleted: ${String(t.id)}`,
      };
    }
  }

  return { ok: true, payload: value as unknown as BackupPayload };
}
