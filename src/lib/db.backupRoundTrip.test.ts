import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllData,
  countLocalData,
  db,
  exportBackup,
  getSettings,
  importBackup,
  listTransactions,
  saveSettings,
  upsertTransaction,
} from "./db";
import { defaultSettings } from "./defaults";
import type { BackupPayload, Transaction } from "./types";

const TX: Transaction = {
  id: "tx_backup_round_trip",
  date: "2026-08-13",
  type: "cash_in",
  amount: 123.45,
  notes: "backup round-trip sentinel",
  createdAt: "2026-08-13T12:00:00.000Z",
  updatedAt: "2026-08-13T12:00:00.000Z",
  source: "manual",
};

const EXPECTED_TX = {
  id: TX.id,
  date: TX.date,
  type: TX.type,
  amount: TX.amount,
  notes: TX.notes,
  createdAt: TX.createdAt,
  source: TX.source,
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

describe("backup export/import durability", () => {
  it("restores settings and transactions after a JSON file boundary and database reopen", async () => {
    await saveSettings(
      { planName: "Round-trip plan", onboardingDone: true },
      { sync: false },
    );
    await upsertTransaction(TX, { sync: false });

    const exported = await exportBackup();
    const filePayload = JSON.parse(JSON.stringify(exported)) as BackupPayload;

    await clearAllData();
    expect(await countLocalData()).toMatchObject({ settings: 0, transactions: 0 });

    await importBackup(filePayload);

    // Simulate closing and reopening the app after restore.
    db.close();
    await db.open();

    const settings = await getSettings();
    const transactions = await listTransactions();

    expect(settings.planName).toBe("Round-trip plan");
    expect(settings.onboardingDone).toBe(true);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject(EXPECTED_TX);
  });

  it("rejects an unsupported schema before replacing existing local data", async () => {
    await saveSettings({ planName: "Keep existing data" }, { sync: false });
    await upsertTransaction(TX, { sync: false });

    const unsupported = {
      ...(await exportBackup()),
      schemaVersion: 999,
      settings: [],
      transactions: [],
    } as BackupPayload;

    await expect(importBackup(unsupported)).rejects.toThrow(/schemaVersion/);

    expect((await getSettings()).planName).toBe("Keep existing data");
    const transactions = await listTransactions();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject(EXPECTED_TX);
  });
});
