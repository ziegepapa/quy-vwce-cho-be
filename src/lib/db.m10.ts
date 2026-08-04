import type { AnnualChecklist } from "./types";
import { defaultChecklist, nowIso, uid } from "./defaults";
import { db } from "./db.m01a";
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
  goals: number;
  transactions: number;
  quotes: number;
}> {
  const [goals, transactions, quotes] = await Promise.all([
    db.goals.count(),
    db.transactions.count(),
    db.quotes.count(),
  ]);
  return { goals, transactions, quotes };
}
