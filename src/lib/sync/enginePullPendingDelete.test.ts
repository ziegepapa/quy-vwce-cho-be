import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "owner-1";
const NOW = "2026-08-14T08:00:00.000Z";
const DELETED_AT = "2026-08-14T09:00:00.000Z";
const REMOTE_DELETED_AT = "2026-08-14T10:00:00.000Z";
// Two markers so a resurrected row is unmistakable in the failure output:
// LOCAL_ONLY can only survive if the pull left the local tombstone alone.
const LOCAL_ONLY = "TOMBSTONE_KEPT_LOCAL";
const SERVER_COPY = "SERVER_STILL_ALIVE";

const remoteMock = vi.hoisted(() => ({
  tables: new Map<string, Map<string, Record<string, unknown>>>(),
  ops: [] as string[],
}));

type MockResponse = {
  data: unknown;
  error: { message: string } | null;
};
type MockBuilder = {
  select(): MockBuilder;
  update(next: Record<string, unknown>): MockBuilder;
  eq(column: string, value: unknown): MockBuilder;
  gt(column: string, value: string): MockBuilder;
  order(): Promise<MockResponse>;
  maybeSingle(): Promise<MockResponse>;
  then(resolve: (value: MockResponse) => unknown, reject: (reason: unknown) => unknown): Promise<unknown>;
};

const originalOnlineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");

afterAll(() => {
  if (originalOnlineDescriptor) Object.defineProperty(navigator, "onLine", originalOnlineDescriptor);
  else Reflect.deleteProperty(navigator, "onLine");
});

vi.mock("../supabase", () => {
  const rowsFor = (table: string) => {
    let rows = remoteMock.tables.get(table);
    if (!rows) { rows = new Map(); remoteMock.tables.set(table, rows); }
    return rows;
  };
  const builderFor = (table: string) => {
    let action: "select" | "update" = "select";
    let payload: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};
    let gtFilter: { column: string; value: string } | null = null;
    const matching = () => [...rowsFor(table).values()].filter((row) => {
      if (!Object.entries(filters).every(([k, v]) => row[k] === v)) return false;
      return !gtFilter || String(row[gtFilter.column] ?? "") > gtFilter.value;
    });
    const selectResult = (): MockResponse => ({ data: matching().map((row) => ({ ...row })), error: null });
    const updateResult = (): MockResponse => {
      const rows = matching();
      for (const row of rows) rowsFor(table).set(String(row.id), { ...row, ...payload, version: Number(row.version) + 1 });
      remoteMock.ops.push(`push:${table}`);
      return { data: rows.map((row) => ({ id: row.id })), error: null };
    };
    const builder: MockBuilder = {
      select() { return builder; },
      update(next) { action = "update"; payload = next; return builder; },
      eq(column, value) { filters[column] = value; return builder; },
      gt(column, value) { gtFilter = { column, value }; return builder; },
      order() { remoteMock.ops.push(`pull:${table}`); return Promise.resolve(selectResult()); },
      maybeSingle() {
        const rows = matching().map((row) => ({ ...row }));
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(resolve, reject) {
        const result = action === "update" ? updateResult() : selectResult();
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  };
  return { supabase: { from: (table: string) => builderFor(table) } };
});

import { db } from "../db.m01a";
import { enqueueOutbox } from "./outbox";
import { getSyncMeta, pullDelta, runSync } from "./engine";
import type { EntityTable } from "./types";
import type { Goal, Transaction } from "../types";

type StoredGoal = Goal & { version: number };
type StoredTransaction = Transaction & { version: number };

const REMOTE_TABLE: Record<EntityTable, string> = {
  settings: "app_settings", goals: "goals", transactions: "transactions",
  annualChecklists: "annual_checklists", monthlySnapshots: "monthly_snapshots",
};
function setRemote(table: EntityTable, id: string, data: unknown, version: number, deletedAt: string | null = null) {
  const name = REMOTE_TABLE[table];
  let rows = remoteMock.tables.get(name);
  if (!rows) { rows = new Map(); remoteMock.tables.set(name, rows); }
  rows.set(id, { id, user_id: USER_ID, data, version, updated_at: "2026-08-14T07:00:00.000Z", deleted_at: deletedAt });
}
function remoteRow(table: EntityTable, id: string) { return remoteMock.tables.get(REMOTE_TABLE[table])?.get(id); }

function transaction(id: string, notes: string): StoredTransaction {
  return { id, date: "2026-08-14", type: "adjust", amount: 50, notes, createdAt: NOW, updatedAt: NOW, version: 2 };
}
function goal(id: string, notes: string): StoredGoal {
  return {
    id, name: "Muc tieu", dueDate: "2030-01-01", amount: 1000, mode: "nominal", baseYear: 2026,
    inflationRate: 2, bufferPct: 10, urgency: "flexible", protectedAmount: 0, notes,
    createdAt: NOW, updatedAt: NOW, version: 2,
  };
}
function transactionTombstone(id: string): StoredTransaction {
  return { ...transaction(id, LOCAL_ONLY), deletedAt: DELETED_AT, updatedAt: DELETED_AT, version: 3 };
}
function goalTombstone(id: string): StoredGoal {
  return { ...goal(id, LOCAL_ONLY), deletedAt: DELETED_AT, updatedAt: DELETED_AT, version: 3 };
}

// Exactly the state db.m07b.deleteTransaction / deleteGoal leave behind: a local
// tombstone plus one queued "delete", which is the ONLY channel that can ever
// tell the server the row is gone.
async function softDeletedTransaction(id: string) {
  await db.transactions.put(transactionTombstone(id));
  await enqueueOutbox("transactions", id, "delete", null, 3);
}
async function softDeletedGoal(id: string) {
  await db.goals.put(goalTombstone(id));
  await enqueueOutbox("goals", id, "delete", null, 3);
}

beforeEach(async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  remoteMock.tables.clear();
  remoteMock.ops.length = 0;
  await db.delete();
  await db.open();
});

describe("pullDelta respects a pending delete", () => {
  it("keeps a transaction tombstone while its delete is still queued", async () => {
    await softDeletedTransaction("tx-1");
    setRemote("transactions", "tx-1", transaction("tx-1", SERVER_COPY), 4);

    await expect(pullDelta(USER_ID)).resolves.toMatchObject({ pulled: 0, conflicts: 0 });

    const local = await db.transactions.get("tx-1");
    expect(local?.deletedAt).toBe(DELETED_AT);
    expect(local?.notes).toBe(LOCAL_ONLY);
    const pending = await db.outbox.toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].op).toBe("delete");
  });

  it("keeps a goal tombstone while its delete is still queued", async () => {
    await softDeletedGoal("goal-1");
    setRemote("goals", "goal-1", goal("goal-1", SERVER_COPY), 4);

    await expect(pullDelta(USER_ID)).resolves.toMatchObject({ pulled: 0, conflicts: 0 });

    const local = await db.goals.get("goal-1");
    expect(local?.deletedAt).toBe(DELETED_AT);
    expect(local?.notes).toBe(LOCAL_ONLY);
  });

  it("still hydrates rows that have no pending outbox item", async () => {
    await softDeletedTransaction("tx-1");
    setRemote("transactions", "tx-1", transaction("tx-1", SERVER_COPY), 4);
    setRemote("transactions", "tx-2", transaction("tx-2", SERVER_COPY), 4);

    await expect(pullDelta(USER_ID)).resolves.toMatchObject({ pulled: 1, conflicts: 0 });

    expect((await db.transactions.get("tx-2"))?.notes).toBe(SERVER_COPY);
    expect((await db.transactions.get("tx-1"))?.deletedAt).toBe(DELETED_AT);
  });

  it("still applies a server deletion while a local delete is queued", async () => {
    await softDeletedTransaction("tx-1");
    setRemote("transactions", "tx-1", transaction("tx-1", SERVER_COPY), 4, REMOTE_DELETED_AT);

    await expect(pullDelta(USER_ID)).resolves.toMatchObject({ pulled: 1, conflicts: 0 });

    const local = await db.transactions.get("tx-1");
    expect(local?.deletedAt).toBe(REMOTE_DELETED_AT);
    expect(local?.notes).toBe(LOCAL_ONLY);
  });

  // Accepted trade-off, locked on purpose: the guard protects the tombstone but
  // pushes nothing, and the watermark still moves. If the queued delete later
  // dies, the still-live server row is not offered again until the owner revives
  // the outbox item. Propagating a deletion stays the outbox's job, not the
  // pull's.
  it("moves the pull watermark and never touches the server row", async () => {
    await softDeletedTransaction("tx-1");
    setRemote("transactions", "tx-1", transaction("tx-1", SERVER_COPY), 4);

    await pullDelta(USER_ID);

    expect((await getSyncMeta(USER_ID)).lastPulledAt).not.toBe("");
    expect(remoteRow("transactions", "tx-1")?.deleted_at).toBeNull();
    expect(remoteMock.ops.some((op) => op.startsWith("push:"))).toBe(false);
  });
});

describe("runSync first hydrate after a restore", () => {
  it("keeps the tombstone through pull-before-push and pushes the delete", async () => {
    await softDeletedTransaction("tx-1");
    setRemote("transactions", "tx-1", transaction("tx-1", SERVER_COPY), 4);
    expect((await getSyncMeta(USER_ID)).lastPulledAt).toBe("");

    const result = await runSync(USER_ID);

    expect(remoteMock.ops[0].startsWith("pull:")).toBe(true);
    expect(result).toMatchObject({ status: "synced", pushed: 1 });
    const local = await db.transactions.get("tx-1");
    expect(local?.deletedAt).toBe(DELETED_AT);
    expect(local?.notes).toBe(LOCAL_ONLY);
    expect(typeof remoteRow("transactions", "tx-1")?.deleted_at).toBe("string");
    expect(await db.outbox.count()).toBe(0);
  });
});
