import type { AppSettings, Goal, Transaction } from "./types";
import { SCHEMA_VERSION } from "./types";
import { defaultGoals, defaultSettings, nowIso } from "./defaults";
import { isValidIsin, normalizeIsin, resolveInstrumentIsin } from "./instrument";
import { assertValidTransactionNumbers } from "./transactionValidation";
import { enqueueOutbox, settingsGuardBaseVersion } from "./sync/outbox";
import { db } from "./db.m01a";
import { ensureMultiAssetMigrated } from "./db.m01b";
import { ensureQuoteFoundationMigrated } from "./db.m02";

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

/**
 * Merge settings inside a single read/write transaction.
 *
 * The former read-then-put sequence could lose a field when two autosaves (or
 * an autosave and a VWCE quote mirror) overlapped. Dexie serializes write
 * transactions touching these stores, so every partial update now sees the
 * latest committed settings and the outbox always carries the same snapshot.
 */
export async function saveSettings(
  partial: Partial<AppSettings>,
  opts?: { sync?: boolean },
): Promise<void> {
  await db.transaction("rw", [db.settings, db.outbox], async () => {
    const current = (await db.settings.get("settings")) ?? defaultSettings();
    const ver = ((current as AppSettings & { version?: number }).version ?? 0) + 1;
    const next = { ...current, ...partial, id: "settings", updatedAt: nowIso(), version: ver };
    await db.settings.put(next as AppSettings);
    if (opts?.sync !== false) {
      // Version-guard (AN TOAN DU LIEU): mot ban settings CUC BO cu KHONG duoc
      // ghi de (upsert khong dieu kien) len ban moi hon tren server -- neu khong
      // se xoa mat Ho so khan cap. Push dau tien (prevVer === 0) van khong dieu
      // kien de nguoi dung dong bo duoc lan dau.
      const prevVer = ver - 1;
      const expectedRemoteVersion = await settingsGuardBaseVersion(prevVer);
      await enqueueOutbox(
        "settings",
        "settings",
        "upsert",
        next,
        ver,
        expectedRemoteVersion !== undefined ? { expectedRemoteVersion } : undefined,
      );
    }
  });
}

export async function listGoals(): Promise<Goal[]> {
  const all = await db.goals.orderBy("dueDate").toArray();
  return all.filter((g) => !(g as Goal & { deletedAt?: string }).deletedAt);
}

export async function listTransactions(): Promise<Transaction[]> {
  const all = await db.transactions.toArray();
  return all
    .filter((t) => !(t as Transaction & { deletedAt?: string }).deletedAt)
    .map((tx) => {
      if (
        tx.type !== "buy_vwce" &&
        tx.type !== "sell_vwce" &&
        tx.type !== "buy_security" &&
        tx.type !== "sell_security"
      ) {
        return tx;
      }
      const resolved = resolveInstrumentIsin(tx);
      if (!resolved) return tx;
      if (normalizeIsin(tx.instrumentIsin) === resolved) return tx;
      return { ...tx, instrumentIsin: resolved };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** C3 -- tim giao dich theo externalRef, bo qua tombstone da xoa. */
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
  assertValidTransactionNumbers(tx);
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
