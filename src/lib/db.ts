import Dexie, { type Table } from "dexie";
import type { AnnualChecklist, AppMetadata, AppSettings, BackupPayload, Goal, MonthlySnapshot, Transaction } from "./types";
import { SCHEMA_VERSION } from "./types";
import { defaultChecklist, defaultGoals, defaultSettings, nowIso, uid } from "./defaults";
import type { ConflictRecord, OutboxItem, SyncMeta } from "./sync/types";
import { enqueueOutbox } from "./sync/outbox";

export class VwceDB extends Dexie {
  settings!: Table<AppSettings, string>;
  goals!: Table<Goal, string>;
  transactions!: Table<Transaction, string>;
  annualChecklists!: Table<AnnualChecklist, string>;
  monthlySnapshots!: Table<MonthlySnapshot, string>;
  appMetadata!: Table<AppMetadata, string>;
  outbox!: Table<OutboxItem, string>;
  conflicts!: Table<ConflictRecord, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super("quy_vwce_cho_be");
    this.version(1).stores({
      settings: "id",
      goals: "id, dueDate",
      transactions: "id, date, type",
      annualChecklists: "id, year",
      monthlySnapshots: "id, year, month",
      appMetadata: "id",
    });
    this.version(2).stores({
      settings: "id",
      goals: "id, dueDate",
      transactions: "id, date, type",
      annualChecklists: "id, year",
      monthlySnapshots: "id, year, month",
      appMetadata: "id",
      outbox: "id, table, entityId, createdAt",
      conflicts: "id, table, entityId",
      syncMeta: "id, userId",
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
  await db.appMetadata.put({
    id: "meta",
    schemaVersion: SCHEMA_VERSION,
    lastBackupAt: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  if (seedSample) {
    await db.goals.clear();
    await db.goals.bulkPut(defaultGoals());
  }
}

export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get("settings")) ?? defaultSettings();
}

export async function saveSettings(partial: Partial<AppSettings>, opts?: { sync?: boolean }): Promise<void> {
  const current = await getSettings();
  const ver = ((current as AppSettings & { version?: number }).version ?? 0) + 1;
  const next = { ...current, ...partial, id: "settings", updatedAt: nowIso(), version: ver };
  await db.settings.put(next as AppSettings);
  if (opts?.sync !== false) {
    await enqueueOutbox("settings", "settings", "upsert", next, ver);
  }
}

export async function listGoals(): Promise<Goal[]> {
  return db.goals.orderBy("dueDate").toArray();
}

export async function listTransactions(): Promise<Transaction[]> {
  const all = await db.transactions.toArray();
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function upsertTransaction(tx: Transaction, opts?: { sync?: boolean }): Promise<void> {
  const ver = ((tx as Transaction & { version?: number }).version ?? 0) + 1;
  const next = { ...tx, updatedAt: nowIso(), version: ver };
  await db.transactions.put(next as Transaction);
  if (opts?.sync !== false) {
    await enqueueOutbox("transactions", next.id, "upsert", next, ver);
  }
}

export async function deleteTransaction(id: string, opts?: { sync?: boolean }): Promise<void> {
  await db.transactions.delete(id);
  if (opts?.sync !== false) {
    await enqueueOutbox("transactions", id, "delete", null, 1);
  }
}

export async function upsertGoal(g: Goal, opts?: { sync?: boolean }): Promise<void> {
  const ver = ((g as Goal & { version?: number }).version ?? 0) + 1;
  const next = { ...g, updatedAt: nowIso(), version: ver };
  await db.goals.put(next as Goal);
  if (opts?.sync !== false) {
    await enqueueOutbox("goals", next.id, "upsert", next, ver);
  }
}

export async function deleteGoal(id: string, opts?: { sync?: boolean }): Promise<void> {
  await db.goals.delete(id);
  if (opts?.sync !== false) {
    await enqueueOutbox("goals", id, "delete", null, 1);
  }
}

export async function exportBackup(): Promise<BackupPayload> {
  const [settings, goals, transactions, annualChecklists, monthlySnapshots] = await Promise.all([
    db.settings.toArray(),
    db.goals.toArray(),
    db.transactions.toArray(),
    db.annualChecklists.toArray(),
    db.monthlySnapshots.toArray(),
  ]);
  const payload: BackupPayload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    settings,
    goals,
    transactions,
    annualChecklists,
    monthlySnapshots,
  };
  const meta = await db.appMetadata.get("meta");
  await db.appMetadata.put({
    id: "meta",
    schemaVersion: SCHEMA_VERSION,
    lastBackupAt: payload.exportedAt,
    createdAt: meta?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  });
  return payload;
}

export async function importBackup(payload: BackupPayload): Promise<void> {
  if (!payload || typeof payload !== "object") throw new Error("JSON không hợp lệ");
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`schemaVersion không khớp (cần ${SCHEMA_VERSION})`);
  }
  await db.transaction(
    "rw",
    [db.settings, db.goals, db.transactions, db.annualChecklists, db.monthlySnapshots],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.goals.clear(),
        db.transactions.clear(),
        db.annualChecklists.clear(),
        db.monthlySnapshots.clear(),
      ]);
      if (payload.settings?.length) await db.settings.bulkPut(payload.settings);
      if (payload.goals?.length) await db.goals.bulkPut(payload.goals);
      if (payload.transactions?.length) await db.transactions.bulkPut(payload.transactions);
      if (payload.annualChecklists?.length) await db.annualChecklists.bulkPut(payload.annualChecklists);
      if (payload.monthlySnapshots?.length) await db.monthlySnapshots.bulkPut(payload.monthlySnapshots);
    },
  );
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
      ]);
    },
  );
}

export async function clearUserBusinessData(): Promise<void> {
  await db.transaction(
    "rw",
    [db.settings, db.goals, db.transactions, db.annualChecklists, db.monthlySnapshots, db.outbox, db.conflicts],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.goals.clear(),
        db.transactions.clear(),
        db.annualChecklists.clear(),
        db.monthlySnapshots.clear(),
        db.outbox.clear(),
        db.conflicts.clear(),
      ]);
    },
  );
}

export async function getOrCreateChecklist(year: number): Promise<AnnualChecklist> {
  const id = `checklist_${year}`;
  const existing = await db.annualChecklists.get(id);
  if (existing) return existing;
  const c = defaultChecklist(year);
  await db.annualChecklists.put(c);
  await enqueueOutbox("annualChecklists", id, "upsert", c, 1);
  return c;
}

export async function countLocalData(): Promise<{
  settings: number;
  goals: number;
  transactions: number;
  annualChecklists: number;
  monthlySnapshots: number;
}> {
  const [settings, goals, transactions, annualChecklists, monthlySnapshots] = await Promise.all([
    db.settings.count(),
    db.goals.count(),
    db.transactions.count(),
    db.annualChecklists.count(),
    db.monthlySnapshots.count(),
  ]);
  return { settings, goals, transactions, annualChecklists, monthlySnapshots };
}

export { uid };
