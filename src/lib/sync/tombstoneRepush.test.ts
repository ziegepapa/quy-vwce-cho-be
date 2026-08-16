/**
 * PR4 -- mot lan xoa chi duoc day len may chu DUNG MOT LAN.
 *
 * Loi that, do duoc tren production ngay 16/08/2026: `reconcileTombstoneOutbox`
 * (PR3) khong phan biet duoc "tombstone chua tung duoc bao cho may chu" voi
 * "tombstone da day thanh cong roi". Ca hai deu la: co tombstone, khong co
 * outbox item. Nen no xep lai mot viec "delete" o MOI lan dong bo, mai mai.
 * Mot hang goal that da di tu version 11 len 22 trong 23 phut, va `deleted_at`
 * bi ghi de bang thoi diem hien tai moi lan -- mat luon thoi diem xoa that.
 *
 * `tombstoneReconcile.test.ts` bo sot ca nay vi no chay reconcile hai lan MA
 * KHONG day o giua, nen outbox item con nguyen va nhanh `preserved` che mat loi.
 * File nay day THAT qua supabase gia va DEM so lenh ghi, nen vong lap chi bi
 * bat khi ta di het duong: reconcile -> push -> reconcile.
 *
 * `remoteMock.ops` ghi lai tung lenh (`push:goals`, `pull:goals`), nen so lan
 * ghi la mot con so kiem tra duoc chu khong phai suy doan.
 *
 * PR5 -- them mot truc do thu hai: KHONG chi dem so lan ghi, ma con kiem tra
 * GIA TRI duoc ghi. `pushOne` truoc PR5 gui `nowIso()`, nen moi lan day lai lam
 * sai lech `deleted_at`. Cac test duoi day so mot mot voi hang so cung, thu ma
 * `nowIso()` khong bao gio bang duoc.
 *
 * Phai polyfill IndexedDB TRUOC khi import db.
 */
import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "owner-repush-1";
const NOW = "2026-08-16T08:00:00.000Z";
const DELETED_AT = "2026-08-16T09:00:00.000Z";
const REMOTE_DELETED_AT = "2026-08-16T10:00:00.000Z";
// Moc xoa THAT cua hang goal_619db5f6 tren production. Giu nguyen con so nay
// lam vat chung: chinh no la thu da bi `nowIso()` ghi de mat.
const REAL_DELETED_AT = "2026-08-14T20:03:44.194Z";
// Co y de rat xa trong qua khu: sau lan pull dau tien, `lastPulledAt` thanh
// nowIso() that cua may chay test, nen hang nay khong bao gio bi keo ve lai du
// dong ho CI la ngay nao. Khong co no, mot lan pull thua co the lam ket qua doi
// theo moi truong.
const REMOTE_UPDATED_AT = "2020-01-01T00:00:00.000Z";
// Hai dau de mot dong "song lai" la khong the nham lan trong log that bai.
const LOCAL_ONLY = "TOMBSTONE_KEPT_LOCAL";
const SERVER_COPY = "SERVER_STILL_ALIVE";

const remoteMock = vi.hoisted(() => ({
  failUpdate: false,
  tables: new Map<string, Map<string, Record<string, unknown>>>(),
  ops: [] as string[],
}));

type MockResponse = {
  data: unknown;
  error: { message: string } | null;
};
type MockBuilder = {
  select(): MockBuilder;
  update(next: Record<string, unknown>): MockBuilder;
  eq(column: string, value: unknown): MockBuilder;
  gt(column: string, value: string): MockBuilder;
  order(): Promise<MockResponse>;
  maybeSingle(): Promise<MockResponse>;
  then(resolve: (value: MockResponse) => unknown, reject: (reason: unknown) => unknown): Promise<unknown>;
};

const originalOnlineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");

afterAll(() => {
  if (originalOnlineDescriptor) Object.defineProperty(navigator, "onLine", originalOnlineDescriptor);
  else Reflect.deleteProperty(navigator, "onLine");
});

vi.mock("../supabase", () => {
  const rowsFor = (table: string) => {
    let rows = remoteMock.tables.get(table);
    if (!rows) { rows = new Map(); remoteMock.tables.set(table, rows); }
    return rows;
  };
  const builderFor = (table: string) => {
    let action: "select" | "update" = "select";
    let payload: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};
    let gtFilter: { column: string; value: string } | null = null;
    const matching = () => [...rowsFor(table).values()].filter((row) => {
      if (!Object.entries(filters).every(([k, v]) => row[k] === v)) return false;
      return !gtFilter || String(row[gtFilter.column] ?? "") > gtFilter.value;
    });
    const selectResult = (): MockResponse => ({ data: matching().map((row) => ({ ...row })), error: null });
    const updateResult = (): MockResponse => {
      // Tra loi that bai TRUOC khi ghi vao `ops`: mot lan day hong khong duoc
      // tinh la mot lan ghi len may chu.
      if (remoteMock.failUpdate) return { data: null, error: { message: "update failed" } };
      const rows = matching();
      for (const row of rows) rowsFor(table).set(String(row.id), { ...row, ...payload, version: Number(row.version) + 1 });
      remoteMock.ops.push(`push:${table}`);
      return { data: rows.map((row) => ({ id: row.id })), error: null };
    };
    const builder: MockBuilder = {
      select() { return builder; },
      update(next) { action = "update"; payload = next; return builder; },
      eq(column, value) { filters[column] = value; return builder; },
      gt(column, value) { gtFilter = { column, value }; return builder; },
      order() { remoteMock.ops.push(`pull:${table}`); return Promise.resolve(selectResult()); },
      maybeSingle() {
        const rows = matching().map((row) => ({ ...row }));
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(resolve, reject) {
        const result = action === "update" ? updateResult() : selectResult();
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  };
  return { supabase: { from: (table: string) => builderFor(table) } };
});

import { db } from "../db.m01a";
import { enqueueOutbox, runSync } from "./engine";
import type { EntityTable } from "./types";
import type { Goal, Transaction } from "../types";

type StoredGoal = Goal & { version: number };
type StoredTransaction = Transaction & { version: number };

const REMOTE_TABLE: Record<EntityTable, string> = {
  settings: "app_settings", goals: "goals", transactions: "transactions",
  annualChecklists: "annual_checklists", monthlySnapshots: "monthly_snapshots",
};
function setRemote(table: EntityTable, id: string, data: unknown, version: number, deletedAt: string | null = null) {
  const name = REMOTE_TABLE[table];
  let rows = remoteMock.tables.get(name);
  if (!rows) { rows = new Map(); remoteMock.tables.set(name, rows); }
  rows.set(id, { id, user_id: USER_ID, data, version, updated_at: REMOTE_UPDATED_AT, deleted_at: deletedAt });
}
function remoteRow(table: EntityTable, id: string) { return remoteMock.tables.get(REMOTE_TABLE[table])?.get(id); }
/** So lenh ghi that len mot bang -- con so ma loi nay lam phinh vo han. */
function pushCount(table: EntityTable): number {
  return remoteMock.ops.filter((op) => op === `push:${REMOTE_TABLE[table]}`).length;
}

function transaction(id: string, notes: string): StoredTransaction {
  return { id, date: "2026-08-16", type: "adjust", amount: 50, notes, createdAt: NOW, updatedAt: NOW, version: 2 };
}
function goal(id: string, notes: string): StoredGoal {
  return {
    id, name: "Muc tieu", dueDate: "2030-01-01", amount: 1000, mode: "nominal", baseYear: 2026,
    inflationRate: 2, bufferPct: 10, urgency: "flexible", protectedAmount: 0, notes,
    createdAt: NOW, updatedAt: NOW, version: 2,
  };
}
// Dung trang thai that tren may Owner: tombstone nam trong IndexedDB, outbox
// RONG -- viec "delete" da duoc day xong tu truoc va bi xoa khoi outbox.
function transactionTombstone(id: string): StoredTransaction {
  return { ...transaction(id, LOCAL_ONLY), deletedAt: DELETED_AT, updatedAt: DELETED_AT, version: 3 };
}
function goalTombstone(id: string): StoredGoal {
  return { ...goal(id, LOCAL_ONLY), deletedAt: DELETED_AT, updatedAt: DELETED_AT, version: 3 };
}

beforeEach(async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  remoteMock.failUpdate = false;
  remoteMock.tables.clear();
  remoteMock.ops.length = 0;
  await db.delete();
  await db.open();
});

describe("một lần xoá chỉ được đẩy lên máy chủ đúng một lần", () => {
  it("goal: ba lần đồng bộ liên tiếp chỉ ghi lên máy chủ MỘT lần", async () => {
    await db.goals.put(goalTombstone("goal-repush"));
    setRemote("goals", "goal-repush", goal("goal-repush", SERVER_COPY), 4);
    expect(await db.outbox.count()).toBe(0);

    await runSync(USER_ID);
    await runSync(USER_ID);
    await runSync(USER_ID);

    // Truoc PR4 con so nay la 3: moi lan dong bo mot lenh UPDATE thua.
    expect(pushCount("goals")).toBe(1);
    expect(remoteRow("goals", "goal-repush")?.version).toBe(5);
    // PR5: dung mot lan ghi, va ghi dung moc xoa that.
    expect(remoteRow("goals", "goal-repush")?.deleted_at).toBe(DELETED_AT);
    expect(await db.outbox.count()).toBe(0);

    const local = await db.goals.get("goal-repush");
    expect(local?.deletedAt).toBe(DELETED_AT);
    expect(local?.notes).toBe(LOCAL_ONLY);
    expect(typeof local?.deleteSyncedAt).toBe("string");
  });

  it("transaction: ba lần đồng bộ liên tiếp chỉ ghi lên máy chủ MỘT lần", async () => {
    await db.transactions.put(transactionTombstone("tx-repush"));
    setRemote("transactions", "tx-repush", transaction("tx-repush", SERVER_COPY), 4);

    await runSync(USER_ID);
    await runSync(USER_ID);
    await runSync(USER_ID);

    expect(pushCount("transactions")).toBe(1);
    expect(remoteRow("transactions", "tx-repush")?.version).toBe(5);
    expect(remoteRow("transactions", "tx-repush")?.deleted_at).toBe(DELETED_AT);
    expect(await db.outbox.count()).toBe(0);

    const local = await db.transactions.get("tx-repush");
    expect(local?.deletedAt).toBe(DELETED_AT);
    expect(local?.notes).toBe(LOCAL_ONLY);
    expect(typeof local?.deleteSyncedAt).toBe("string");
  });
});

describe("dấu xác nhận không được che một lần đẩy hỏng", () => {
  it("đẩy thất bại thì KHÔNG đánh dấu -- lần sau vẫn chữa tiếp, và chỉ một lần", async () => {
    await db.goals.put(goalTombstone("goal-retry"));
    setRemote("goals", "goal-retry", goal("goal-retry", SERVER_COPY), 4);

    remoteMock.failUpdate = true;
    await runSync(USER_ID);

    expect(pushCount("goals")).toBe(0);
    expect((await db.goals.get("goal-retry"))?.deleteSyncedAt).toBeUndefined();
    expect(remoteRow("goals", "goal-retry")?.deleted_at).toBeNull();
    // Viec xoa phai o lai outbox, neu khong may chu se khong bao gio biet.
    expect(await db.outbox.count()).toBe(1);

    remoteMock.failUpdate = false;
    await runSync(USER_ID);

    expect(pushCount("goals")).toBe(1);
    expect(typeof (await db.goals.get("goal-retry"))?.deleteSyncedAt).toBe("string");
    expect(await db.outbox.count()).toBe(0);

    await runSync(USER_ID);
    await runSync(USER_ID);

    expect(pushCount("goals")).toBe(1);
  });
});

describe("kéo về một dòng máy chủ đã xoá", () => {
  it("đánh dấu ngay khi kéo về -- không tốn lần ghi nào", async () => {
    // Thiet bi thu hai: hang van CON SONG cuc bo, may chu da xoa. Truoc PR4,
    // pull tao tombstone khong dau, roi lan dong bo ke tiep reconciler xep mot
    // viec "delete" thua -- mot lan ghi vo ich tren MOI thiet bi.
    await db.goals.put(goal("goal-pulled", LOCAL_ONLY));
    setRemote("goals", "goal-pulled", goal("goal-pulled", SERVER_COPY), 6, REMOTE_DELETED_AT);

    await runSync(USER_ID);

    const local = await db.goals.get("goal-pulled");
    expect(local?.deletedAt).toBe(REMOTE_DELETED_AT);
    expect(typeof local?.deleteSyncedAt).toBe("string");

    await runSync(USER_ID);
    await runSync(USER_ID);

    expect(pushCount("goals")).toBe(0);
    expect(remoteRow("goals", "goal-pulled")?.version).toBe(6);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe("PR5 -- mốc gửi lên là thời điểm xoá THẬT, không phải thời điểm đẩy", () => {
  it("goal xoá từ 14/08 vẫn lên máy chủ đúng mốc 14/08", async () => {
    // Dung lai ca that: tombstone nam cho hai ngay roi moi len duoc may chu.
    await db.goals.put({ ...goalTombstone("goal-real"), deletedAt: REAL_DELETED_AT, updatedAt: REAL_DELETED_AT });
    setRemote("goals", "goal-real", goal("goal-real", SERVER_COPY), 11);

    await runSync(USER_ID);

    expect(pushCount("goals")).toBe(1);
    // Mot hang so cung: `nowIso()` khong the nao bang duoc gia tri nay.
    expect(remoteRow("goals", "goal-real")?.deleted_at).toBe(REAL_DELETED_AT);
  });

  it("transaction cũng gửi đúng mốc xoá của chính nó", async () => {
    await db.transactions.put({ ...transactionTombstone("tx-real"), deletedAt: REAL_DELETED_AT, updatedAt: REAL_DELETED_AT });
    setRemote("transactions", "tx-real", transaction("tx-real", SERVER_COPY), 4);

    await runSync(USER_ID);

    expect(pushCount("transactions")).toBe(1);
    expect(remoteRow("transactions", "tx-real")?.deleted_at).toBe(REAL_DELETED_AT);
  });

  it("đẩy hỏng rồi đẩy lại: mốc vẫn là mốc xoá thật, không phải mốc thử lại", async () => {
    await db.goals.put({ ...goalTombstone("goal-real-retry"), deletedAt: REAL_DELETED_AT, updatedAt: REAL_DELETED_AT });
    setRemote("goals", "goal-real-retry", goal("goal-real-retry", SERVER_COPY), 4);

    remoteMock.failUpdate = true;
    await runSync(USER_ID);
    expect(pushCount("goals")).toBe(0);

    remoteMock.failUpdate = false;
    await runSync(USER_ID);

    expect(pushCount("goals")).toBe(1);
    expect(remoteRow("goals", "goal-real-retry")?.deleted_at).toBe(REAL_DELETED_AT);
  });

  it("không còn dòng cục bộ thì vẫn ghi một mốc hợp lệ, không ghi null", async () => {
    // Viec "delete" mo coi: hang cuc bo da bien mat (vi du sau mot lan nhap sao
    // luu). Khong con gi de doc, nen nowIso() la muc du phong dung -- nhung
    // TUYET DOI khong duoc gui null, vi null nghia la "chua xoa" va se lam dong
    // da xoa song lai tren moi thiet bi khac.
    setRemote("goals", "goal-gone", goal("goal-gone", SERVER_COPY), 4);
    await enqueueOutbox("goals", "goal-gone", "delete", null, 3);
    expect(await db.goals.get("goal-gone")).toBeUndefined();

    await runSync(USER_ID);

    expect(pushCount("goals")).toBe(1);
    expect(typeof remoteRow("goals", "goal-gone")?.deleted_at).toBe("string");
    expect(await db.outbox.count()).toBe(0);
  });
});
