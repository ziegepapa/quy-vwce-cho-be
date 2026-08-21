import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import { APP_RELEASE_VERSION } from "./appVersion";
import { validateBackupPayload } from "./backupSchema";
import { db, exportBackup } from "./db";
import { defaultSettings } from "./defaults";
import {
  BACKUP_PORTABLE_DOMAINS,
  BACKUP_SCHEMA_VERSION,
  DEXIE_DB_VERSION,
  VWCE_ISIN,
} from "./types";

const T = "2026-08-21T12:00:00.000Z";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

describe("H3 backup metadata envelope", () => {
  it("exports independent app/backup/Dexie version labels with an exact portable-domain manifest", async () => {
    await db.transactions.bulkPut([
      { id: "tx-live", date: "2026-08-01", type: "cash_in", amount: 100, notes: "fixture", createdAt: T, updatedAt: T, source: "manual" },
      { id: "tx-deleted", date: "2026-08-02", type: "cash_out", amount: 25, notes: "fixture", createdAt: T, updatedAt: T, source: "manual", deletedAt: T },
    ]);
    await db.goals.bulkPut([
      { id: "goal-live", name: "Fixture", dueDate: "2030-01-01", amount: 1000, mode: "nominal", baseYear: 2026, inflationRate: 0.02, bufferPct: 0.1, urgency: "hard", protectedAmount: 0, notes: "", createdAt: T, updatedAt: T },
      { id: "goal-deleted", name: "Deleted", dueDate: "2031-01-01", amount: 500, mode: "nominal", baseYear: 2026, inflationRate: 0.02, bufferPct: 0.1, urgency: "hard", protectedAmount: 0, notes: "", createdAt: T, updatedAt: T, deletedAt: T },
    ]);
    await db.annualChecklists.put({ id: "check-2026", year: 2026, items: [], createdAt: T, updatedAt: T });
    await db.monthlySnapshots.put({ id: "snapshot-2026-08", year: 2026, month: 8, vwceValue: 100, cashValue: 50, totalValue: 150, contributed: 100, withdrawn: 25, createdAt: T, updatedAt: T });
    await db.instruments.put({ isin: VWCE_ISIN, name: "VWCE", currency: "EUR", createdAt: T, updatedAt: T });
    await db.quotes.put({ id: `${VWCE_ISIN}-EUR`, instrumentIsin: VWCE_ISIN, currency: "EUR", price: 100, asOf: "2026-08-20", source: "auto", createdAt: T, updatedAt: T });
    await db.quoteCandidates.put({ id: `${VWCE_ISIN}-EUR-auto`, instrumentIsin: VWCE_ISIN, currency: "EUR", source: "auto", price: 100, asOf: "2026-08-20", createdAt: T, updatedAt: T });
    await db.quotePreferences.put({ id: `${VWCE_ISIN}-EUR`, instrumentIsin: VWCE_ISIN, currency: "EUR", mode: "auto", createdAt: T, updatedAt: T });

    const backup = await exportBackup();

    expect(backup.metadata).toEqual({
      backupSchemaVersion: BACKUP_SCHEMA_VERSION,
      appReleaseVersion: APP_RELEASE_VERSION,
      dexieSchemaVersion: DEXIE_DB_VERSION,
      supportedDomains: [...BACKUP_PORTABLE_DOMAINS],
      recordCounts: {
        settings: 1,
        goals: 1,
        transactions: 1,
        annualChecklists: 1,
        monthlySnapshots: 1,
        instruments: 1,
        quotes: 1,
        quoteCandidates: 1,
        quotePreferences: 1,
        deletedGoals: 1,
        deletedTransactions: 1,
      },
    });
    expect(validateBackupPayload(backup)).toEqual({ ok: true, payload: backup });
  });

  it("fails closed on additive metadata inconsistency but continues accepting pre-H3 v4 payloads", async () => {
    const backup = await exportBackup();
    const legacyV4 = { ...backup, metadata: undefined };
    expect(validateBackupPayload(legacyV4).ok).toBe(true);

    const mismatchedCount = {
      ...backup,
      metadata: {
        ...backup.metadata!,
        recordCounts: { ...backup.metadata!.recordCounts, transactions: 999 },
      },
    };
    const result = validateBackupPayload(mismatchedCount);
    expect(result).toEqual({
      ok: false,
      error: "Backup metadata không hợp lệ: recordCounts.transactions không khớp payload",
    });
  });
});
