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
  importBackup,
  getSettings,
  saveSettings,
} from "./db";
import { nowIso, uid } from "./defaults";
import type { Transaction, Goal, DepotStatement, AppSettings } from "./types";
import { VWCE_ISIN } from "./types";

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

function sampleDepot(partial: Partial<DepotStatement> = {}): DepotStatement {
  const t = nowIso();
  return {
    id: uid("depot"),
    statementId: "stmt-1",
    date: "2024-06-15",
    broker: "trade_republic",
    positions: [
      {
        instrumentIsin: VWCE_ISIN,
        quantity: 10,
        currency: "EUR",
      },
    ],
    source: "trade_republic_pdf",
    sourceVersion: 1,
    createdAt: t,
    updatedAt: t,
    ...partial,
  };
}

function minimalSettings(partial: Partial<AppSettings> = {}): AppSettings {
  const t = nowIso();
  return {
    id: "settings",
    planName: "Test",
    childName: "Be",
    accountType: "parent",
    currency: "EUR",
    inflationRate: 0.02,
    vwceReturn: 0.07,
    safeReturn: 0.02,
    bufferPct: 0.1,
    endMode: "hard",
    startDate: "2024-01-01",
    endDate: "2042-01-01",
    latestVwcePrice: 100,
    latestPriceDate: "2024-06-01",
    contributionY1: 100,
    contributionY2: 100,
    disclaimerAccepted: true,
    onboardingDone: true,
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

  it("exportBackup strips soft-deleted depotStatements nested in settings", async () => {
    await db.settings.clear();
    const live = sampleDepot({ id: "depot_live", statementId: "LIVE" });
    const dead = sampleDepot({
      id: "depot_dead",
      statementId: "DEAD",
      deletedAt: nowIso(),
    });
    await saveSettings(
      minimalSettings({ depotStatements: [live, dead] }),
      { sync: false },
    );
    const backup = await exportBackup();
    const exported = backup.settings[0]?.depotStatements ?? [];
    expect(exported.map((d) => d.statementId)).toEqual(["LIVE"]);
    expect(exported.every((d) => !d.deletedAt)).toBe(true);
  });

  it("importBackup does not revive soft-deleted depotStatements from old files", async () => {
    await db.settings.clear();
    await db.transactions.clear();
    await db.goals.clear();
    await db.appMetadata.clear();
    await db.instruments.clear();
    await db.quotes.clear();
    await db.quoteCandidates.clear();
    await db.quotePreferences.clear();

    const live = sampleDepot({ id: "depot_live", statementId: "LIVE" });
    const dead = sampleDepot({
      id: "depot_dead",
      statementId: "DEAD",
      deletedAt: nowIso(),
    });
    // Simulate an old backup that still embedded tombstones.
    const dirtyPayload = await exportBackup();
    dirtyPayload.schemaVersion = 3;
    // This fixture represents a file emitted before H3; metadata did not exist
    // then and must not be carried across a hand-edited schema simulation.
    delete dirtyPayload.metadata;
    dirtyPayload.settings = [
      minimalSettings({ depotStatements: [live, dead] }),
    ];

    await importBackup(dirtyPayload);
    const settings = await getSettings();
    const restored = settings.depotStatements ?? [];
    expect(restored.map((d) => d.statementId)).toEqual(["LIVE"]);
    expect(restored.every((d) => !d.deletedAt)).toBe(true);
  });

  it("export then import round-trip never revives depot tombstones", async () => {
    await db.settings.clear();
    const live = sampleDepot({ id: "depot_live", statementId: "LIVE" });
    const dead = sampleDepot({
      id: "depot_dead",
      statementId: "DEAD",
      deletedAt: nowIso(),
    });
    await saveSettings(
      minimalSettings({ depotStatements: [live, dead] }),
      { sync: false },
    );

    const backup = await exportBackup();
    expect((backup.settings[0]?.depotStatements ?? []).map((d) => d.statementId)).toEqual([
      "LIVE",
    ]);

    await db.settings.clear();
    await importBackup(backup);
    const after = await getSettings();
    expect((after.depotStatements ?? []).map((d) => d.statementId)).toEqual(["LIVE"]);
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
