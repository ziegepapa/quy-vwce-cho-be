/**
 * A3 + C3 — soft delete local và chống nhập trùng externalRef.
 * Phải polyfill IndexedDB TRƯỚC khi import db (Dexie khởi tạo ngay khi load module).
 */
import "fake-indexeddb/auto";

import { describe, expect, it, beforeEach } from "vitest";
import {
  db,
  deleteTransaction,
  deleteGoal,
  listTransactions,
  listGoals,
  upsertTransaction,
  upsertGoal,
  findTransactionByExternalRef,
  countLocalData,
  exportBackup,
} from "./db";
import { nowIso, uid } from "./defaults";
import type { Transaction, Goal } from "./types";

async function clearTxGoal() {
  await db.transactions.clear();
  await db.goals.clear();
  await db.outbox.clear();
}

function sampleTx(partial: Partial<Transaction> = {}): Transaction {
  const t = nowIso();
  return {
    id: uid("tx"),
    date: "2024-06-01",
    type: "buy_vwce",
    amount: 100,
    unitPrice: 50,
    quantity: 2,
    fee: 0,
    tax: 0,
    notes: "manual",
    createdAt: t,
    updatedAt: t,
    ...partial,
  };
}

function sampleGoal(partial: Partial<Goal> = {}): Goal {
  const t = nowIso();
  return {
    id: uid("goal"),
    name: "Test",
    dueDate: "2030-01-01",
    amount: 1000,
    mode: "nominal",
    baseYear: 2024,
    inflationRate: 0.02,
    bufferPct: 0.1,
    urgency: "hard",
    protectedAmount: 0,
    notes: "",
    createdAt: t,
    updatedAt: t,
    ...partial,
  };
}

describe("A3 soft delete", () => {
  beforeEach(async () => {
    await clearTxGoal();
  });

  it("deleteTransaction hides from list but keeps tombstone", async () => {
    const tx = sampleTx();
    await upsertTransaction(tx, { sync: false });
    expect((await listTransactions()).length).toBe(1);
    await deleteTransaction(tx.id, { sync: false });
    expect((await listTransactions()).length).toBe(0);
    const raw = await db.transactions.get(tx.id);
    expect(raw).toBeTruthy();
    expect(raw!.deletedAt).toBeTruthy();
  });

  it("deleteGoal hides from list but keeps tombstone", async () => {
    const g = sampleGoal();
    await upsertGoal(g, { sync: false });
    expect((await listGoals()).length).toBe(1);
    await deleteGoal(g.id, { sync: false });
    expect((await listGoals()).length).toBe(0);
    const raw = await db.goals.get(g.id);
    expect(raw).toBeTruthy();
    expect(raw!.deletedAt).toBeTruthy();
  });

  it("countLocalData and exportBackup ignore tombstones", async () => {
    const tx = sampleTx();
    await upsertTransaction(tx, { sync: false });
    await deleteTransaction(tx.id, { sync: false });
    const counts = await countLocalData();
    expect(counts.transactions).toBe(0);
    const backup = await exportBackup();
    expect(backup.transactions.length).toBe(0);
  });

  it("upsertTransaction clears deletedAt when re-saving active record", async () => {
    const tx = sampleTx();
    await upsertTransaction(tx, { sync: false });
    await deleteTransaction(tx.id, { sync: false });
    const tomb = await db.transactions.get(tx.id);
    expect(tomb?.deletedAt).toBeTruthy();
    await upsertTransaction({ ...tx, notes: "revived" }, { sync: false });
    const live = await db.transactions.get(tx.id);
    expect(live?.deletedAt).toBeUndefined();
    expect((await listTransactions()).length).toBe(1);
  });
});

describe("C3 externalRef dedup", () => {
  beforeEach(async () => {
    await clearTxGoal();
  });

  it("same externalRef is findable; second insert can be blocked by caller", async () => {
    const ref = "trade_republic:DOC-1";
    const tx = sampleTx({ externalRef: ref, source: "trade_republic_pdf", sourceVersion: 1 });
    await upsertTransaction(tx, { sync: false });
    const found = await findTransactionByExternalRef(ref);
    expect(found?.id).toBe(tx.id);
    const again = await findTransactionByExternalRef(ref);
    expect(again?.id).toBe(tx.id);
  });

  it("different docNumbers both persist", async () => {
    await upsertTransaction(
      sampleTx({ id: "tx_a", externalRef: "trade_republic:A" }),
      { sync: false },
    );
    await upsertTransaction(
      sampleTx({ id: "tx_b", externalRef: "trade_republic:B" }),
      { sync: false },
    );
    expect((await listTransactions()).length).toBe(2);
  });

  it("manual tx without externalRef still lists and works", async () => {
    const tx = sampleTx({ notes: "old manual" });
    delete (tx as { externalRef?: string }).externalRef;
    await upsertTransaction(tx, { sync: false });
    const list = await listTransactions();
    expect(list.length).toBe(1);
    expect(list[0].notes).toBe("old manual");
    expect(list[0].externalRef).toBeUndefined();
  });

  it("findTransactionByExternalRef skips tombstones", async () => {
    const ref = "trade_republic:GONE";
    const tx = sampleTx({ externalRef: ref });
    await upsertTransaction(tx, { sync: false });
    await deleteTransaction(tx.id, { sync: false });
    expect(await findTransactionByExternalRef(ref)).toBeUndefined();
  });
});
