import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  exportBackup,
  importBackup,
  upsertTransaction,
} from "./db";
import { replayTransactions } from "./calc";
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
    source: "manual",
    ...partial,
  };
}

beforeEach(async () => {
  await db.transactions.clear();
  await db.outbox.clear();
});

describe("transaction numeric and semantic write boundary", () => {
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

  it("rejects negative quantity at the strict public write boundary", async () => {
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
    ).rejects.toThrow("INVALID_QUANTITY");

    expect(await db.transactions.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it("rejects a new oversell against canonical holdings without mutating ledger or outbox", async () => {
    await upsertTransaction(
      transaction({
        id: "tx-held-buy",
        date: "2026-08-01",
        type: "buy_vwce",
        amount: 200,
        unitPrice: 100,
        quantity: 2,
      }),
      { sync: false },
    );

    await expect(
      upsertTransaction(
        transaction({
          id: "tx-oversell",
          date: "2026-08-02",
          type: "sell_vwce",
          amount: 300,
          quantity: 3,
        }),
        { sync: false },
      ),
    ).rejects.toThrow("OVERSOLD");

    expect((await db.transactions.toArray()).map((row) => row.id)).toEqual(["tx-held-buy"]);
    expect(await db.outbox.count()).toBe(0);
    expect(replayTransactions(await db.transactions.toArray())).toMatchObject({
      vwceQty: 2,
      cashBalance: -200,
      totalSold: 0,
    });
  });

  it("keeps signed adjust amounts valid", async () => {
    await upsertTransaction(
      transaction({ id: "tx-adjust", type: "adjust", amount: -25, notes: "Đối soát" }),
      { sync: false },
    );

    expect((await db.transactions.get("tx-adjust"))?.amount).toBe(-25);
  });

  it("restores finite unsafe legacy evidence raw and quarantines it during canonical replay", async () => {
    const backup = await exportBackup();
    // The fixture represents finite legacy evidence from before H3 metadata.
    // A hand-edited payload must not retain an obsolete count manifest.
    delete backup.metadata;
    backup.transactions = [
      transaction({
        id: "tx-legacy-negative-quantity",
        type: "buy_vwce",
        amount: 100,
        unitPrice: 50,
        quantity: -1,
      }),
    ];

    await importBackup(backup);

    const restored = await db.transactions.get("tx-legacy-negative-quantity");
    expect(restored).toMatchObject({ amount: 100, quantity: -1, type: "buy_vwce" });
    expect(replayTransactions([restored!])).toMatchObject({
      vwceQty: 0,
      cashBalance: 0,
      totalBought: 0,
    });
  });
});
