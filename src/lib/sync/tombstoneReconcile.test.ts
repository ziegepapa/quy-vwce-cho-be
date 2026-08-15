/**
 * PR3 -- va lai khoang trong giua tombstone va outbox.
 *
 * Mot tombstone khong co viec "delete" trong outbox la mot dong da xoa ma may chu
 * khong bao gio duoc bao. Lan dong bo ke tiep se keo dong van con song tren may
 * chu ve va dong do song lai. Khoang trong nay co the sinh ra tu nhieu duong:
 * import v4 cu (enqueue nam ngoai transaction), tien trinh chet giua hai buoc, hoac
 * mot ban sao luu duoc khoi phuc tren thiet bi khac.
 *
 * `reconcileTombstoneOutbox` chay o dau moi lan dong bo va phai:
 *  - tombstone KHONG co item nao  => xep dung MOT viec "delete";
 *  - tombstone DA co item bat ky   => GIU NGUYEN item do, khong dung toi.
 *
 * Dieu kien thu hai la thiet yeu: `enqueueOutbox` goi `removeOutboxForEntity`
 * truoc tien, nen mot lan xep de dai se xoa mat item `recover` hoac `upsert`
 * dang cho cua chinh dong do.
 *
 * Import truc tiep tu db.m01a va ./outbox de khong keo supabase vao test.
 * Phai polyfill IndexedDB TRUOC khi import db.
 */
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db.m01a";
import { enqueueOutbox } from "./outbox";
import { reconcileTombstoneOutbox } from "./tombstoneReconcile";

const T = "2026-08-15T10:00:00.000Z";
const USER_ID = "reconcile-owner-1";

function tx(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    date: "2026-08-15",
    type: "cash_in",
    amount: 50,
    notes: "",
    createdAt: T,
    updatedAt: T,
    source: "manual",
    version: 3,
    ...extra,
  } as never;
}

function goal(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: "Mục tiêu",
    dueDate: "2032-01-01",
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
    version: 7,
    ...extra,
  } as never;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("reconcileTombstoneOutbox -- không làm gì khi không cần", () => {
  it("chưa đăng nhập thì không đụng vào gì", async () => {
    await db.transactions.put(tx("recon_tx_no_user", { deletedAt: T }));

    expect(await reconcileTombstoneOutbox(null)).toEqual({ enqueued: 0, preserved: 0 });
    expect(await reconcileTombstoneOutbox(undefined)).toEqual({ enqueued: 0, preserved: 0 });
    expect(await db.outbox.count()).toBe(0);
  });

  it("bỏ qua dòng còn sống", async () => {
    await db.transactions.put(tx("recon_tx_live"));
    await db.goals.put(goal("recon_goal_live"));

    expect(await reconcileTombstoneOutbox(USER_ID)).toEqual({ enqueued: 0, preserved: 0 });
    expect(await db.outbox.count()).toBe(0);
  });
});

describe("reconcileTombstoneOutbox -- vá tombstone mồ côi", () => {
  it("xếp đúng MỘT việc xoá, mang theo version của chính tombstone", async () => {
    await db.transactions.put(tx("recon_tx_orphan", { deletedAt: T }));

    expect(await reconcileTombstoneOutbox(USER_ID)).toEqual({ enqueued: 1, preserved: 0 });

    const items = await db.outbox.toArray();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      table: "transactions",
      entityId: "recon_tx_orphan",
      op: "delete",
      version: 3,
    });
  });

  it("vá cả hai bảng trong một lần chạy", async () => {
    await db.transactions.put(tx("recon_tx_both", { deletedAt: T }));
    await db.goals.put(goal("recon_goal_both", { deletedAt: T }));

    expect(await reconcileTombstoneOutbox(USER_ID)).toEqual({ enqueued: 2, preserved: 0 });

    const items = await db.outbox.toArray();
    expect(items).toHaveLength(2);
    expect(items.map((item) => `${item.table}:${item.op}`).sort()).toEqual([
      "goals:delete",
      "transactions:delete",
    ]);
    expect(items.find((item) => item.table === "goals")?.version).toBe(7);
  });

  it("chạy hai lần vẫn chỉ có một việc -- đúng nghĩa idempotent", async () => {
    await db.transactions.put(tx("recon_tx_twice", { deletedAt: T }));

    await reconcileTombstoneOutbox(USER_ID);
    const first = await db.outbox.toArray();
    expect(await reconcileTombstoneOutbox(USER_ID)).toEqual({ enqueued: 0, preserved: 1 });
    const second = await db.outbox.toArray();

    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].createdAt).toBe(first[0].createdAt);
  });

  it("vá đúng tình huống thật: sao lưu khôi phục tombstone nhưng outbox rỗng", async () => {
    await db.transactions.put(tx("recon_tx_restored", { deletedAt: T }));
    await db.goals.put(goal("recon_goal_restored", { deletedAt: T }));
    await db.goals.put(goal("recon_goal_alive"));
    expect(await db.outbox.count()).toBe(0);

    expect(await reconcileTombstoneOutbox(USER_ID)).toEqual({ enqueued: 2, preserved: 0 });

    const ids = (await db.outbox.toArray()).map((item) => item.entityId).sort();
    expect(ids).toEqual(["recon_goal_restored", "recon_tx_restored"]);
  });
});

describe("reconcileTombstoneOutbox -- giữ nguyên việc đang chờ", () => {
  it("giữ nguyên việc xoá đã có sẵn", async () => {
    await db.transactions.put(tx("recon_tx_has_delete", { deletedAt: T }));
    await enqueueOutbox("transactions", "recon_tx_has_delete", "delete", null, 9);
    const before = await db.outbox.toArray();

    expect(await reconcileTombstoneOutbox(USER_ID)).toEqual({ enqueued: 0, preserved: 1 });

    expect(await db.outbox.toArray()).toEqual(before);
  });

  it("giữ nguyên việc upsert đang chờ, không biến nó thành việc xoá", async () => {
    await db.transactions.put(tx("recon_tx_has_upsert", { deletedAt: T }));
    await enqueueOutbox(
      "transactions",
      "recon_tx_has_upsert",
      "upsert",
      { id: "recon_tx_has_upsert", notes: "chưa đẩy" },
      4,
    );
    const before = await db.outbox.toArray();
    expect(before).toHaveLength(1);

    expect(await reconcileTombstoneOutbox(USER_ID)).toEqual({ enqueued: 0, preserved: 1 });

    const after = await db.outbox.toArray();
    expect(after).toHaveLength(1);
    expect(after).toEqual(before);
    expect(after[0].op).toBe("upsert");
  });

  it("giữ nguyên việc recover đang chờ -- không được đụng vào phiên khôi phục", async () => {
    await db.transactions.put(tx("recon_tx_has_recover", { deletedAt: T }));
    await db.outbox.put({
      id: "ob_recon_recover",
      table: "transactions",
      entityId: "recon_tx_has_recover",
      op: "recover",
      payload: { id: "recon_tx_has_recover", notes: "khôi phục" },
      recoverySessionId: "session-reconcile",
      sourceLocalVersion: 2,
      createAttempted: true,
      createdAt: T,
      attempts: 1,
    } as never);
    const before = await db.outbox.toArray();

    expect(await reconcileTombstoneOutbox(USER_ID)).toEqual({ enqueued: 0, preserved: 1 });

    expect(await db.outbox.toArray()).toEqual(before);
    expect((await db.outbox.get("ob_recon_recover"))?.op).toBe("recover");
  });

  it("một tombstone mồ côi và một tombstone đã có việc: vá cái thiếu, giữ cái có", async () => {
    await db.transactions.put(tx("recon_tx_orphan_2", { deletedAt: T }));
    await db.goals.put(goal("recon_goal_kept", { deletedAt: T }));
    await enqueueOutbox(
      "goals",
      "recon_goal_kept",
      "upsert",
      { id: "recon_goal_kept" },
      5,
    );

    expect(await reconcileTombstoneOutbox(USER_ID)).toEqual({ enqueued: 1, preserved: 1 });

    const items = await db.outbox.toArray();
    expect(items).toHaveLength(2);
    expect(items.find((item) => item.entityId === "recon_goal_kept")?.op).toBe("upsert");
    expect(items.find((item) => item.entityId === "recon_tx_orphan_2")?.op).toBe("delete");
  });
});
