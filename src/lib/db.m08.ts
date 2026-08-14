import type { AppSettings, BackupPayload } from "./types";
import { BACKUP_SCHEMA_VERSION } from "./types";
import { nowIso } from "./defaults";
import { db } from "./db.m01a";

function isLive<T extends { deletedAt?: string }>(row: T): boolean {
  return !row.deletedAt;
}

/** Nested depotStatements carry deletedAt; settings row itself does not. */
function sanitizeSettingsDepotTombstones(settings: AppSettings[]): AppSettings[] {
  return settings.map((row) => {
    if (!row.depotStatements?.length) return row;
    return {
      ...row,
      depotStatements: row.depotStatements.filter(isLive),
    };
  });
}

export async function exportBackup(): Promise<BackupPayload> {
  const [settingsAll, goalsAll, transactionsAll, annualChecklists, monthlySnapshots, instruments, quotes, quoteCandidates, quotePreferences] =
    await Promise.all([
      db.settings.toArray(),
      db.goals.toArray(),
      db.transactions.toArray(),
      db.annualChecklists.toArray(),
      db.monthlySnapshots.toArray(),
      db.instruments.toArray(),
      db.quotes.toArray(),
      db.quoteCandidates.toArray(),
      db.quotePreferences.toArray(),
    ]);

  // Settings has no top-level soft-delete; nested depotStatements do -- strip tombstones.
  const settings = sanitizeSettingsDepotTombstones(settingsAll);
  const goals = goalsAll.filter(isLive);
  const transactions = transactionsAll.filter(isLive);
  // DELETE-TOMBSTONE-BACKUP-001-b (v4): carry tombstones so an import can
  // restore the deletion intent and re-enqueue the server-side delete.
  const deletedGoals = goalsAll.filter((g) => !isLive(g));
  const deletedTransactions = transactionsAll.filter((t) => !isLive(t));
  const exportedAt = nowIso();
  const payload: BackupPayload = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    settings,
    goals,
    transactions,
    annualChecklists,
    monthlySnapshots,
    instruments,
    quotes,
    quoteCandidates,
    quotePreferences,
    deletedGoals,
    deletedTransactions,
  };

  const meta = await db.appMetadata.get("meta");
  await db.appMetadata.put({
    id: "meta",
    schemaVersion: BACKUP_SCHEMA_VERSION,
    lastBackupAt: exportedAt,
    createdAt: meta?.createdAt ?? exportedAt,
    updatedAt: exportedAt,
  });

  return payload;
}
