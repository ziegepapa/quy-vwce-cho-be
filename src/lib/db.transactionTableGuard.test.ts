import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db.m01a";
import type { Transaction } from "./types";

const NOW = "2026-08-13T12:00:00.000Z";

function transaction(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: "2026-08-13",
    type: "adjust",
    amount: 100,
    notes: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("transactions table numeric guard", () => {
  it("allows a valid direct Dexie write", async () => {
    await db.transactions.put(transaction("valid"));
    expect((await db.transactions.get("valid"))?.amount).toBe(100);
  });

  it.each([
    ["amount", Number.NaN],
    ["amount", Number.POSITIVE_INFINITY],
    ["unitPrice", Number.NEGATIVE_INFINITY],
    ["quantity", -0.01],
    ["fee", Number.NaN],
    ["version", Number.POSITIVE_INFINITY],
  ] as const)("rejects an invalid %s before creating a row", async (field, value) => {
    const row = { ...transaction(`bad-${field}`), [field]: value } as Transaction;
    await expect(db.transactions.put(row)).rejects.toThrow(/Giao dịch không hợp lệ/);
    expect(await db.transactions.count()).toBe(0);
  });

  it("does not replace trusted local data with an invalid generic update", async () => {
    await db.transactions.put(transaction("keep", { amount: 42 }));
    await expect(
      db.transactions.put(transaction("keep", { amount: Number.NaN })),
    ).rejects.toThrow(/Giao dịch không hợp lệ/);

    expect((await db.transactions.get("keep"))?.amount).toBe(42);
  });

  it("rolls back a mixed bulk import when one transaction is invalid", async () => {
    await expect(
      db.transaction("rw", db.transactions, async () => {
        await db.transactions.bulkPut([
          transaction("valid"),
          transaction("invalid", { quantity: -1 }),
        ]);
      }),
    ).rejects.toThrow(/Giao dịch không hợp lệ/);

    expect(await db.transactions.count()).toBe(0);
  });
});
