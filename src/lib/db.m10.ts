import type { AnnualChecklist } from "./types";
import { defaultChecklist } from "./defaults";
import { db } from "./db.m01a";

function isLive<T extends { deletedAt?: string }>(row: T): boolean {
  return !row.deletedAt;
}

export async function clearAllData(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.settings,
      db.goals,
      db.transactions,
      db.annualChecklists,
      db.monthlySnapshots,
      db.appMetadata,
      db.outbox,
      db.conflicts,
      db.syncMeta,
      db.instruments,
      db.quotes,
      db.quoteCandidates,
      db.quotePreferences,
    ],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.goals.clear(),
        db.transactions.clear(),
        db.annualChecklists.clear(),
        db.monthlySnapshots.clear(),
        db.appMetadata.clear(),
        db.outbox.clear(),
        db.conflicts.clear(),
        db.syncMeta.clear(),
        db.instruments.clear(),
        db.quotes.clear(),
        db.quoteCandidates.clear(),
        db.quotePreferences.clear(),
      ]);
    },
  );
}

export async function clearUserBusinessData(): Promise<void> {
  await clearAllData();
}

export async function getOrCreateChecklist(year: number): Promise<AnnualChecklist> {
  const id = `checklist_${year}`;
  const existing = await db.annualChecklists.get(id);
  if (existing) return existing;
  const row = defaultChecklist(year);
  await db.annualChecklists.put(row);
  return row;
}

export async function countLocalData(): Promise<{
  settings: number;
  goals: number;
  transactions: number;
  annualChecklists: number;
  monthlySnapshots: number;
  quotes: number;
}> {
  const [settingsAll, goalsAll, transactionsAll, annualChecklists, monthlySnapshots, quotes] = await Promise.all([
    db.settings.toArray(),
    db.goals.toArray(),
    db.transactions.toArray(),
    db.annualChecklists.count(),
    db.monthlySnapshots.count(),
    db.quotes.count(),
  ]);
  const settings = settingsAll.length;
  const goals = goalsAll.filter(isLive).length;
  const transactions = transactionsAll.filter(isLive).length;
  return { settings, goals, transactions, annualChecklists, monthlySnapshots, quotes };
}
