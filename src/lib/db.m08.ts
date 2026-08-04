import type { BackupPayload } from "./types";
import { BACKUP_SCHEMA_VERSION } from "./types";
import { nowIso } from "./defaults";
import { db } from "./db.m01a";

function isLive<T extends { deletedAt?: string }>(row: T): boolean {
  return !row.deletedAt;
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

  // settings has no soft-delete field — export as-is
  const settings = settingsAll;
  const goals = goalsAll.filter(isLive);
  const transactions = transactionsAll.filter(isLive);
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
