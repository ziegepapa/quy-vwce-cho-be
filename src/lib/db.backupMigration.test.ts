import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  getQuoteForIsin,
  getSettings,
  importBackup,
  isQuoteMigrationComplete,
  listGoals,
  listTransactions,
  runPendingMigrations,
} from "./db";
import { defaultSettings } from "./defaults";
import type { BackupPayload, Goal, Transaction } from "./types";
import { VWCE_ISIN } from "./types";

const T = "2026-08-13T12:00:00.000Z";

const LEGACY_TX: Transaction = {
  id: "legacy_buy_vwce",
  date: "2024-06-01",
  type: "buy_vwce",
  amount: 100,
  unitPrice: 50,
  quantity: 2,
  fee: 0,
  tax: 0,
  notes: "schema v1 transaction without instrumentIsin",
  createdAt: T,
  updatedAt: T,
};

const LEGACY_GOAL: Goal = {
  id: "legacy_goal",
  name: "Legacy education goal",
  dueDate: "2038-09-01",
  amount: 12_000,
  mode: "nominal",
  baseYear: 2024,
  inflationRate: 0.02,
  bufferPct: 0.1,
  urgency: "hard",
  protectedAmount: 500,
  notes: "must survive restore and migration",
  createdAt: T,
  updatedAt: T,
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("legacy backup migration durability", () => {
  it("restores schema v1 records, migrates VWCE fields, and remains idempotent after reopen", async () => {
    const legacy: BackupPayload = {
      schemaVersion: 1,
      exportedAt: T,
      settings: [
        {
          ...defaultSettings(),
          planName: "Legacy family plan",
          onboardingDone: true,
          latestVwcePrice: 142.5,
          latestPriceDate: "2026-07-31",
          createdAt: T,
          updatedAt: T,
        },
      ],
      goals: [LEGACY_GOAL],
      transactions: [LEGACY_TX],
      annualChecklists: [],
      monthlySnapshots: [],
    };

    await importBackup(legacy);
    await runPendingMigrations();
    await runPendingMigrations();

    db.close();
    await db.open();

    const settings = await getSettings();
    const goals = await listGoals();
    const transactions = await listTransactions();
    const rawTransaction = await db.transactions.get(LEGACY_TX.id);
    const quote = await getQuoteForIsin(VWCE_ISIN);

    expect(settings.planName).toBe("Legacy family plan");
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({
      id: LEGACY_GOAL.id,
      name: LEGACY_GOAL.name,
      amount: LEGACY_GOAL.amount,
      protectedAmount: LEGACY_GOAL.protectedAmount,
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      id: LEGACY_TX.id,
      amount: LEGACY_TX.amount,
      quantity: LEGACY_TX.quantity,
      instrumentIsin: VWCE_ISIN,
    });
    expect(rawTransaction?.instrumentIsin).toBe(VWCE_ISIN);
    expect(await db.instruments.get(VWCE_ISIN)).toBeDefined();
    expect(quote).toMatchObject({
      instrumentIsin: VWCE_ISIN,
      price: 142.5,
      asOf: "2026-07-31",
      source: "manual",
    });
    expect(await isQuoteMigrationComplete()).toBe(true);
  });
});
