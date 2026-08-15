/**
 * DELETE-TOMBSTONE-BACKUP-001 -- xoa chua dong bo + khoi phuc sao luu.
 *
 * Chuoi loi, doc tu code tren main:
 * 1. db.m07b `deleteTransaction`/`deleteGoal` ghi tombstone cuc bo VA xep mot
 *    viec "delete" vao outbox. Outbox la duong DUY NHAT de may chu biet dong do
 *    da bi xoa (`sync/engine` chi goi `update({ deleted_at })` tu outbox).
 * 2. db.m08 `exportBackup` loc bo moi dong co `deletedAt` ra mang rieng.
 * 3. db.m09 `importBackup` xoa sach 13 bang -- gom ca `outbox`, `conflicts` va
 *    `syncMeta`.
 * 4. Vi `syncMeta` mat, lan dong bo sau la hydrate lan dau va keo lai dong van
 *    con song tren may chu => dong da xoa "song lai".
 *
 * Buoc 4 can may chu nen khong mo phong o day; cac test duoi day khoa dung nhung
 * dieu kien tao ra no, va khoa ca he qua khi nguoi dung chap nhan rui ro.
 *
 * PR3 -- gate khong con hep o viec xoa. Bat ky item nao trong outbox, hoac bat
 * ky xung dot chua xu ly nao, deu chan. Ly do: `importBackup` xoa sach ca
 * `outbox` lan `conflicts`, nen mot `upsert` chua day cung mat VINH VIEN va mot
 * xung dot chua xu ly bien mat truoc khi nguoi dung kip chon ben nao.
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
import type { ConflictRecord } from "./sync/types";

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
  name: "Mục tiêu sẽ bị xoá",
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

function conflictRow(partial: Partial<ConflictRecord> = {}): ConflictRecord {
  return {
    id: "conflict_gate_1",
    table: "transactions",
    entityId: TX.id,
    local: { id: TX.id, notes: "local" },
    remote: { id: TX.id, notes: "remote" },
    detectedAt: T,
    ...partial,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

describe("DELETE-TOMBSTONE-BACKUP-001 -- điều kiện tạo ra lỗi", () => {
  it("giữ tombstone cục bộ và xếp việc xoá vào outbox, nhưng danh sách sống không còn dòng đó", async () => {
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

describe("DELETE-TOMBSTONE-BACKUP-001 -- gate khi nhập sao lưu", () => {
  it("chặn khi còn việc xoá giao dịch chưa đẩy, và không thay đổi dữ liệu nào", async () => {
    await upsertTransaction(TX, { sync: false });
    await deleteTransaction(TX.id);
    const backup = await exportBackup();

    const error = await importBackup(backup).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(pendingSyncImportBlock(error)).toEqual({
      total: 1,
      deletes: 1,
      dead: 0,
      upserts: 0,
      recovers: 0,
      conflicts: 0,
    });
    expect(String((error as Error).message)).toContain("chưa đồng bộ xong");

    const pending = await db.outbox.toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].op).toBe("delete");
    expect((await db.transactions.get(TX.id))?.deletedAt).toBeTruthy();
  });

  it("chặn khi còn việc xoá mục tiêu chưa đẩy", async () => {
    await upsertGoal(GOAL, { sync: false });
    await deleteGoal(GOAL.id);
    const backup = await exportBackup();

    await expect(importBackup(backup)).rejects.toThrow(/chưa đồng bộ xong/);

    expect(await db.outbox.count()).toBe(1);
    expect((await db.goals.get(GOAL.id))?.deletedAt).toBeTruthy();
    expect(await listGoals()).toHaveLength(0);
  });

  it("chặn khi còn việc đã thử gửi nhiều lần không thành công, kể cả khi đó không phải việc xoá", async () => {
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

    await expect(importBackup(backup)).rejects.toThrow(/chưa đồng bộ xong/);

    expect(await db.outbox.count()).toBe(1);
  });

  it("từ chối payload sai trước khi xét việc đồng bộ còn treo", async () => {
    await upsertTransaction(TX, { sync: false });
    await deleteTransaction(TX.id);
    const broken = { ...(await exportBackup()), schemaVersion: 999 };

    await expect(importBackup(broken)).rejects.toThrow(/schemaVersion/);

    expect(await db.outbox.count()).toBe(1);
  });
});

describe("PR3 -- gate fail-closed cho MỌI trạng thái outbox", () => {
  it("chặn khi chỉ còn một việc upsert bình thường -- thay đổi đó sẽ mất vĩnh viễn", async () => {
    await upsertTransaction(TX);
    expect(await db.outbox.count()).toBe(1);
    const backup = await exportBackup();

    const error = await importBackup(backup).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(pendingSyncImportBlock(error)).toEqual({
      total: 1,
      deletes: 0,
      dead: 0,
      upserts: 1,
      recovers: 0,
      conflicts: 0,
    });
    // Khong mot thay doi nao duoc thuc hien.
    expect(await db.outbox.count()).toBe(1);
    expect((await listTransactions()).map((row) => row.id)).toEqual([TX.id]);
  });

  it("chặn khi còn guarded upsert, và giữ nguyên expectedRemoteVersion", async () => {
    await upsertTransaction(TX, { sync: false });
    const backup = await exportBackup();
    await db.outbox.put({
      id: "ob_guarded_upsert",
      table: "transactions",
      entityId: TX.id,
      op: "upsert",
      payload: { id: TX.id, notes: "guarded" },
      version: 6,
      expectedRemoteVersion: 5,
      createdAt: nowIso(),
      attempts: 0,
    });

    await expect(importBackup(backup)).rejects.toThrow(/chưa đồng bộ xong/);

    const pending = await db.outbox.get("ob_guarded_upsert");
    expect(pending).toMatchObject({ version: 6, expectedRemoteVersion: 5 });
  });

  it("chặn khi còn việc recover, và giữ nguyên payload của nó", async () => {
    await upsertTransaction(TX, { sync: false });
    const backup = await exportBackup();
    await db.outbox.put({
      id: "ob_recover",
      table: "transactions",
      entityId: TX.id,
      op: "recover",
      payload: { id: TX.id, notes: "recover payload" },
      recoverySessionId: "session-pr3",
      sourceLocalVersion: 4,
      createAttempted: true,
      createdAt: nowIso(),
      attempts: 0,
    });

    const error = await importBackup(backup).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(pendingSyncImportBlock(error)).toMatchObject({ total: 1, recovers: 1 });
    expect(await db.outbox.get("ob_recover")).toMatchObject({
      op: "recover",
      recoverySessionId: "session-pr3",
      sourceLocalVersion: 4,
      createAttempted: true,
    });
  });

  it("chặn khi còn xung đột chưa xử lý, ngay cả khi outbox rỗng", async () => {
    await upsertTransaction(TX, { sync: false });
    const backup = await exportBackup();
    await db.conflicts.put(conflictRow());
    expect(await db.outbox.count()).toBe(0);

    const error = await importBackup(backup).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(pendingSyncImportBlock(error)).toMatchObject({ total: 0, conflicts: 1 });
    expect(String((error as Error).message)).toContain("xung đột chưa xử lý");
    // Xung dot phai con nguyen de nguoi dung con duong xu ly.
    expect(await db.conflicts.count()).toBe(1);
  });
});

describe("DELETE-TOMBSTONE-BACKUP-001 -- không chặn quá tay", () => {
  it("không chặn khi outbox rỗng", async () => {
    await upsertTransaction(TX, { sync: false });
    const backup = await exportBackup();

    await importBackup(backup);

    expect((await listTransactions()).map((row) => row.id)).toEqual([TX.id]);
  });

  it("không chặn khi xung đột đã được xử lý và outbox rỗng", async () => {
    await upsertTransaction(TX, { sync: false });
    const backup = await exportBackup();
    await db.conflicts.put(conflictRow({ resolved: "remote" }));

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

  it("cờ chấp nhận rủi ro vượt qua cả upsert treo lẫn xung đột chưa xử lý (PR3)", async () => {
    await upsertTransaction(TX);
    await db.conflicts.put(conflictRow());
    const backup = await exportBackup();

    await importBackup(backup, { acceptPendingSyncRisk: true });

    expect((await listTransactions()).map((row) => row.id)).toEqual([TX.id]);
    // Import xoa sach outbox va conflicts -- dung la dieu gate canh bao truoc.
    expect(await db.outbox.count()).toBe(0);
    expect(await db.conflicts.count()).toBe(0);
  });
});
