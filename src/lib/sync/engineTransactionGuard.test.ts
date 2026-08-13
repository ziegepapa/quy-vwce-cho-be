// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "owner-1";
const remoteMock = vi.hoisted(() => ({
  tables: new Map<string, Array<Record<string, unknown>>>(),
}));

type PullResponse = {
  data: Array<Record<string, unknown>>;
  error: null;
};

type PullBuilder = {
  select(columns: string): PullBuilder;
  eq(column: string, value: unknown): PullBuilder;
  gt(column: string, value: string): PullBuilder;
  order(column: string, options: { ascending: boolean }): Promise<PullResponse>;
};

vi.mock("../supabase", () => ({
  supabase: {
    from(table: string): PullBuilder {
      const builder: PullBuilder = {
        select: () => builder,
        eq: () => builder,
        gt: () => builder,
        order: async () => ({ data: remoteMock.tables.get(table) ?? [], error: null }),
      };
      return builder;
    },
  },
}));

import { db } from "../db.m01a";
import { getSyncMeta, pullDelta } from "./engine";
import type { Transaction } from "../types";

const NOW = "2026-08-13T12:00:00.000Z";

function transaction(id: string, amount: number): Transaction & { version: number } {
  return {
    id,
    date: "2026-08-13",
    type: "adjust",
    amount,
    notes: "",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  };
}

function setRemoteTransaction(data: unknown, version = 2) {
  remoteMock.tables.set("transactions", [{
    id: "tx-1",
    user_id: USER_ID,
    data,
    version,
    updated_at: "2026-08-13T13:00:00.000Z",
    deleted_at: null,
  }]);
}

beforeEach(async () => {
  remoteMock.tables.clear();
  await db.delete();
  await db.open();
});

describe("sync transaction ingestion guard", () => {
  it("hydrates a valid remote transaction", async () => {
    setRemoteTransaction(transaction("tx-1", 100));

    await expect(pullDelta(USER_ID)).resolves.toMatchObject({ pulled: 1, conflicts: 0 });
    expect((await db.transactions.get("tx-1"))?.amount).toBe(100);
  });

  it("rejects an invalid remote transaction before local persistence", async () => {
    setRemoteTransaction(transaction("tx-1", Number.NaN));

    await expect(pullDelta(USER_ID)).rejects.toThrow(/Giao dịch không hợp lệ/);
    expect(await db.transactions.count()).toBe(0);
    expect((await getSyncMeta(USER_ID)).lastPulledAt).toBe("");
  });

  it("preserves an existing valid row when a newer remote payload is invalid", async () => {
    await db.transactions.put(transaction("tx-1", 42));
    setRemoteTransaction(transaction("tx-1", Number.POSITIVE_INFINITY), 2);

    await expect(pullDelta(USER_ID)).rejects.toThrow(/Giao dịch không hợp lệ/);
    expect(await db.transactions.get("tx-1")).toMatchObject({ amount: 42, version: 1 });
    expect((await getSyncMeta(USER_ID)).lastPulledAt).toBe("");
  });
});
