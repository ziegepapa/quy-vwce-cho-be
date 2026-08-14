/**
 * DELETE-TOMBSTONE-BACKUP-001 — xoá chưa đồng bộ + khôi phục sao lưu.
 *
 * Chuỗi lỗi, đọc từ code trên main:
 * 1. db.m07b `deleteTransaction`/`deleteGoal` ghi tombstone cục bộ VÀ xếp một
 *    việc "delete" vào outbox. Outbox là đường DUY NHẤT để máy chủ biết dòng đó
 *    đã bị xoá (`sync/engine` chỉ gọi `update({ deleted_at })` từ outbox).
 * 2. db.m08 `exportBackup` lọc bỏ mọi dòng có `deletedAt`, nên file sao lưu
 *    không mang theo thông tin đã xoá.
 * 3. db.m09 `importBackup` xoá sạch 13 bảng — gồm cả `outbox` và `syncMeta`.
 * 4. Vì `syncMeta` mất, lần đồng bộ sau là hydrate lần đầu và kéo lại dòng vẫn
 *    còn sống trên máy chủ ⇒ dòng đã xoá "sống lại".
 *
 * Bước 4 cần máy chủ nên không mô phỏng ở đây; các test dưới đây khoá đúng những
 * điều kiện tạo ra nó, và khoá cả hệ quả khi người dùng chấp nhận rủi ro.
 *
 * Phải polyfill IndexedDB TRƯỚC khi import db (Dexie khởi tạo ngay khi load module).
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

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

describe("DELETE-TOMBSTONE-BACKUP-001 — điều kiện tạo ra lỗi", () => {
  it("giữ tombstone cục bộ và xếp việc xoá vào outbox, nhưng file sao lưu không mang theo thông tin đã xoá", async () => {
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

describe("DELETE-TOMBSTONE-BACKUP-001 — gate khi nhập sao lưu", () => {
  it("chặn khi còn việc xoá giao dịch chưa đẩy, và không thay đổi dữ liệu nào", async () => {
    await upsertTransaction(TX, { sync: false });
    await deleteTransaction(TX.id);
    const backup = await exportBackup();

    const error = await importBackup(backup).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(pendingSyncImportBlock(error)).toEqual({ total: 1, deletes: 1, dead: 0 });
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

describe("DELETE-TOMBSTONE-BACKUP-001 — không chặn quá tay", () => {
  it("không chặn khi outbox rỗng", async () => {
    await upsertTransaction(TX, { sync: false });
    const backup = await exportBackup();

    await importBackup(backup);

    expect((await listTransactions()).map((row) => row.id)).toEqual([TX.id]);
  });

  it("không chặn khi chỉ còn việc upsert bình thường — phạm vi cố ý của hướng (a)", async () => {
    await upsertTransaction(TX);
    expect(await db.outbox.count()).toBe(1);
    const backup = await exportBackup();

    await importBackup(backup);

    expect((await listTransactions()).map((row) => row.id)).toEqual([TX.id]);
  });
});

describe("DELETE-TOMBSTONE-BACKUP-001 — hệ quả khi người dùng chấp nhận rủi ro", () => {
  it("cho nhập, nhưng việc xoá mất đường lên máy chủ — hành vi đã biết, khoá lại để không âm thầm đổi", async () => {
    await upsertTransaction(TX, { sync: false });
    await deleteTransaction(TX.id);
    const backup = await exportBackup();

    await importBackup(backup, { acceptPendingSyncRisk: true });

    // Đây CHÍNH LÀ rủi ro còn lại của hướng (a): outbox bị xoá cùng lúc với
    // clear-and-restore, nên việc xoá không bao giờ tới được máy chủ nữa và một
    // lần kéo dữ liệu đầy đủ sau đó sẽ mang dòng còn sống trên máy chủ trở lại.
    // Hướng (b) — tombstone trong backup v4 — mới đóng được lỗ này.
    expect(await db.outbox.count()).toBe(0);
    expect(await db.transactions.get(TX.id)).toBeUndefined();
    expect(await listTransactions()).toHaveLength(0);
  });
});
