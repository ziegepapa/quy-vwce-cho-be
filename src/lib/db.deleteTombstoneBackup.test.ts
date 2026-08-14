/**
 * DELETE-TOMBSTONE-BACKUP-001 -- xoa chua dong bo + khoi phuc sao luu.
 *
 * Chuoi loi, doc tu code tren main:
 * 1. db.m07b `deleteTransaction`/`deleteGoal` ghi tombstone cuc bo VA xep mot
 *    viec "delete" vao outbox. Outbox la duong DUY NHAT de may chu biet dong do
 *    da bi xoa (`sync/engine` chi goi `update({ deleted_at })` tu outbox).
 * 2. db.m08 `exportBackup` loc bo moi dong co `deletedAt`, nen file sao luu
 *    khong mang theo thong tin da xoa.
 * 3. db.m09 `importBackup` xoa sach 13 bang -- gom ca `outbox` va `syncMeta`.
 * 4. Vi `syncMeta` mat, lan dong bo sau la hydrate lan dau va keo lai dong van
 *    con song tren may chu => dong da xoa "song lai".
 *
 * Buoc 4 can may chu nen khong mo phong o day; cac test duoi day khoa dung nhung
 * dieu kien tao ra no, va khoa ca he qua khi nguoi dung chap nhan rui ro.
 *
 * Phai polyfill IndexedDB TRUOC khi import db (Dexie khoi tao ngay khi load module).
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
import { pendingSyncImportBlock } from "./backupImportGate";
import type { Goal, Transaction } from "./types";

const T = "2026-08-14T12:00:00.000Z";

const TX: Transaction = {
  id: "tx_delete_tombstone_backup",
  date: "2026-08-14",
  type: "cash_in",
  amount: 250,
  notes: "delete tombstone sentinel",
  createdAt: T,
  updatedAt: T,
  source: "manual",
};

const GOAL: Goal = {
  id: "goal_delete_tombstone_backup",
  name: "M\u1ee5c ti\u00eau s\u1ebd b\u1ecb xo\u00e1",
  dueDate: "2030-01-01",
  amount: 1000,
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

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

describe("DELETE-TOMBSTONE-BACKUP-001 -- \u0111i\u1ec1u ki\u1ec7n t\u1ea1o ra l\u1ed7i", () => {
  it("gi\u1eef tombstone c\u1ee5c b\u1ed9 v\u00e0 x\u1ebfp vi\u1ec7c xo\u00e1 v\u00e0o outbox, nh\u01b0ng file sao l\u01b0u kh\u00f4ng mang theo th\u00f4ng tin \u0111\u00e3 xo\u00e1", async () => {
    await upsertTransaction(TX, { sync: false });
    await deleteTransaction(TX.id);

    const pending = await db.outbox.toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      table: "transactions",
      entityId: TX.id,
      op: "delete",
    });

    expect((await db.transactions.get(TX.id))?.deletedAt).toBeTruthy();

    const backup = await exportBackup();
    expect(backup.transactions.map((row) => row.id)).not.toContain(TX.id);
  });
});

describe("DELETE-TOMBSTONE-BACKUP-001 -- gate khi nh\u1eadp sao l\u01b0u", () => {
  it("ch\u1eb7n khi c\u00f2n vi\u1ec7c xo\u00e1 giao d\u1ecbch ch\u01b0a \u0111\u1ea9y, v\u00e0 kh\u00f4ng thay \u0111\u1ed5i d\u1eef li\u1ec7u n\u00e0o", async () => {
    await upsertTransaction(TX, { sync: false });
    await deleteTransaction(TX.id);
    const backup = await exportBackup();

    const error = await importBackup(backup).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(pendingSyncImportBlock(error)).toEqual({ total: 1, deletes: 1, dead: 0 });
    expect(String((error as Error).message)).toContain("ch\u01b0a \u0111\u1ed3ng b\u1ed9 xong");

    const pending = await db.outbox.toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].op).toBe("delete");
    expect((await db.transactions.get(TX.id))?.deletedAt).toBeTruthy();
  });

  it("ch\u1eb7n khi c\u00f2n vi\u1ec7c xo\u00e1 m\u1ee5c ti\u00eau ch\u01b0a \u0111\u1ea9y", async () => {
    await upsertGoal(GOAL, { sync: false });
    await deleteGoal(GOAL.id);
    const backup = await exportBackup();

    await expect(importBackup(backup)).rejects.toThrow(/ch\u01b0a \u0111\u1ed3ng b\u1ed9 xong/);

    expect(await db.outbox.count()).toBe(1);
    expect((await db.goals.get(GOAL.id))?.deletedAt).toBeTruthy();
    expect(await listGoals()).toHaveLength(0);
  });

  it("ch\u1eb7n khi c\u00f2n vi\u1ec7c \u0111\u00e3 th\u1eed g\u1eedi nhi\u1ec1u l\u1ea7n kh\u00f4ng th\u00e0nh c\u00f4ng, k\u1ec3 c\u1ea3 khi \u0111\u00f3 kh\u00f4ng ph\u1ea3i vi\u1ec7c xo\u00e1", async () => {
    await upsertTransaction(TX, { sync: false });
    const backup = await exportBackup();
    await db.outbox.put({
      id: "ob_dead_upsert",
      table: "transactions",
      entityId: TX.id,
      op: "upsert",
      payload: null,
      version: 3,
      createdAt: nowIso(),
      attempts: 8,
      dead: true,
    });

    await expect(importBackup(backup)).rejects.toThrow(/ch\u01b0a \u0111\u1ed3ng b\u1ed9 xong/);

    expect(await db.outbox.count()).toBe(1);
  });

  it("t\u1eeb ch\u1ed1i payload sai tr\u01b0\u1edbc khi x\u00e9t vi\u1ec7c \u0111\u1ed3ng b\u1ed9 c\u00f2n treo", async () => {
    await upsertTransaction(TX, { sync: false });
    await deleteTransaction(TX.id);
    const broken = { ...(await exportBackup()), schemaVersion: 999 };

    await expect(importBackup(broken)).rejects.toThrow(/schemaVersion/);

    expect(await db.outbox.count()).toBe(1);
  });
});

describe("DELETE-TOMBSTONE-BACKUP-001 -- kh\u00f4ng ch\u1eb7n qu\u00e1 tay", () => {
  it("kh\u00f4ng ch\u1eb7n khi outbox r\u1ed7ng", async () => {
    await upsertTransaction(TX, { sync: false });
    const backup = await exportBackup();

    await importBackup(backup);

    expect((await listTransactions()).map((row) => row.id)).toEqual([TX.id]);
  });

  it("kh\u00f4ng ch\u1eb7n khi ch\u1ec9 c\u00f2n vi\u1ec7c upsert b\u00ecnh th\u01b0\u1eddng -- ph\u1ea1m vi c\u1ed1 \u00fd c\u1ee7a h\u01b0\u1edbng (a)", async () => {
    await upsertTransaction(TX);
    expect(await db.outbox.count()).toBe(1);
    const backup = await exportBackup();

    await importBackup(backup);

    expect((await listTransactions()).map((row) => row.id)).toEqual([TX.id]);
  });
});

describe("DELETE-TOMBSTONE-BACKUP-001 -- he qua khi nguoi dung chap nhan rui ro", () => {
  it("cho nhap; v4 import khoi phuc tombstone vao IndexedDB, outbox = 0 (khong co userId)", async () => {
    await upsertTransaction(TX, { sync: false });
    await deleteTransaction(TX.id);
    const backup = await exportBackup();

    await importBackup(backup, { acceptPendingSyncRisk: true });

    // Huong (b) da ship: tombstone duoc khoi phuc, khong mat di lam.
    // outbox la 0 vi test nay khong thiet lap userId trong syncMeta (fresh install).
    // Neu co userId, importV4 se xep viec "delete" vao outbox de may chu biet.
    expect(await db.outbox.count()).toBe(0);
    // Tombstone duoc khoi phuc vao IndexedDB -- khong phai undefined nua.
    expect((await db.transactions.get(TX.id))?.deletedAt).toBeTruthy();
    expect(await listTransactions()).toHaveLength(0);
  });
});
