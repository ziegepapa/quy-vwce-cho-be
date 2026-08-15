/**
 * PR3 -- tinh nguyen khoi cua v4 import.
 *
 * Truoc PR3, `importV4` khoi phuc tombstone BEN TRONG mot transaction Dexie roi
 * xep viec "delete" vao outbox SAU KHI transaction da commit. Neu tien trinh
 * chet giua hai buoc do -- dong tab, iOS thu hoi trang, het pin -- thi tombstone
 * nam trong IndexedDB ma KHONG co viec nao trong outbox. Outbox la duong duy nhat
 * bao cho may chu biet dong do da bi xoa, nen lan dong bo ke tiep keo dong van con
 * song tren may chu ve va dong da xoa song lai.
 *
 * PR3 chuyen buoc xep viec vao CHINH transaction do. Cac test duoi day khoa ca hai
 * chieu: thanh cong thi ca hai cung co mat; that bai thi KHONG co gi duoc ghi.
 *
 * Phai polyfill IndexedDB TRUOC khi import db.
 */
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  deleteGoal,
  deleteTransaction,
  exportBackup,
  importBackup,
  listTransactions,
  upsertGoal,
  upsertTransaction,
} from "./db";
import { defaultSettings } from "./defaults";
import type { BackupPayload, Goal, Transaction } from "./types";

const T = "2026-08-15T09:00:00.000Z";
const USER_ID = "atomic-owner-1";

const LIVE_TX: Transaction = {
  id: "atomic_live_tx",
  date: "2026-08-15",
  type: "cash_in",
  amount: 120,
  notes: "live",
  createdAt: T,
  updatedAt: T,
  source: "manual",
};

const DEL_TX: Transaction = {
  id: "atomic_del_tx",
  date: "2026-08-15",
  type: "cash_in",
  amount: 340,
  notes: "se bi xoa",
  createdAt: T,
  updatedAt: T,
  source: "manual",
};

const DEL_GOAL: Goal = {
  id: "atomic_del_goal",
  name: "Mục tiêu sẽ bị xoá",
  dueDate: "2032-01-01",
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

/** Dong "chung nhan": khong nam trong sao luu, nen chi song sot neu transaction bi cuon lai. */
const SENTINEL: Transaction = {
  id: "atomic_sentinel_tx",
  date: "2026-08-15",
  type: "cash_in",
  amount: 77,
  notes: "sentinel",
  createdAt: T,
  updatedAt: T,
  source: "manual",
};

async function freshDb(): Promise<void> {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
}

async function setUserId(): Promise<void> {
  await db.syncMeta.put({ id: `user_${USER_ID}`, userId: USER_ID } as never);
}

/** Tao du lieu that, xuat sao luu v4 that, roi tra ve database rong. */
async function buildV4Payload(): Promise<BackupPayload> {
  await freshDb();
  await upsertTransaction(LIVE_TX, { sync: false });
  await upsertTransaction(DEL_TX, { sync: false });
  await upsertGoal(DEL_GOAL, { sync: false });
  await deleteTransaction(DEL_TX.id);
  await deleteGoal(DEL_GOAL.id);
  const payload = await exportBackup();
  await freshDb();
  return payload;
}

beforeEach(async () => {
  await freshDb();
});

describe("PR3 -- v4 import: khôi phục tombstone và xếp việc xoá là MỘT khối", () => {
  it("thành công: cả tombstone lẫn việc xoá cùng có mặt", async () => {
    const payload = await buildV4Payload();
    expect(payload.schemaVersion).toBe(4);
    await setUserId();

    await importBackup(payload);

    // Tombstone nam trong IndexedDB...
    expect((await db.transactions.get(DEL_TX.id))?.deletedAt).toBeTruthy();
    expect((await db.goals.get(DEL_GOAL.id))?.deletedAt).toBeTruthy();
    // ...va MOI tombstone deu co dung mot viec "delete" di kem.
    const items = await db.outbox.toArray();
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.op === "delete")).toBe(true);
    expect(items.map((item) => item.entityId).sort()).toEqual(
      [DEL_GOAL.id, DEL_TX.id].sort(),
    );
    // Dong con song van hien ra binh thuong.
    expect((await listTransactions()).map((row) => row.id)).toEqual([LIVE_TX.id]);
  });

  it("thất bại giữa chừng: KHÔNG có tombstone nào và KHÔNG có việc nào được ghi", async () => {
    const payload = await buildV4Payload();
    await setUserId();
    await upsertTransaction(SENTINEL, { sync: false });
    await db.outbox.clear();

    // Mot dong giao dich co so tien khong hop le. Bang `transactions` co hook
    // `creating`/`updating` goi `assertValidTransactionNumbers`, va hook do chay
    // NGAY BEN TRONG transaction cua importV4 -- nen chac chan hong giua chung,
    // dung dieu kien can de thu tinh nguyen khoi.
    const corrupted = {
      ...payload,
      transactions: [
        ...payload.transactions,
        { ...LIVE_TX, id: "atomic_broken_tx", amount: Number.NaN },
      ],
    } as unknown as BackupPayload;

    await expect(importBackup(corrupted)).rejects.toThrow();

    // Du lieu cu con nguyen ven.
    expect(await db.transactions.get(SENTINEL.id)).toBeTruthy();
    // Khong mot manh nao cua sao luu hong lot vao.
    expect(await db.transactions.get("atomic_broken_tx")).toBeUndefined();
    expect(await db.transactions.get(DEL_TX.id)).toBeUndefined();
    expect(await db.goals.get(DEL_GOAL.id)).toBeUndefined();
    expect(await db.transactions.get(LIVE_TX.id)).toBeUndefined();
    // Va tuyet doi khong co viec xoa mo coi nao nam lai trong outbox.
    expect(await db.outbox.count()).toBe(0);
  });

  it("cài đặt mới (chưa đăng nhập): khôi phục tombstone nhưng không xếp việc nào", async () => {
    const payload = await buildV4Payload();

    await importBackup(payload);

    expect((await db.transactions.get(DEL_TX.id))?.deletedAt).toBeTruthy();
    // May chu chua bao gio biet cac dong nay, nen khong co gi de xoa.
    expect(await db.outbox.count()).toBe(0);
  });
});
