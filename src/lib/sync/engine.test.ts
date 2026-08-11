import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const remoteMock = vi.hoisted(() => ({
  tables: new Map<string, Map<string, Record<string, unknown>>>(),
  failFetch: false,
  conditionalUpdates: [] as Array<{
    table: string;
    filters: Record<string, unknown>;
    payload: Record<string, unknown>;
    updatedRows: number;
  }>,
  unconditionalUpserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

vi.mock("../supabase", () => {
  function rowsFor(table: string) {
    let rows = remoteMock.tables.get(table);
    if (!rows) {
      rows = new Map();
      remoteMock.tables.set(table, rows);
    }
    return rows;
  }

  function createBuilder(table: string) {
    let action: "select" | "update" = "select";
    let updatePayload: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};
    let gtFilter: { column: string; value: string } | null = null;

    const matchingRows = () =>
      [...rowsFor(table).values()].filter((row) => {
        const exact = Object.entries(filters).every(([key, value]) => row[key] === value);
        if (!exact) return false;
        if (!gtFilter) return true;
        return String(row[gtFilter.column] ?? "") > gtFilter.value;
      });

    const selectResult = () => {
      if (remoteMock.failFetch) return { data: null, error: { message: "fetch failed" } };
      return { data: matchingRows().map((row) => ({ ...row })), error: null };
    };

    const updateResult = () => {
      const rows = matchingRows();
      for (const row of rows) {
        const id = String(row.id);
        rowsFor(table).set(id, { ...row, ...updatePayload });
      }
      if (Object.prototype.hasOwnProperty.call(filters, "version")) {
        remoteMock.conditionalUpdates.push({
          table,
          filters: { ...filters },
          payload: { ...updatePayload },
          updatedRows: rows.length,
        });
      }
      return { data: rows.map((row) => ({ id: row.id })), error: null };
    };

    const builder: any = {
      select() {
        if (action === "update") return Promise.resolve(updateResult());
        action = "select";
        return builder;
      },
      update(payload: Record<string, unknown>) {
        action = "update";
        updatePayload = payload;
        return builder;
      },
      upsert(payload: Record<string, unknown>) {
        remoteMock.unconditionalUpserts.push({ table, payload: { ...payload } });
        rowsFor(table).set(String(payload.id), { ...payload });
        return Promise.resolve({ data: [{ id: payload.id }], error: null });
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      gt(column: string, value: string) {
        gtFilter = { column, value };
        return builder;
      },
      order() {
        return Promise.resolve(selectResult());
      },
      maybeSingle() {
        const result = selectResult();
        if (result.error) return Promise.resolve(result);
        return Promise.resolve({ data: result.data?.[0] ?? null, error: null });
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const result = action === "update" ? updateResult() : selectResult();
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    supabase: {
      from(table: string) {
        return createBuilder(table);
      },
    },
  };
});

import { db } from "../db.m01a";
import type { ConflictRecord, EntityTable } from "./types";
import {
  computeSyncStatus,
  enqueueOutbox,
  listConflicts,
  pullDelta,
  pushOutbox,
  resolveConflict,
} from "./engine";

const USER_ID = "owner-1";
const REMOTE_TABLE: Record<EntityTable, string> = {
  settings: "app_settings",
  goals: "goals",
  transactions: "transactions",
  annualChecklists: "annual_checklists",
  monthlySnapshots: "monthly_snapshots",
};

function setRemote(
  table: EntityTable,
  entityId: string,
  value: {
    data: unknown;
    version: number;
    updatedAt?: string;
    deletedAt?: string | null;
  },
) {
  const remoteTable = REMOTE_TABLE[table];
  let rows = remoteMock.tables.get(remoteTable);
  if (!rows) {
    rows = new Map();
    remoteMock.tables.set(remoteTable, rows);
  }
  rows.set(entityId, {
    id: entityId,
    user_id: USER_ID,
    data: value.data,
    version: value.version,
    updated_at: value.updatedAt ?? "2026-08-11T08:00:00.000Z",
    deleted_at: value.deletedAt ?? null,
  });
}

function getRemote(table: EntityTable, entityId: string) {
  return remoteMock.tables.get(REMOTE_TABLE[table])?.get(entityId);
}

function v2Conflict(overrides: Partial<ConflictRecord> = {}): ConflictRecord {
  return {
    id: "conflict-1",
    table: "goals",
    entityId: "goal-1",
    local: { id: "goal-1", name: "Local snapshot", version: 2 },
    remote: { id: "goal-1", name: "Remote snapshot", version: 5 },
    detectedAt: "2026-08-11T08:01:00.000Z",
    formatVersion: 2,
    remoteVersion: 5,
    remoteUpdatedAt: "2026-08-11T08:00:00.000Z",
    remoteDeletedAt: null,
    localUpdatedAt: "2026-08-11T07:59:00.000Z",
    ...overrides,
  };
}

async function putGoal(value: Record<string, unknown>) {
  await db.goals.put(value as never);
}

beforeEach(async () => {
  remoteMock.tables.clear();
  remoteMock.failFetch = false;
  remoteMock.conditionalUpdates.length = 0;
  remoteMock.unconditionalUpserts.length = 0;
  await db.delete();
  await db.open();
});

describe("computeSyncStatus", () => {
  it("offline wins", () => {
    expect(
      computeSyncStatus({ online: false, syncing: true, conflictCount: 0, pendingOutbox: 0 }),
    ).toBe("offline");
  });

  it("conflict", () => {
    expect(
      computeSyncStatus({ online: true, syncing: false, conflictCount: 1, pendingOutbox: 0 }),
    ).toBe("conflict");
  });

  it("syncing via outbox", () => {
    expect(
      computeSyncStatus({ online: true, syncing: false, conflictCount: 0, pendingOutbox: 3 }),
    ).toBe("syncing");
  });

  it("synced", () => {
    expect(
      computeSyncStatus({ online: true, syncing: false, conflictCount: 0, pendingOutbox: 0 }),
    ).toBe("synced");
  });
});

describe("atomic conflict resolution", () => {
  it("local-win keeps the current local row and creates exactly one guarded outbox item", async () => {
    await putGoal({ id: "goal-1", name: "Current local", version: 3, updatedAt: "local-now" });
    await enqueueOutbox("goals", "goal-1", "upsert", { id: "goal-1", name: "Older" }, 3);
    await db.conflicts.put(v2Conflict());

    const result = await resolveConflict("conflict-1", "local", USER_ID, {
      online: false,
      pushAfterResolve: false,
    });

    expect(result).toEqual({ status: "resolved-local" });
    expect((await db.goals.get("goal-1") as any).name).toBe("Current local");
    expect((await db.goals.get("goal-1") as any).version).toBe(6);
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].expectedRemoteVersion).toBe(5);
    expect(outbox[0].version).toBe(6);
    expect((outbox[0].payload as any).name).toBe("Current local");
    expect((await db.conflicts.get("conflict-1"))?.resolved).toBe("local");
    expect(await listConflicts()).toEqual([]);
  });

  it("server-win uses the current refetched row and removes only matching outbox", async () => {
    await putGoal({ id: "goal-1", name: "Local", version: 2 });
    await enqueueOutbox("goals", "goal-1", "upsert", { id: "goal-1", name: "Local" }, 2);
    await enqueueOutbox("transactions", "tx-1", "upsert", { id: "tx-1" }, 1);
    await db.conflicts.put(v2Conflict({ remote: { id: "goal-1", name: "Stale remote" } }));
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Current server", updatedAt: "server-current" },
      version: 8,
    });

    const result = await resolveConflict("conflict-1", "remote", USER_ID, { online: true });

    expect(result).toEqual({ status: "resolved-remote" });
    const local = await db.goals.get("goal-1") as any;
    expect(local.name).toBe("Current server");
    expect(local.version).toBe(8);
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].table).toBe("transactions");
    expect((await db.conflicts.get("conflict-1"))?.resolved).toBe("remote");
  });

  it("server-win tombstone soft-deletes without resurrecting stale remote data", async () => {
    await putGoal({ id: "goal-1", name: "Keep local fields", version: 2 });
    await enqueueOutbox("goals", "goal-1", "upsert", { id: "goal-1", name: "Local" }, 2);
    await db.conflicts.put(v2Conflict({ remote: { id: "goal-1", name: "Must not return" } }));
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Stale tombstone payload" },
      version: 9,
      deletedAt: "2026-08-11T08:05:00.000Z",
    });

    const result = await resolveConflict("conflict-1", "remote", USER_ID, { online: true });

    expect(result).toEqual({ status: "remote-deleted" });
    const local = await db.goals.get("goal-1") as any;
    expect(local.name).toBe("Keep local fields");
    expect(local.deletedAt).toBe("2026-08-11T08:05:00.000Z");
    expect(local.version).toBe(9);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.conflicts.get("conflict-1"))?.resolved).toBe("remote-deleted");
  });

  it("legacy conflict fails closed offline, on fetch failure, and when remote is not found", async () => {
    const legacy: ConflictRecord = {
      id: "legacy-1",
      table: "goals",
      entityId: "goal-1",
      local: { id: "goal-1", name: "Local" },
      remote: { id: "goal-1", name: "Stale" },
      detectedAt: "2026-08-11T08:00:00.000Z",
    };
    await putGoal({ id: "goal-1", name: "Local", version: 2 });
    await enqueueOutbox("goals", "goal-1", "upsert", legacy.local, 2);
    await db.conflicts.put(legacy);

    const offline = await resolveConflict("legacy-1", "remote", USER_ID, { online: false });
    expect(offline.status).toBe("needs-network-verification");

    remoteMock.failFetch = true;
    const failed = await resolveConflict("legacy-1", "remote", USER_ID, { online: true });
    expect(failed.status).toBe("needs-network-verification");

    remoteMock.failFetch = false;
    const notFound = await resolveConflict("legacy-1", "remote", USER_ID, { online: true });
    expect(notFound.status).toBe("needs-network-verification");
    expect((await db.goals.get("goal-1") as any).name).toBe("Local");
    expect(await db.outbox.count()).toBe(1);
    expect((await db.conflicts.get("legacy-1"))?.resolved).toBeUndefined();
  });

  it("legacy conflict refetches and never uses its stale remote snapshot", async () => {
    const legacy: ConflictRecord = {
      id: "legacy-1",
      table: "goals",
      entityId: "goal-1",
      local: { id: "goal-1", name: "Local" },
      remote: { id: "goal-1", name: "Stale snapshot" },
      detectedAt: "2026-08-11T08:00:00.000Z",
    };
    await putGoal({ id: "goal-1", name: "Local", version: 2 });
    await enqueueOutbox("goals", "goal-1", "upsert", legacy.local, 2);
    await db.conflicts.put(legacy);
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Fresh server" },
      version: 7,
    });

    const result = await resolveConflict("legacy-1", "remote", USER_ID, { online: true });

    expect(result).toEqual({ status: "resolved-remote" });
    expect((await db.goals.get("goal-1") as any).name).toBe("Fresh server");
    expect((await db.conflicts.get("legacy-1"))?.remoteVersion).toBe(7);
  });

  it("rolls back entity and outbox when conflict marking fails", async () => {
    await putGoal({ id: "goal-1", name: "Before", version: 2 });
    await enqueueOutbox("goals", "goal-1", "upsert", { id: "goal-1", name: "Before" }, 2);
    await db.conflicts.put(v2Conflict());
    const originalOutbox = await db.outbox.toArray();
    const putSpy = vi.spyOn(db.conflicts, "put").mockRejectedValueOnce(new Error("forced"));

    const result = await resolveConflict("conflict-1", "local", USER_ID, {
      online: false,
      pushAfterResolve: false,
    });
    putSpy.mockRestore();

    expect(result.status).toBe("failed");
    expect((await db.goals.get("goal-1") as any).name).toBe("Before");
    expect((await db.goals.get("goal-1") as any).version).toBe(2);
    expect(await db.outbox.toArray()).toEqual(originalOutbox);
    expect((await db.conflicts.get("conflict-1"))?.resolved).toBeUndefined();
  });

  it("is idempotent when the same resolution is retried", async () => {
    await putGoal({ id: "goal-1", name: "Local", version: 2 });
    await db.conflicts.put(v2Conflict());

    const first = await resolveConflict("conflict-1", "local", USER_ID, {
      online: false,
      pushAfterResolve: false,
    });
    const second = await resolveConflict("conflict-1", "local", USER_ID, {
      online: false,
      pushAfterResolve: false,
    });

    expect(first).toEqual({ status: "resolved-local" });
    expect(second).toEqual({ status: "resolved-local" });
    expect(await db.outbox.count()).toBe(1);
  });
});

describe("guarded conditional pushes", () => {
  it("never falls back to unconditional upsert on a version mismatch", async () => {
    await db.conflicts.put(v2Conflict({ id: "old-resolution", resolved: "local" }));
    await enqueueOutbox(
      "goals",
      "goal-1",
      "upsert",
      { id: "goal-1", name: "Chosen local", version: 6 },
      6,
      { expectedRemoteVersion: 5 },
    );
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Concurrent server", version: 7 },
      version: 7,
    });

    const push = await pushOutbox(USER_ID);

    expect(push).toMatchObject({ pushed: 0, errors: 1 });
    expect(await db.outbox.count()).toBe(1);
    expect(getRemote("goals", "goal-1")?.version).toBe(7);
    expect((getRemote("goals", "goal-1")?.data as any).name).toBe("Concurrent server");
    expect(remoteMock.unconditionalUpserts).toHaveLength(0);
    expect(remoteMock.conditionalUpdates).toHaveLength(1);
    expect(remoteMock.conditionalUpdates[0].filters).toEqual({
      user_id: USER_ID,
      id: "goal-1",
      version: 5,
    });
    expect(remoteMock.conditionalUpdates[0].updatedRows).toBe(0);
    expect((await db.conflicts.get("old-resolution"))?.resolved).toBe("local");

    await pullDelta(USER_ID);
    const unresolved = await listConflicts();
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].remoteVersion).toBe(7);
  });

  it("restores a remote tombstone exactly once with deleted_at null and next version", async () => {
    await putGoal({
      id: "goal-1",
      name: "Restore me",
      version: 2,
      deletedAt: "local-stale-marker",
    });
    await db.conflicts.put(v2Conflict({
      remoteDeletedAt: "2026-08-11T08:05:00.000Z",
      remoteVersion: 5,
    }));
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Old server payload", deletedAt: "old" },
      version: 5,
      deletedAt: "2026-08-11T08:05:00.000Z",
    });

    const result = await resolveConflict("conflict-1", "local", USER_ID, { online: true });

    expect(result).toEqual({ status: "resolved-local" });
    const remote = getRemote("goals", "goal-1") as any;
    expect(remote.deleted_at).toBeNull();
    expect(remote.version).toBe(6);
    expect(remote.data.name).toBe("Restore me");
    expect(remote.data.deletedAt).toBeUndefined();
    expect(remoteMock.conditionalUpdates).toHaveLength(1);
    expect(remoteMock.conditionalUpdates[0].updatedRows).toBe(1);
    expect(await db.outbox.count()).toBe(0);

    await pushOutbox(USER_ID);
    expect(remoteMock.conditionalUpdates).toHaveLength(1);
  });

  it("does not restore a tombstone after a concurrent version change", async () => {
    await putGoal({ id: "goal-1", name: "Restore me", version: 2 });
    await db.conflicts.put(v2Conflict({
      remoteDeletedAt: "2026-08-11T08:05:00.000Z",
      remoteVersion: 5,
    }));
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Concurrent tombstone" },
      version: 6,
      deletedAt: "2026-08-11T08:06:00.000Z",
    });

    const result = await resolveConflict("conflict-1", "local", USER_ID, { online: true });

    expect(result).toEqual({ status: "resolved-local" });
    const remote = getRemote("goals", "goal-1") as any;
    expect(remote.deleted_at).toBe("2026-08-11T08:06:00.000Z");
    expect(remote.version).toBe(6);
    expect(remoteMock.unconditionalUpserts).toHaveLength(0);
    expect(await db.outbox.count()).toBe(1);
    expect((await db.conflicts.get("conflict-1"))?.resolved).toBe("local");

    await pullDelta(USER_ID);
    const unresolved = await listConflicts();
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].remoteDeletedAt).toBe("2026-08-11T08:06:00.000Z");
    expect((await db.goals.get("goal-1") as any).deletedAt).toBeUndefined();
  });
});

describe("payload confidentiality", () => {
  it("does not log settings or Notfallmappe canary while resolving", async () => {
    const canary = ["NOTFALL", "MAPPE", "CANARY"].join("_");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await db.settings.put({ id: "settings", planName: "Local" } as never);
    const legacy: ConflictRecord = {
      id: "settings-conflict",
      table: "settings",
      entityId: "settings",
      local: { id: "settings", notfallmappe: { purpose: canary } },
      remote: { id: "settings", notfallmappe: { purpose: "stale" } },
      detectedAt: "2026-08-11T08:00:00.000Z",
    };
    await db.conflicts.put(legacy);
    setRemote("settings", "settings", {
      data: { id: "settings", notfallmappe: { purpose: canary } },
      version: 4,
    });

    const result = await resolveConflict("settings-conflict", "remote", USER_ID, {
      online: true,
    });

    expect(result).toEqual({ status: "resolved-remote" });
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});
