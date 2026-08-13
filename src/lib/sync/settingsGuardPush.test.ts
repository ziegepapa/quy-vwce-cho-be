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
  updates: [] as Array<{
    table: string;
    filters: Record<string, unknown>;
    payload: Record<string, unknown>;
  }>,
  upserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

type ExclusiveLockOptions = { mode: "exclusive" };
type ExclusiveLockManager = {
  request<T>(
    name: string,
    options: ExclusiveLockOptions,
    callback: () => Promise<T>,
  ): Promise<T>;
  reset(): void;
};
type MockResponse = { data: unknown; error: { message: string } | null };
type MockBuilder = {
  select(): MockBuilder;
  update(next: Record<string, unknown>): MockBuilder;
  insert(next: Record<string, unknown>): MockBuilder;
  upsert(next: Record<string, unknown>): Promise<MockResponse>;
  eq(column: string, value: unknown): MockBuilder;
  gt(column: string, value: string): MockBuilder;
  order(): Promise<MockResponse>;
  maybeSingle(): Promise<MockResponse>;
  then(
    resolve: (value: MockResponse) => unknown,
    reject: (reason: unknown) => unknown,
  ): Promise<unknown>;
};

function createExclusiveLockManager(): ExclusiveLockManager {
  const tails = new Map<string, Promise<void>>();
  return {
    request<T>(
      name: string,
      options: ExclusiveLockOptions,
      callback: () => Promise<T>,
    ): Promise<T> {
      if (options.mode !== "exclusive") {
        return Promise.reject(new Error("Exclusive lock required"));
      }
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(callback, callback);
      const settled = run.then(
        () => undefined,
        () => undefined,
      );
      tails.set(name, settled);
      return run.finally(() => {
        if (tails.get(name) === settled) tails.delete(name);
      });
    },
    reset() {
      tails.clear();
    },
  };
}

const testLocks = createExclusiveLockManager();
const originalLocksDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "locks",
);
const originalOnlineDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "onLine",
);

afterAll(() => {
  if (originalLocksDescriptor) {
    Object.defineProperty(navigator, "locks", originalLocksDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "locks");
  }
  if (originalOnlineDescriptor) {
    Object.defineProperty(navigator, "onLine", originalOnlineDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "onLine");
  }
});

vi.mock("../supabase", () => {
  const rowsFor = (table: string) => {
    let rows = remoteMock.tables.get(table);
    if (!rows) {
      rows = new Map();
      remoteMock.tables.set(table, rows);
    }
    return rows;
  };
  const builderFor = (table: string) => {
    let action: "select" | "update" | "insert" = "select";
    let payload: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};
    let gtFilter: { column: string; value: string } | null = null;
    const matching = () =>
      [...rowsFor(table).values()].filter((row) => {
        if (!Object.entries(filters).every(([k, v]) => row[k] === v)) return false;
        return !gtFilter || String(row[gtFilter.column] ?? "") > gtFilter.value;
      });
    const selectResult = (): MockResponse =>
      remoteMock.failFetch
        ? { data: null, error: { message: `private ${CANARY}` } }
        : { data: matching().map((row) => ({ ...row })), error: null };
    const updateResult = (): MockResponse => {
      if (remoteMock.failUpdate) return { data: null, error: { message: CANARY } };
      const conditional = Object.prototype.hasOwnProperty.call(filters, "version");
      const rows =
        conditional && remoteMock.forceConditionalZeroRows ? [] : matching();
      for (const row of rows) {
        rowsFor(table).set(String(row.id), {
          ...row,
          ...payload,
          version: Number(row.version) + 1,
        });
      }
      remoteMock.updates.push({
        table,
        filters: { ...filters },
        payload: { ...payload },
      });
      return { data: rows.map((row) => ({ id: row.id })), error: null };
    };
    const insertResult = (): MockResponse => {
      remoteMock.inserts.push({ table, payload: { ...payload } });
      if (remoteMock.failInsert || rowsFor(table).has(String(payload.id))) {
        return { data: null, error: { message: CANARY } };
      }
      const row = {
        ...payload,
        updated_at: "2026-08-11T20:00:00.000Z",
        deleted_at: payload.deleted_at ?? null,
      };
      rowsFor(table).set(String(payload.id), row);
      return { data: row, error: null };
    };
    const builder: MockBuilder = {
      select() {
        return builder;
      },
      update(next) {
        action = "update";
        payload = next;
        return builder;
      },
      insert(next) {
        action = "insert";
        payload = next;
        return builder;
      },
      upsert(next) {
        remoteMock.upserts.push({ table, payload: next });
        rowsFor(table).set(String(next.id), { ...next });
        return Promise.resolve({ data: [next], error: null });
      },
      eq(column, value) {
        filters[column] = value;
        return builder;
      },
      gt(column, value) {
        gtFilter = { column, value };
        return builder;
      },
      order() {
        return Promise.resolve(selectResult());
      },
      maybeSingle() {
        if (action === "insert") return Promise.resolve(insertResult());
        const result = selectResult();
        const rows = Array.isArray(result.data) ? result.data : [];
        return Promise.resolve(
          result.error ? result : { data: rows[0] ?? null, error: null },
        );
      },
      then(resolve, reject) {
        const result =
          action === "update"
            ? updateResult()
            : action === "insert"
              ? insertResult()
              : selectResult();
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  };
  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () =>
          remoteMock.authError
            ? { data: { user: null }, error: { message: CANARY } }
            : { data: { user: { id: remoteMock.userId } }, error: null },
        ),
      },
      from: (table: string) => builderFor(table),
    },
  };
});

import { db } from "../db.m01a";
import { enqueueOutbox } from "./outbox";
import { listConflicts, pushOutbox } from "./engine";
import type { EntityTable } from "./types";

async function withBrowserLockPath<T>(operation: () => Promise<T>): Promise<T> {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try {
    return await operation();
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

function pushOrdinary(): Promise<{ pushed: number; errors: number; dead: number }> {
  return withBrowserLockPath(() => pushOutbox(USER_ID));
}

const REMOTE_TABLE: Record<EntityTable, string> = {
  settings: "app_settings",
  goals: "goals",
  transactions: "transactions",
  annualChecklists: "annual_checklists",
  monthlySnapshots: "monthly_snapshots",
};

function setRemote(
  table: EntityTable,
  id: string,
  data: unknown,
  version: number,
  deletedAt: string | null = null,
) {
  const name = REMOTE_TABLE[table];
  let rows = remoteMock.tables.get(name);
  if (!rows) {
    rows = new Map();
    remoteMock.tables.set(name, rows);
  }
  rows.set(id, {
    id,
    user_id: USER_ID,
    data,
    version,
    updated_at: "2026-08-11T19:00:00.000Z",
    deleted_at: deletedAt,
  });
}

function remote(table: EntityTable, id: string) {
  return remoteMock.tables.get(REMOTE_TABLE[table])?.get(id);
}

beforeEach(async () => {
  testLocks.reset();
  Object.defineProperty(navigator, "locks", { configurable: true, value: testLocks });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  remoteMock.userId = USER_ID;
  remoteMock.authError = false;
  remoteMock.failFetch = false;
  remoteMock.failInsert = false;
  remoteMock.failUpdate = false;
  remoteMock.forceConditionalZeroRows = false;
  remoteMock.tables.clear();
  remoteMock.inserts.length = 0;
  remoteMock.updates.length = 0;
  remoteMock.upserts.length = 0;
  await db.delete();
  await db.open();
});

describe("guarded settings push never clobbers the server emergency profile", () => {
  it("turns a stale settings upsert into a conflict and preserves the remote notfallmappe", async () => {
    // Server da co Ho so khan cap (notfallmappe) o version moi hon (6).
    setRemote(
      "settings",
      "settings",
      { id: "settings", notfallmappe: CANARY, planName: "Server" },
      6,
    );
    // Ban CUC BO cu: dua tren version 5, notfallmappe RONG -> guarded expected = 5.
    await enqueueOutbox(
      "settings",
      "settings",
      "upsert",
      { id: "settings", notfallmappe: "", planName: "Local cu", version: 6 },
      6,
      { expectedRemoteVersion: 5 },
    );
    // Server da nhay len 6 -> conditional update khong khop (0 dong).
    remoteMock.forceConditionalZeroRows = true;

    const result = await pushOrdinary();

    expect(result).toMatchObject({ pushed: 0, errors: 1 });
    // KHONG bao gio fallback sang upsert vo dieu kien -> KHONG ghi de.
    expect(remoteMock.upserts).toHaveLength(0);
    // Ho so khan cap tren server con nguyen ven.
    expect(
      (remote("settings", "settings")?.data as { notfallmappe?: string })
        .notfallmappe,
    ).toBe(CANARY);
    // Sinh dung mot conflict "settings" de nguoi dung tu quyet.
    const conflicts = await listConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].table).toBe("settings");
  });

  it("applies a matching guarded settings upsert without any unconditional upsert", async () => {
    setRemote("settings", "settings", { id: "settings", notfallmappe: CANARY }, 5);
    await enqueueOutbox(
      "settings",
      "settings",
      "upsert",
      { id: "settings", notfallmappe: CANARY, planName: "Da cap nhat", version: 6 },
      6,
      { expectedRemoteVersion: 5 },
    );

    const result = await pushOrdinary();

    expect(result).toMatchObject({ pushed: 1, errors: 0 });
    expect(remoteMock.updates).toHaveLength(1);
    expect(remoteMock.upserts).toHaveLength(0);
    expect(
      (remote("settings", "settings")?.data as { notfallmappe?: string })
        .notfallmappe,
    ).toBe(CANARY);
  });
});
