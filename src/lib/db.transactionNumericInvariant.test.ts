import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  exportBackup,
  importBackup,
  upsertTransaction,
} from "./db";
import { nowIso } from "./defaults";
import type { Transaction } from "./types";

function transaction(partial: Partial<Transaction> = {}): Transaction {
  const t = nowIso();
  return {
    id: "tx-valid",
    date: "2026-08-13",
    type: "cash_in",
    amount: 100,
    notes: "numeric invariant",
    createdAt: t,
    updatedAt: t,
    ...partial,
  };
}

beforeEach(async () => {
  await db.transactions.clear();
  await db.outbox.clear();
});

describe("transaction numeric write boundary", () => {
  it("rejects every non-finite numeric field before IndexedDB or outbox changes", async () => {
    const cases = [
      { field: "amount", value: Number.NaN },
      { field: "unitPrice", value: Number.POSITIVE_INFINITY },
      { field: "quantity", value: Number.NaN },
      { field: "fee", value: Number.NEGATIVE_INFINITY },
      { field: "tax", value: Number.NaN },
      { field: "sourceVersion", value: Number.POSITIVE_INFINITY },
      { field: "version", value: Number.NaN },
    ] as const;

    for (const { field, value } of cases) {
      const malformed = {
        ...transaction({ id: `tx-${field}` }),
        [field]: value,
      } as Transaction;
      await expect(upsertTransaction(malformed)).rejects.toThrow(
        `${field} phải là số hữu hạn`,
      );
    }

    expect(await db.transactions.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it("rejects negative quantity before IndexedDB or outbox changes", async () => {
    await expect(
      upsertTransaction(
        transaction({
          id: "tx-negative-quantity",
          type: "buy_vwce",
          amount: 100,
          unitPrice: 50,
          quantity: -2,
        }),
      ),
    ).rejects.toThrow("quantity không được âm");

    expect(await db.transactions.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it("keeps signed adjust amounts valid", async () => {
    await upsertTransaction(
      transaction({ id: "tx-adjust", type: "adjust", amount: -25, notes: "Đối soát" }),
      { sync: false },
    );

    expect((await db.transactions.get("tx-adjust"))?.amount).toBe(-25);
  });

  it("rejects an invalid transaction backup before replacing existing data", async () => {
    await upsertTransaction(transaction({ id: "tx-keep" }), { sync: false });
    const backup = await exportBackup();
    backup.transactions = [
      transaction({
        id: "tx-bad-backup",
        type: "buy_vwce",
        amount: 100,
        unitPrice: 50,
        quantity: -1,
      }),
    ];

    await expect(importBackup(backup)).rejects.toThrow("quantity không được âm");

    expect(await db.transactions.count()).toBe(1);
    expect(await db.transactions.get("tx-keep")).toBeTruthy();
    expect(await db.transactions.get("tx-bad-backup")).toBeUndefined();
  });
});
