import Dexie, { type Table } from "dexie";
import type { AnnualChecklist, AppMetadata, AppSettings, BackupPayload, Goal, MonthlySnapshot, Transaction } from "./types";
import { SCHEMA_VERSION } from "./types";
import { defaultChecklist, defaultGoals, defaultSettings, nowIso, uid } from "./defaults";

export class VwceDB extends Dexie {
  settings!: Table<AppSettings, string>;
  goals!: Table<Goal, string>;
  transactions!: Table<Transaction, string>;
  annualChecklists!: Table<AnnualChecklist, string>;
  monthlySnapshots!: Table<MonthlySnapshot, string>;
  appMetadata!: Table<AppMetadata, string>;
  constructor() {
    super("quy_vwce_cho_be");
    this.version(1).stores({
      settings: "id", goals: "id, dueDate", transactions: "id, date, type",
      annualChecklists: "id, year", monthlySnapshots: "id, year, month", appMetadata: "id",
    });
  }
}
export const db = new VwceDB();

export async function ensureInitialized(seedSample: boolean): Promise<void> {
  const existing = await db.settings.get("settings");
  if (existing?.onboardingDone) return;
  const settings = defaultSettings();
  settings.onboardingDone = true;
  settings.disclaimerAccepted = true;
  await db.settings.put(settings);
  await db.appMetadata.put({ id: "meta", schemaVersion: SCHEMA_VERSION, lastBackupAt: "", createdAt: nowIso(), updatedAt: nowIso() });
  if (seedSample) { await db.goals.clear(); await db.goals.bulkPut(defaultGoals()); }
}
export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get("settings")) ?? defaultSettings();
}
export async function saveSettings(partial: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...partial, id: "settings", updatedAt: nowIso() });
}
export async function listGoals(): Promise<Goal[]> { return db.goals.orderBy("dueDate").toArray(); }
export async function listTransactions(): Promise<Transaction[]> {
  const all = await db.transactions.toArray();
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
export async function upsertTransaction(tx: Transaction): Promise<void> {
  await db.transactions.put({ ...tx, updatedAt: nowIso() });
}
export async function deleteTransaction(id: string): Promise<void> { await db.transactions.delete(id); }
export async function upsertGoal(g: Goal): Promise<void> { await db.goals.put({ ...g, updatedAt: nowIso() }); }
export async function deleteGoal(id: string): Promise<void> { await db.goals.delete(id); }
export async function exportBackup(): Promise<BackupPayload> {
  const [settings, goals, transactions, annualChecklists, monthlySnapshots] = await Promise.all([
    db.settings.toArray(), db.goals.toArray(), db.transactions.toArray(),
    db.annualChecklists.toArray(), db.monthlySnapshots.toArray(),
  ]);
  const payload: BackupPayload = { schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), settings, goals, transactions, annualChecklists, monthlySnapshots };
  const meta = await db.appMetadata.get("meta");
  await db.appMetadata.put({ id: "meta", schemaVersion: SCHEMA_VERSION, lastBackupAt: payload.exportedAt, createdAt: meta?.createdAt ?? nowIso(), updatedAt: nowIso() });
  return payload;
}
export async function importBackup(payload: BackupPayload): Promise<void> {
  if (!payload || typeof payload !== "object") throw new Error("JSON không hợp lệ");
  if (payload.schemaVersion !== SCHEMA_VERSION) throw new Error(`schemaVersion không khớp (cần ${SCHEMA_VERSION})`);
  await db.transaction("rw", [db.settings, db.goals, db.transactions, db.annualChecklists, db.monthlySnapshots], async () => {
    await Promise.all([db.settings.clear(), db.goals.clear(), db.transactions.clear(), db.annualChecklists.clear(), db.monthlySnapshots.clear()]);
    if (payload.settings?.length) await db.settings.bulkPut(payload.settings);
    if (payload.goals?.length) await db.goals.bulkPut(payload.goals);
    if (payload.transactions?.length) await db.transactions.bulkPut(payload.transactions);
    if (payload.annualChecklists?.length) await db.annualChecklists.bulkPut(payload.annualChecklists);
    if (payload.monthlySnapshots?.length) await db.monthlySnapshots.bulkPut(payload.monthlySnapshots);
  });
}
export async function clearAllData(): Promise<void> {
  await db.transaction("rw", [db.settings, db.goals, db.transactions, db.annualChecklists, db.monthlySnapshots, db.appMetadata], async () => {
    await Promise.all([db.settings.clear(), db.goals.clear(), db.transactions.clear(), db.annualChecklists.clear(), db.monthlySnapshots.clear(), db.appMetadata.clear()]);
  });
}
export async function getOrCreateChecklist(year: number): Promise<AnnualChecklist> {
  const id = `checklist_${year}`;
  const existing = await db.annualChecklists.get(id);
  if (existing) return existing;
  const c = defaultChecklist(year);
  await db.annualChecklists.put(c);
  return c;
}
export { uid };
