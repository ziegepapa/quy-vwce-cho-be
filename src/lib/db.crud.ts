import type {
  AppSettings,
  Goal,
  Transaction,
} from "./types";
import { SCHEMA_VERSION } from "./types";
import { defaultGoals, defaultSettings, nowIso, uid } from "./defaults";
import { isValidIsin, normalizeIsin, resolveInstrumentIsin } from "./instrument";
import { enqueueOutbox } from "./sync/outbox";
import {
  db,
  ensureMultiAssetMigrated,
  ensureQuoteFoundationMigrated,
  migrateTransactionIsin,
  runPendingMigrations,
} from "./db.core";

export async function ensureInitialized(seedSample: boolean): Promise<void> {
  const existing = await db.settings.get("settings");
  if (existing?.onboardingDone) {
    await ensureMultiAssetMigrated();
    await ensureQuoteFoundationMigrated();
    return;
  }
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
  await ensureMultiAssetMigrated();
  await ensureQuoteFoundationMigrated();
}

export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get("settings")) ?? defaultSettings();
}

export async function saveSettings(
  partial: Partial<AppSettings>,
  opts?: { sync?: boolean },
): Promise<void> {
  const current = await getSettings();
  const ver = ((current as AppSettings & { version?: number }).version ?? 0) + 1;
  const next = { ...current, ...partial, id: "settings", updatedAt: nowIso(), version: ver };
  await db.settings.put(next as AppSettings);
  if (opts?.sync !== false) {
    await enqueueOutbox("settings", "settings", "upsert", next, ver);
  }
}

export async function listGoals(): Promise<Goal[]> {
  const all = await db.goals.orderBy("dueDate").toArray();
  return all.filter((g) => !(g as Goal & { deletedAt?: string }).deletedAt);
}

export async function listTransactions(): Promise<Transaction[]> {
  const all = await db.transactions.toArray();
  return all
    .filter((t) => !(t as Transaction & { deletedAt?: string }).deletedAt)
    .map(migrateTransactionIsin)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** C3 — tìm giao dịch theo externalRef, bỏ qua tombstone đã xóa. */
export async function findTransactionByExternalRef(
  externalRef: string,
): Promise<Transaction | undefined> {
  if (!externalRef) return undefined;
  const all = await db.transactions.toArray();
  return all.find(
    (t) =>
      !(t as Transaction & { deletedAt?: string }).deletedAt &&
      (t as Transaction & { externalRef?: string }).externalRef === externalRef,
  );
}

export async function upsertTransaction(
  tx: Transaction,
  opts?: { sync?: boolean },
): Promise<void> {
  if (
    tx.type === "buy_security" ||
    tx.type === "sell_security" ||
    tx.type === "buy_vwce" ||
    tx.type === "sell_vwce"
  ) {
    const resolved = resolveInstrumentIsin(tx);
    if (!resolved) {
      throw new Error("Security transaction requires instrumentIsin");
    }
    if (!isValidIsin(resolved)) {
      throw new Error(`Security transaction has invalid ISIN checksum: ${resolved}`);
    }
    tx = { ...tx, instrumentIsin: resolved };
  }
  const ver = ((tx as Transaction & { version?: number }).version ?? 0) + 1;
  const { deletedAt: _drop, ...rest } = tx as Transaction & { deletedAt?: string; version?: number };
  const next = { ...rest, updatedAt: nowIso(), version: ver } as Transaction & { version: number };
  delete (next as { deletedAt?: string }).deletedAt;
  await db.transactions.put(next as Transaction);
  if (opts?.sync !== false) {
    await enqueueOutbox("transactions", next.id, "upsert", next, ver);
  }
}

export async function deleteTransaction(id: string, opts?: { sync?: boolean }): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) {
    if (opts?.sync !== false) {
      await enqueueOutbox("transactions", id, "delete", null, 1);
    }
    return;
  }
  const ver = ((existing as Transaction & { version?: number }).version ?? 0) + 1;
  const tombstone: Transaction & { version: number } = {
    ...existing,
    deletedAt: nowIso(),
    updatedAt: nowIso(),
    version: ver,
  };
  await db.transactions.put(tombstone as Transaction);
  if (opts?.sync !== false) {
    await enqueueOutbox("transactions", id, "delete", null, ver);
  }
}

export async function upsertGoal(g: Goal, opts?: { sync?: boolean }): Promise<void> {
  const ver = ((g as Goal & { version?: number }).version ?? 0) + 1;
  const { deletedAt: _drop, ...rest } = g as Goal & { deletedAt?: string; version?: number };
  const next = { ...rest, updatedAt: nowIso(), version: ver } as Goal & { version: number };
  delete (next as { deletedAt?: string }).deletedAt;
  await db.goals.put(next as Goal);
  if (opts?.sync !== false) {
    await enqueueOutbox("goals", next.id, "upsert", next, ver);
  }
}

export async function deleteGoal(id: string, opts?: { sync?: boolean }): Promise<void> {
  const existing = await db.goals.get(id);
  if (!existing) {
    if (opts?.sync !== false) {
      await enqueueOutbox("goals", id, "delete", null, 1);
    }
    return;
  }
  const ver = ((existing as Goal & { version?: number }).version ?? 0) + 1;
  const tombstone: Goal & { version: number } = {
    ...existing,
    deletedAt: nowIso(),
    updatedAt: nowIso(),
    version: ver,
  };
  await db.goals.put(tombstone as Goal);
  if (opts?.sync !== false) {
    await enqueueOutbox("goals", id, "delete", null, ver);
  }
}
