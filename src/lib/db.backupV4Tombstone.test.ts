/**
 * DELETE-TOMBSTONE-BACKUP-001-b -- backup schema v4 + tombstones.
 *
 * Commit 1 (test only): every failing case below must be RED because
 * BACKUP_SCHEMA_VERSION is still 3 and exportBackup does not yet emit
 * deletedGoals / deletedTransactions. Commit 2 (product code) turns them GREEN.
 *
 * Polyfill IndexedDB BEFORE importing db (Dexie initialises on module load).
 */
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  deleteGoal,
  deleteTransaction,
  exportBackup,
  importBackup,
  listGoals,
  listTransactions,
  upsertGoal,
  upsertTransaction,
} from "./db";
import { defaultSettings, nowIso } from "./defaults";
import { isSupportedBackupSchema, unsupportedBackupSchemaMessage } from "./backupSchema";
import { BACKUP_SCHEMA_VERSION } from "./types";
import type { BackupPayload, Goal, Transaction } from "./types";

// ---------------------------------------------------------------------------
// Extended type used only in this file for v4-specific field access.
// BackupPayload gains these fields in commit 2; the cast is a no-op then.
// ---------------------------------------------------------------------------
type BackupV4 = BackupPayload & {
  deletedGoals?: Goal[];
  deletedTransactions?: Transaction[];
};

const T = "2026-08-14T18:00:00.000Z";
const USER_ID = "v4-owner-1";

const LIVE_TX: Transaction = {
  id: "v4_live_tx",
  date: "2026-08-14",
  type: "cash_in",
  amount: 100,
  notes: "live transaction v4 test",
  createdAt: T,
  updatedAt: T,
  source: "manual",
};

const DEL_TX: Transaction = {
  id: "v4_del_tx",
  date: "2026-08-13",
  type: "fee",
  amount: 5,
  notes: "will be deleted v4 test",
  createdAt: T,
  updatedAt: T,
  source: "manual",
};

const LIVE_GOAL: Goal = {
  id: "v4_live_goal",
  name: "Muc tieu song",
  dueDate: "2040-01-01",
  amount: 5000,
  mode: "nominal",
  baseYear: 2026,
  inflationRate: 0.02,
  bufferPct: 0.1,
  urgency: "hard",
  protectedAmount: 0,
  notes: "",
  createdAt: T,
  updatedAt: T,
};

const DEL_GOAL: Goal = {
  id: "v4_del_goal",
  name: "Muc tieu se bi xoa",
  dueDate: "2030-01-01",
  amount: 1000,
  mode: "nominal",
  baseYear: 2026,
  inflationRate: 0.02,
  bufferPct: 0.1,
  urgency: "flexible",
  protectedAmount: 0,
  notes: "",
  createdAt: T,
  updatedAt: T,
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

// ---------------------------------------------------------------------------
// Schema version constants (RED: BACKUP_SCHEMA_VERSION === 3 today)
// ---------------------------------------------------------------------------
describe("DELETE-TOMBSTONE-BACKUP-001-b -- schema version constants", () => {
  it("BACKUP_SCHEMA_VERSION is 4", () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(4);
  });

  it("isSupportedBackupSchema accepts 4", () => {
    expect(isSupportedBackupSchema(4)).toBe(true);
  });

  it("unsupportedBackupSchemaMessage for an unknown version mentions 4", () => {
    expect(unsupportedBackupSchemaMessage(5)).toMatch(/4/);
  });

  it("isSupportedBackupSchema still accepts 1, 2, 3 (regression)", () => {
    expect(isSupportedBackupSchema(1)).toBe(true);
    expect(isSupportedBackupSchema(2)).toBe(true);
    expect(isSupportedBackupSchema(3)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Export v4 (RED: exportBackup does not yet emit tombstone arrays)
// ---------------------------------------------------------------------------
describe("DELETE-TOMBSTONE-BACKUP-001-b -- exportBackup v4", () => {
  it("export result carries schemaVersion 4", async () => {
    const backup = await exportBackup();
    expect(backup.schemaVersion).toBe(4);
  });

  it("export separates live and deleted transactions into different arrays", async () => {
    await upsertTransaction(LIVE_TX, { sync: false });
    await upsertTransaction(DEL_TX, { sync: false });
    await deleteTransaction(DEL_TX.id);

    const backup = await exportBackup() as BackupV4;

    expect(backup.transactions.map((t) => t.id)).toEqual([LIVE_TX.id]);
    expect(Array.isArray(backup.deletedTransactions)).toBe(true);
    expect((backup.deletedTransactions ?? []).map((t) => t.id)).toContain(DEL_TX.id);
    expect(
      (backup.deletedTransactions ?? []).find((t) => t.id === DEL_TX.id)?.deletedAt,
    ).toBeTruthy();
  });

  it("export separates live and deleted goals into different arrays", async () => {
    await upsertGoal(LIVE_GOAL, { sync: false });
    await upsertGoal(DEL_GOAL, { sync: false });
    await deleteGoal(DEL_GOAL.id);

    const backup = await exportBackup() as BackupV4;

    expect(backup.goals.map((g) => g.id)).toEqual([LIVE_GOAL.id]);
    expect(Array.isArray(backup.deletedGoals)).toBe(true);
    expect((backup.deletedGoals ?? []).map((g) => g.id)).toContain(DEL_GOAL.id);
    expect(
      (backup.deletedGoals ?? []).find((g) => g.id === DEL_GOAL.id)?.deletedAt,
    ).toBeTruthy();
  });

  it("export emits empty tombstone arrays when nothing has been deleted", async () => {
    await upsertTransaction(LIVE_TX, { sync: false });
    const backup = await exportBackup() as BackupV4;
    expect(Array.isArray(backup.deletedTransactions)).toBe(true);
    expect(Array.isArray(backup.deletedGoals)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Import v4 round-trip (RED: importBackup rejects schemaVersion 4 today)
// ---------------------------------------------------------------------------
describe("DELETE-TOMBSTONE-BACKUP-001-b -- importBackup v4 round-trip", () => {
  async function freshDb(): Promise<void> {
    await db.delete();
    await db.open();
    await db.settings.put(defaultSettings());
  }

  it("importing a v4 backup restores only live rows to the active lists", async () => {
    await upsertTransaction(LIVE_TX, { sync: false });
    await upsertTransaction(DEL_TX, { sync: false });
    await deleteTransaction(DEL_TX.id);
    await upsertGoal(LIVE_GOAL, { sync: false });
    await upsertGoal(DEL_GOAL, { sync: false });
    await deleteGoal(DEL_GOAL.id);
    const backup = await exportBackup() as unknown as BackupPayload;
    await freshDb();

    await importBackup(backup);

    const txIds = (await listTransactions()).map((t) => t.id);
    expect(txIds).toContain(LIVE_TX.id);
    expect(txIds).not.toContain(DEL_TX.id);
    const goalIds = (await listGoals()).map((g) => g.id);
    expect(goalIds).toContain(LIVE_GOAL.id);
    expect(goalIds).not.toContain(DEL_GOAL.id);
  });

  it("importing a v4 backup also restores tombstones to IndexedDB", async () => {
    await upsertTransaction(LIVE_TX, { sync: false });
    await upsertTransaction(DEL_TX, { sync: false });
    await deleteTransaction(DEL_TX.id);
    await upsertGoal(LIVE_GOAL, { sync: false });
    await upsertGoal(DEL_GOAL, { sync: false });
    await deleteGoal(DEL_GOAL.id);
    const backup = await exportBackup() as unknown as BackupPayload;
    await freshDb();

    await importBackup(backup);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await (db as any).transactions.get(DEL_TX.id)) as { deletedAt?: string } | undefined)?.deletedAt).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await (db as any).goals.get(DEL_GOAL.id)) as { deletedAt?: string } | undefined)?.deletedAt).toBeTruthy();
  });

  it("v4 import enqueues a delete for each tombstone when userId was set before import", async () => {
    const syncMetaRow = {
      id: "syncMeta",
      userId: USER_ID,
      lastPulledAt: "2026-08-14T10:00:00.000Z",
      lastPushedAt: "2026-08-14T10:00:00.000Z",
      migrateWizardDone: false,
      migrateWizardSkipped: false,
      updatedAt: T,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).syncMeta.put(syncMetaRow);

    await upsertTransaction(DEL_TX, { sync: false });
    await deleteTransaction(DEL_TX.id);
    await upsertGoal(DEL_GOAL, { sync: false });
    await deleteGoal(DEL_GOAL.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).outbox.clear();

    const backup = await exportBackup() as unknown as BackupPayload;

    await freshDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).syncMeta.put(syncMetaRow);

    await importBackup(backup);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outbox = await (db as any).outbox.toArray() as Array<{ op: string; entityId: string }>;
    const deleteIds = outbox.filter((o) => o.op === "delete").map((o) => o.entityId);
    expect(deleteIds).toContain(DEL_TX.id);
    expect(deleteIds).toContain(DEL_GOAL.id);
  });

  it("v4 import does NOT enqueue deletes when no userId exists (fresh install)", async () => {
    await upsertTransaction(DEL_TX, { sync: false });
    await deleteTransaction(DEL_TX.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).outbox.clear();

    const backup = await exportBackup() as unknown as BackupPayload;
    await freshDb();
    // No syncMeta -- simulates a fresh install with no prior sync.

    await importBackup(backup);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await (db as any).outbox.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Duplicate id guard -- fail-closed
// (RED: v4 not yet supported; throws schema error before guard today)
// ---------------------------------------------------------------------------
describe("DELETE-TOMBSTONE-BACKUP-001-b -- duplicate id guard", () => {
  it("rejects a v4 payload where an id is in both transactions and deletedTransactions", async () => {
    await upsertTransaction(LIVE_TX, { sync: false });
    const goodBackup = await exportBackup() as BackupV4;

    const malformed = {
      ...goodBackup,
      schemaVersion: 4,
      deletedTransactions: [
        { ...LIVE_TX, deletedAt: nowIso(), updatedAt: nowIso() },
      ],
    } as unknown as BackupPayload;

    await expect(importBackup(malformed)).rejects.toThrow();
    // DB must be untouched -- the guard must reject before any write.
    expect((await listTransactions()).map((t) => t.id)).toContain(LIVE_TX.id);
  });

  it("rejects a v4 payload where an id is in both goals and deletedGoals", async () => {
    await upsertGoal(LIVE_GOAL, { sync: false });
    const goodBackup = await exportBackup() as BackupV4;

    const malformed = {
      ...goodBackup,
      schemaVersion: 4,
      deletedGoals: [
        { ...LIVE_GOAL, deletedAt: nowIso(), updatedAt: nowIso() },
      ],
    } as unknown as BackupPayload;

    await expect(importBackup(malformed)).rejects.toThrow();
    expect((await listGoals()).map((g) => g.id)).toContain(LIVE_GOAL.id);
  });
});

// ---------------------------------------------------------------------------
// Gate (a) preserved for v4 payloads
// (RED: v4 throws schema error before gate today; gate error expected after fix)
// ---------------------------------------------------------------------------
describe("DELETE-TOMBSTONE-BACKUP-001-b -- gate (a) preserved for v4 payloads", () => {
  it("blocks v4 import when pending delete outbox is non-empty", async () => {
    await upsertTransaction(LIVE_TX, { sync: false });
    await deleteTransaction(LIVE_TX.id);

    // Force schemaVersion 4 to simulate a real v4 file.
    const backup = { ...await exportBackup(), schemaVersion: 4 } as unknown as BackupPayload;

    // Regex uses Unicode escapes to avoid diacritic mangling in the source.
    // "ch\u01b0a \u0111\u1ed3ng b\u1ed9 xong" == "chưa đồng bộ xong"
    await expect(importBackup(backup)).rejects.toThrow(
      /ch\u01b0a \u0111\u1ed3ng b\u1ed9 xong/,
    );
  });
});

// ---------------------------------------------------------------------------
// v3 import regression (GREEN in both commits)
// ---------------------------------------------------------------------------
describe("DELETE-TOMBSTONE-BACKUP-001-b -- v3 import regression", () => {
  it("importing a hand-crafted v3 backup still restores live rows", async () => {
    const v3backup: BackupPayload = {
      schemaVersion: 3,
      exportedAt: nowIso(),
      settings: await db.settings.toArray(),
      goals: [],
      transactions: [LIVE_TX],
      annualChecklists: [],
      monthlySnapshots: [],
    };

    await db.delete();
    await db.open();
    await db.settings.put(defaultSettings());

    await importBackup(v3backup);

    expect((await listTransactions()).map((t) => t.id)).toContain(LIVE_TX.id);
  });
});
