import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "owner-1";
const CANARY = "NOTFALLMAPPE_CONTACT_DOCUMENT_LOCATION_SECRET";
const remoteMock = vi.hoisted(() => ({
  userId: "owner-1",
  authError: false,
  failFetch: false,
  failInsert: false,
  failUpdate: false,
  forceConditionalZeroRows: false,
  tables: new Map<string, Map<string, Record<string, unknown>>>(),
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; filters: Record<string, unknown>; payload: Record<string, unknown> }>,
  upserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

type ExclusiveLockOptions = { mode: "exclusive" };
type ExclusiveLockManager = {
  request<T>(name: string, options: ExclusiveLockOptions, callback: () => Promise<T>): Promise<T>;
  reset(): void;
};

function createExclusiveLockManager(): ExclusiveLockManager {
  const tails = new Map<string, Promise<void>>();
  return {
    request<T>(name: string, options: ExclusiveLockOptions, callback: () => Promise<T>): Promise<T> {
      if (options.mode !== "exclusive") return Promise.reject(new Error("Exclusive lock required"));
      const previous = tails.get(name) ?? Promise.resolve();
      let release!: () => void;
      const hold = new Promise<void>((resolve) => { release = resolve; });
      const tail = previous.catch(() => undefined).then(() => hold);
      tails.set(name, tail);
      return previous.catch(() => undefined).then(async () => {
        try {
          return await callback();
        } finally {
          release();
          if (tails.get(name) === tail) tails.delete(name);
        }
      });
    },
    reset() {
      tails.clear();
    },
  };
}

const testLocks = createExclusiveLockManager();
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
const originalOnlineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");

afterAll(() => {
  if (originalWindowDescriptor) Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalLocksDescriptor) Object.defineProperty(navigator, "locks", originalLocksDescriptor);
  else Reflect.deleteProperty(navigator, "locks");
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
    let action: "select" | "update" | "insert" = "select";
    let payload: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};
    let gtFilter: { column: string; value: string } | null = null;
    const matching = () => [...rowsFor(table).values()].filter((row) => {
      if (!Object.entries(filters).every(([k, v]) => row[k] === v)) return false;
      return !gtFilter || String(row[gtFilter.column] ?? "") > gtFilter.value;
    });
    const selectResult = () => remoteMock.failFetch
      ? { data: null, error: { message: `private ${CANARY}` } }
      : { data: matching().map((row) => ({ ...row })), error: null };
    const updateResult = () => {
      if (remoteMock.failUpdate) return { data: null, error: { message: CANARY } };
      const conditional = Object.prototype.hasOwnProperty.call(filters, "version");
      const rows = conditional && remoteMock.forceConditionalZeroRows ? [] : matching();
      for (const row of rows) rowsFor(table).set(String(row.id), { ...row, ...payload, version: Number(row.version) + 1 });
      remoteMock.updates.push({ table, filters: { ...filters }, payload: { ...payload } });
      return { data: rows.map((row) => ({ id: row.id })), error: null };
    };
    const insertResult = () => {
      remoteMock.inserts.push({ table, payload: { ...payload } });
      if (remoteMock.failInsert || rowsFor(table).has(String(payload.id))) return { data: null, error: { message: CANARY } };
      const row = { ...payload, updated_at: "2026-08-11T20:00:00.000Z", deleted_at: payload.deleted_at ?? null };
      rowsFor(table).set(String(payload.id), row);
      return { data: row, error: null };
    };
    const builder: any = {
      select() { return builder; },
      update(next: Record<string, unknown>) { action = "update"; payload = next; return builder; },
      insert(next: Record<string, unknown>) { action = "insert"; payload = next; return builder; },
      upsert(next: Record<string, unknown>) { remoteMock.upserts.push({ table, payload: next }); rowsFor(table).set(String(next.id), { ...next }); return Promise.resolve({ data: [next], error: null }); },
      eq(column: string, value: unknown) { filters[column] = value; return builder; },
      gt(column: string, value: string) { gtFilter = { column, value }; return builder; },
      order() { return Promise.resolve(selectResult()); },
      maybeSingle() {
        if (action === "insert") return Promise.resolve(insertResult());
        const result = selectResult();
        return Promise.resolve(result.error ? result : { data: result.data?.[0] ?? null, error: null });
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const result = action === "update" ? updateResult() : action === "insert" ? insertResult() : selectResult();
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  };
  return { supabase: {
    auth: { getUser: vi.fn(async () => remoteMock.authError ? { data: { user: null }, error: { message: CANARY } } : { data: { user: { id: remoteMock.userId } }, error: null }) },
    from: (table: string) => builderFor(table),
  } };
});

import { db } from "../db.m01a";
import { enqueueOutbox, enqueueRecoveryItem } from "./outbox";
import { getSyncMeta, listConflicts, processRecoverySession, pushOutbox, resolveConflict, saveSyncMeta } from "./engine";
import type { ConflictRecord, EntityTable } from "./types";

const REMOTE_TABLE: Record<EntityTable, string> = {
  settings: "app_settings", goals: "goals", transactions: "transactions",
  annualChecklists: "annual_checklists", monthlySnapshots: "monthly_snapshots",
};
function setRemote(table: EntityTable, id: string, data: unknown, version: number, deletedAt: string | null = null) {
  const name = REMOTE_TABLE[table];
  let rows = remoteMock.tables.get(name);
  if (!rows) { rows = new Map(); remoteMock.tables.set(name, rows); }
  rows.set(id, { id, user_id: USER_ID, data, version, updated_at: "2026-08-11T19:00:00.000Z", deleted_at: deletedAt });
}
function remote(table: EntityTable, id: string) { return remoteMock.tables.get(REMOTE_TABLE[table])?.get(id); }
async function beginSession(id = "session-1", total = 1) {
  await saveSyncMeta({ userId: USER_ID, recoverySessionId: id, recoveryState: "queued", recoveryTotal: total, recoveryConfirmed: 0, migrateWizardDone: false });
}
async function queueGoal(payload: Record<string, unknown>, sourceLocalVersion: number | null = null, sessionId = "session-1") {
  await db.goals.put(payload as never);
  return enqueueRecoveryItem({ recoverySessionId: sessionId, table: "goals", entityId: String(payload.id), payload, sourceLocalVersion });
}
function conflict(): ConflictRecord {
  return { id: "c1", table: "goals", entityId: "goal-1", local: { id: "goal-1", version: 2 }, remote: { id: "goal-1" }, detectedAt: "2026-08-11T19:00:00Z", formatVersion: 2, remoteVersion: 5, remoteUpdatedAt: null, remoteDeletedAt: null };
}

beforeEach(async () => {
  testLocks.reset();
  Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
  Object.defineProperty(navigator, "locks", { configurable: true, value: testLocks });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  remoteMock.userId = USER_ID; remoteMock.authError = false; remoteMock.failFetch = false;
  remoteMock.failInsert = false; remoteMock.failUpdate = false; remoteMock.forceConditionalZeroRows = false;
  remoteMock.tables.clear(); remoteMock.inserts.length = 0; remoteMock.updates.length = 0; remoteMock.upserts.length = 0;
  await db.delete(); await db.open();
});

describe("server-confirmed recovery", () => {
  it("creates a verified-absent row with INSERT only and records returned version", async () => {
    await beginSession();
    await queueGoal({ id: "goal-1", name: "Local", version: 9 }, 9);
    const result = await processRecoverySession(USER_ID, "session-1");
    expect(result).toEqual({ status: "confirmed", confirmed: 1 });
    expect(remoteMock.inserts).toHaveLength(1);
    expect(remoteMock.upserts).toHaveLength(0);
    expect((await db.goals.get("goal-1") as any).version).toBe(1);
    expect(await db.outbox.count()).toBe(0);
    expect(await getSyncMeta(USER_ID)).toMatchObject({ recoveryState: "complete", migrateWizardDone: true, recoveryConfirmed: 1 });
  });

  it("handles an ambiguous duplicate insert by refetching an exact idempotent row", async () => {
    await beginSession();
    const item = await queueGoal({ id: "goal-1", name: "Local" }, null);
    await db.outbox.put({ ...item, createAttempted: true });
    setRemote("goals", "goal-1", { id: "goal-1", name: "Local" }, 1);
    expect(await processRecoverySession(USER_ID, "session-1")).toEqual({ status: "confirmed", confirmed: 1 });
    expect(remoteMock.upserts).toHaveLength(0);
  });

  it("treats an exact existing row as verified no-op", async () => {
    await beginSession();
    await queueGoal({ id: "goal-1", name: "Same", version: 4 }, 4);
    setRemote("goals", "goal-1", { id: "goal-1", name: "Same" }, 4);
    expect(await processRecoverySession(USER_ID, "session-1")).toEqual({ status: "confirmed", confirmed: 1 });
    expect(remoteMock.inserts).toHaveLength(0);
    expect(remoteMock.updates).toHaveLength(0);
    expect(remoteMock.upserts).toHaveLength(0);
  });

  it("creates exactly one recovery conflict for divergent data and never overwrites remote", async () => {
    await beginSession();
    await queueGoal({ id: "goal-1", name: "Local", version: 4 }, 4);
    setRemote("goals", "goal-1", { id: "goal-1", name: "Server" }, 5);
    expect((await processRecoverySession(USER_ID, "session-1")).status).toBe("conflict");
    expect((await processRecoverySession(USER_ID, "session-1")).status).toBe("conflict");
    expect(await listConflicts()).toHaveLength(1);
    expect((remote("goals", "goal-1")?.data as any).name).toBe("Server");
    expect(remoteMock.inserts).toHaveLength(0); expect(remoteMock.updates).toHaveLength(0); expect(remoteMock.upserts).toHaveLength(0);
  });

  it("treats a tombstone as conflict without undeleting it", async () => {
    await beginSession(); await queueGoal({ id: "goal-1", name: "Local", version: 4 }, 4);
    setRemote("goals", "goal-1", { id: "goal-1", name: "Old" }, 4, "2026-08-11T18:00:00Z");
    expect((await processRecoverySession(USER_ID, "session-1")).status).toBe("conflict");
    expect(remote("goals", "goal-1")?.deleted_at).toBeTruthy();
    expect(remoteMock.updates).toHaveLength(0);
  });

  it("keeps offline or unavailable recovery pending without writes or completion", async () => {
    await beginSession(); await queueGoal({ id: "goal-1", name: "Local" }, null);
    remoteMock.failFetch = true; remoteMock.failInsert = true;
    expect((await processRecoverySession(USER_ID, "session-1")).status).toBe("unverified");
    expect((await getSyncMeta(USER_ID))).toMatchObject({ recoveryState: "queued", migrateWizardDone: false });
    expect(await db.outbox.count()).toBe(1); expect(remoteMock.upserts).toHaveLength(0);
  });

  it.each(["uid-mismatch", "get-user-failure"])("fails closed for %s", async (mode) => {
    await beginSession(); await queueGoal({ id: "goal-1", name: CANARY }, null);
    if (mode === "uid-mismatch") remoteMock.userId = "other-user"; else remoteMock.authError = true;
    const logs = [vi.spyOn(console, "log").mockImplementation(() => undefined), vi.spyOn(console, "error").mockImplementation(() => undefined)];
    expect((await processRecoverySession(USER_ID, "session-1")).status).toBe("unverified");
    expect(remoteMock.inserts).toHaveLength(0); expect((await getSyncMeta(USER_ID)).migrateWizardDone).toBe(false);
    for (const log of logs) { expect(log).not.toHaveBeenCalled(); log.mockRestore(); }
  });

  it("does not increment a local version while queueing and is idempotent on reload", async () => {
    await beginSession();
    await db.goals.put({ id: "goal-1", version: 7 } as never);
    const first = await enqueueRecoveryItem({ recoverySessionId: "session-1", table: "goals", entityId: "goal-1", payload: { id: "goal-1", version: 7 }, sourceLocalVersion: 7 });
    const second = await enqueueRecoveryItem({ recoverySessionId: "session-1", table: "goals", entityId: "goal-1", payload: { id: "goal-1", version: 7 }, sourceLocalVersion: 7 });
    expect(second.id).toBe(first.id); expect(await db.outbox.count()).toBe(1);
    expect((await db.goals.get("goal-1") as any).version).toBe(7);
  });

  it("does not remove an unrelated ordinary outbox item", async () => {
    await enqueueOutbox("goals", "goal-1", "upsert", { id: "goal-1" }, 2);
    await expect(enqueueRecoveryItem({ recoverySessionId: "session-1", table: "goals", entityId: "goal-1", payload: { id: "goal-1" }, sourceLocalVersion: null })).rejects.toThrow();
    const items = await db.outbox.toArray(); expect(items).toHaveLength(1); expect(items[0].op).toBe("upsert");
  });

  it("keeps a partially confirmed session queued", async () => {
    await beginSession("session-1", 2);
    await queueGoal({ id: "goal-1", name: "One" }, null);
    await db.transactions.put({ id: "tx-1", version: 2 } as never);
    await enqueueRecoveryItem({ recoverySessionId: "session-1", table: "transactions", entityId: "tx-1", payload: { id: "tx-1", version: 2 }, sourceLocalVersion: 2 });
    setRemote("transactions", "tx-1", { id: "tx-1", version: 99 }, 99);
    const result = await processRecoverySession(USER_ID, "session-1");
    expect(result.status).toBe("conflict"); expect((result as any).confirmed).toBe(1);
    expect((await getSyncMeta(USER_ID)).migrateWizardDone).toBe(false);
  });

  it("completes a recovery session only after the final explicit conflict resolution is confirmed", async () => {
    await beginSession(); await queueGoal({ id: "goal-1", name: "Local", version: 4 }, 4);
    setRemote("goals", "goal-1", { id: "goal-1", name: "Server" }, 5);
    await processRecoverySession(USER_ID, "session-1");
    const recoveryConflict = (await listConflicts())[0];
    expect((await getSyncMeta(USER_ID)).recoveryState).toBe("conflict");
    expect(await resolveConflict(recoveryConflict.id, "remote", USER_ID, { online: true })).toEqual({ status: "resolved-remote" });
    expect(await getSyncMeta(USER_ID)).toMatchObject({ recoveryState: "complete", migrateWizardDone: true });
  });
});

describe("ordinary guarded sync regression", () => {
  it("uses one conditional update and never falls back to upsert", async () => {
    await db.goals.put({ id: "goal-1", name: "Local", version: 6 } as never);
    await enqueueOutbox("goals", "goal-1", "upsert", { id: "goal-1", name: "Local", version: 6 }, 6, { expectedRemoteVersion: 5 });
    setRemote("goals", "goal-1", { id: "goal-1", name: "Server" }, 5);
    expect(await pushOutbox(USER_ID)).toMatchObject({ pushed: 1, errors: 0 });
    expect(remoteMock.updates).toHaveLength(1); expect(remoteMock.upserts).toHaveLength(0);
  });

  it("turns guarded zero rows into conflict and never reports success", async () => {
    await db.goals.put({ id: "goal-1", name: "Local", version: 6 } as never);
    await enqueueOutbox("goals", "goal-1", "upsert", { id: "goal-1", name: "Local", version: 6 }, 6, { expectedRemoteVersion: 5 });
    setRemote("goals", "goal-1", { id: "goal-1", name: "Changed" }, 7);
    remoteMock.forceConditionalZeroRows = true;
    expect(await pushOutbox(USER_ID)).toMatchObject({ pushed: 0, errors: 1 });
    expect(await listConflicts()).toHaveLength(1); expect(remoteMock.upserts).toHaveLength(0);
  });

  it("preserves existing explicit conflict local resolution", async () => {
    await db.goals.put({ id: "goal-1", name: "Local", version: 3 } as never);
    await db.conflicts.put(conflict());
    setRemote("goals", "goal-1", { id: "goal-1", name: "Server" }, 5);
    expect(await resolveConflict("c1", "local", USER_ID, { online: true })).toEqual({ status: "resolved-local" });
    expect(remoteMock.updates).toHaveLength(1); expect(remoteMock.upserts).toHaveLength(0);
  });
});
