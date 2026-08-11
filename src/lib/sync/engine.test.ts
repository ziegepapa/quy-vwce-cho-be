import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const remoteMock = vi.hoisted(() => ({
  tables: new Map<string, Map<string, Record<string, unknown>>>(),
  failFetch: false,
  failUpdate: false,
  forceConditionalZeroRows: false,
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
      if (remoteMock.failUpdate) return { data: null, error: { message: "private backend error" } };
      const conditional = Object.prototype.hasOwnProperty.call(filters, "version");
      const matched = matchingRows();
      const rows = conditional && remoteMock.forceConditionalZeroRows ? [] : matched;
      for (const row of rows) {
        rowsFor(table).set(String(row.id), { ...row, ...updatePayload });
      }
      if (conditional) {
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
const CANARY = "NOTFALLMAPPE_CONTACT_DOCUMENT_LOCATION_SECRET";
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
  value: { data: unknown; version: number; updatedAt?: string; deletedAt?: string | null },
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

function conflict(overrides: Partial<ConflictRecord> = {}): ConflictRecord {
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
  remoteMock.failUpdate = false;
  remoteMock.forceConditionalZeroRows = false;
  remoteMock.conditionalUpdates.length = 0;
  remoteMock.unconditionalUpserts.length = 0;
  await db.delete();
  await db.open();
});

describe("computeSyncStatus", () => {
  it("keeps offline, conflict, syncing and synced precedence", () => {
    expect(computeSyncStatus({ online: false, syncing: true, conflictCount: 1, pendingOutbox: 1 })).toBe("offline");
    expect(computeSyncStatus({ online: true, syncing: false, conflictCount: 1, pendingOutbox: 0 })).toBe("conflict");
    expect(computeSyncStatus({ online: true, syncing: false, conflictCount: 0, pendingOutbox: 1 })).toBe("syncing");
    expect(computeSyncStatus({ online: true, syncing: false, conflictCount: 0, pendingOutbox: 0 })).toBe("synced");
  });
});

describe("truthful local resolution outcomes", () => {
  it("returns sync-pending offline after atomically saving the local choice", async () => {
    await putGoal({ id: "goal-1", name: "Current local", version: 3, updatedAt: "local-now" });
    await db.conflicts.put(conflict());

    const result = await resolveConflict("conflict-1", "local", USER_ID, { online: false });

    expect(result).toEqual({ status: "resolved-local-sync-pending", reason: "offline" });
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].expectedRemoteVersion).toBe(5);
    expect(outbox[0].version).toBe(6);
    expect((await db.conflicts.get("conflict-1"))?.resolved).toBe("local");
  });

  it("returns resolved-local only after the exact guarded write and outbox removal", async () => {
    await putGoal({ id: "goal-1", name: "Chosen local", version: 3 });
    await db.conflicts.put(conflict());
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Server before" },
      version: 5,
    });

    const result = await resolveConflict("conflict-1", "local", USER_ID, { online: true });

    expect(result).toEqual({ status: "resolved-local" });
    expect(await db.outbox.count()).toBe(0);
    expect(remoteMock.conditionalUpdates).toHaveLength(1);
    expect(remoteMock.conditionalUpdates[0].updatedRows).toBe(1);
    expect(remoteMock.conditionalUpdates[0].filters).toEqual({
      user_id: USER_ID,
      id: "goal-1",
      version: 5,
    });
    expect((getRemote("goals", "goal-1")?.data as any).name).toBe("Chosen local");
    expect(getRemote("goals", "goal-1")?.version).toBe(6);
    expect(remoteMock.unconditionalUpserts).toHaveLength(0);
    expect(await listConflicts()).toEqual([]);
  });

  it("covers production mismatch with one replacement conflict and no overwrite", async () => {
    await putGoal({ id: "goal-1", name: "Chosen local", version: 3 });
    await db.conflicts.put(conflict());
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Concurrent server" },
      version: 7,
    });

    const result = await resolveConflict("conflict-1", "local", USER_ID, { online: true });

    expect(result).toEqual({
      status: "resolved-local-pending-conflict",
      reason: "server-version-changed",
    });
    expect(await db.outbox.count()).toBe(1);
    expect((await db.conflicts.get("conflict-1"))?.resolved).toBe("local");
    const unresolved = await listConflicts();
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].id).not.toBe("conflict-1");
    expect(unresolved[0].reasonCategory).toBe("server-version-changed");
    expect(unresolved[0].supersedesConflictId).toBe("conflict-1");
    expect(unresolved[0].sourceOutboxId).toBe((await db.outbox.toArray())[0].id);
    expect((getRemote("goals", "goal-1")?.data as any).name).toBe("Concurrent server");
    expect(getRemote("goals", "goal-1")?.version).toBe(7);
    expect(remoteMock.unconditionalUpserts).toHaveLength(0);
  });

  it("classifies zero rows with the same refetched version as guarded-update-not-applied", async () => {
    await putGoal({ id: "goal-1", name: "Chosen local", version: 3 });
    await db.conflicts.put(conflict());
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Server unchanged" },
      version: 5,
    });
    remoteMock.forceConditionalZeroRows = true;

    const result = await resolveConflict("conflict-1", "local", USER_ID, { online: true });

    expect(result).toEqual({
      status: "resolved-local-pending-conflict",
      reason: "guarded-update-not-applied",
    });
    expect(await db.outbox.count()).toBe(1);
    expect(await listConflicts()).toHaveLength(1);
    expect((await listConflicts())[0].reasonCategory).toBe("guarded-update-not-applied");
    expect(getRemote("goals", "goal-1")?.version).toBe(5);
    expect(remoteMock.unconditionalUpserts).toHaveLength(0);
  });

  it("returns sync-pending for a transient non-conflict push failure", async () => {
    await putGoal({ id: "goal-1", name: "Chosen local", version: 3 });
    await db.conflicts.put(conflict());
    setRemote("goals", "goal-1", { data: { id: "goal-1" }, version: 5 });
    remoteMock.failUpdate = true;

    const result = await resolveConflict("conflict-1", "local", USER_ID, { online: true });

    expect(result).toEqual({
      status: "resolved-local-sync-pending",
      reason: "sync-temporarily-unavailable",
    });
    expect(await db.outbox.count()).toBe(1);
    expect(await listConflicts()).toEqual([]);
    expect(getRemote("goals", "goal-1")?.version).toBe(5);
  });

  it("keeps remote resolution and tombstone semantics", async () => {
    await putGoal({ id: "goal-1", name: "Local", version: 2 });
    await enqueueOutbox("goals", "goal-1", "upsert", { id: "goal-1" }, 2);
    await db.conflicts.put(conflict());
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Current server" },
      version: 8,
    });

    expect(await resolveConflict("conflict-1", "remote", USER_ID, { online: true })).toEqual({
      status: "resolved-remote",
    });
    expect((await db.goals.get("goal-1") as any).name).toBe("Current server");
    expect(await db.outbox.count()).toBe(0);

    await db.conflicts.put(conflict({ id: "conflict-2", remoteVersion: 8 }));
    await enqueueOutbox("goals", "goal-1", "upsert", { id: "goal-1" }, 8);
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Stale tombstone data" },
      version: 9,
      deletedAt: "2026-08-11T08:05:00.000Z",
    });
    expect(await resolveConflict("conflict-2", "remote", USER_ID, { online: true })).toEqual({
      status: "remote-deleted",
    });
    expect((await db.goals.get("goal-1") as any).deletedAt).toBe("2026-08-11T08:05:00.000Z");
  });
});

describe("guarded pull policy", () => {
  it("does not false-conflict expected=5 target=6 remote=5", async () => {
    await putGoal({ id: "goal-1", name: "Chosen local", version: 6 });
    await enqueueOutbox(
      "goals",
      "goal-1",
      "upsert",
      { id: "goal-1", name: "Chosen local", version: 6 },
      6,
      { expectedRemoteVersion: 5 },
    );
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Expected server" },
      version: 5,
    });

    const result = await pullDelta(USER_ID);

    expect(result.conflicts).toBe(0);
    expect(await listConflicts()).toEqual([]);
    expect((await db.goals.get("goal-1") as any).version).toBe(6);
    expect((await db.goals.get("goal-1") as any).name).toBe("Chosen local");
    expect(await db.outbox.count()).toBe(1);
  });

  it("creates exactly one replacement for expected=5 target=6 remote=7", async () => {
    await putGoal({ id: "goal-1", name: "Chosen local", version: 6 });
    await enqueueOutbox(
      "goals",
      "goal-1",
      "upsert",
      { id: "goal-1", name: "Chosen local", version: 6 },
      6,
      { expectedRemoteVersion: 5 },
    );
    setRemote("goals", "goal-1", {
      data: { id: "goal-1", name: "Diverged" },
      version: 7,
    });

    await pullDelta(USER_ID);
    await pullDelta(USER_ID);

    const unresolved = await listConflicts();
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].remoteVersion).toBe(7);
    expect(unresolved[0].reasonCategory).toBe("server-version-changed");
    expect(await db.outbox.count()).toBe(1);
  });

  it("does not relax ordinary non-guarded outbox conflict detection", async () => {
    await putGoal({ id: "goal-1", name: "Ordinary local", version: 2 });
    await enqueueOutbox("goals", "goal-1", "upsert", { id: "goal-1", version: 2 }, 2);
    setRemote("goals", "goal-1", { data: { id: "goal-1" }, version: 4 });

    await pullDelta(USER_ID);

    expect(await listConflicts()).toHaveLength(1);
    expect(await db.outbox.count()).toBe(1);
  });
});

describe("per-user serialization", () => {
  it("allows only one of two simultaneous pushes to process the same item", async () => {
    await enqueueOutbox(
      "goals",
      "goal-1",
      "upsert",
      { id: "goal-1", name: "Chosen local", version: 6 },
      6,
      { expectedRemoteVersion: 5 },
    );
    setRemote("goals", "goal-1", { data: { id: "goal-1" }, version: 5 });

    const results = await Promise.all([pushOutbox(USER_ID), pushOutbox(USER_ID)]);

    expect(results.reduce((sum, result) => sum + result.pushed, 0)).toBe(1);
    expect(remoteMock.conditionalUpdates).toHaveLength(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it("serializes concurrent push/pull without a stale conflict after success", async () => {
    await putGoal({ id: "goal-1", name: "Chosen local", version: 6 });
    await enqueueOutbox(
      "goals",
      "goal-1",
      "upsert",
      { id: "goal-1", name: "Chosen local", version: 6 },
      6,
      { expectedRemoteVersion: 5 },
    );
    setRemote("goals", "goal-1", { data: { id: "goal-1", name: "Before" }, version: 5 });

    await Promise.all([pushOutbox(USER_ID), pullDelta(USER_ID)]);

    expect(remoteMock.conditionalUpdates).toHaveLength(1);
    expect(await db.outbox.count()).toBe(0);
    expect(await listConflicts()).toEqual([]);
    expect(getRemote("goals", "goal-1")?.version).toBe(6);
  });

  it("cleans a rejected queue tail so the next operation can run", async () => {
    remoteMock.failFetch = true;
    await expect(pullDelta(USER_ID)).rejects.toThrow("Sync failed");
    remoteMock.failFetch = false;
    await expect(pullDelta(USER_ID)).resolves.toMatchObject({ conflicts: 0 });
  });
});

describe("payload confidentiality", () => {
  it("does not expose or log settings and Notfallmappe canaries", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await db.settings.put({ id: "settings", privateValue: CANARY, version: 2 } as never);
    await db.conflicts.put(conflict({
      id: "settings-conflict",
      table: "settings",
      entityId: "settings",
      local: { privateValue: CANARY },
      remote: { privateValue: CANARY },
    }));
    setRemote("settings", "settings", {
      data: { id: "settings", privateValue: CANARY },
      version: 7,
    });

    const result = await resolveConflict("settings-conflict", "local", USER_ID, { online: true });

    expect(JSON.stringify(result)).not.toContain(CANARY);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});
