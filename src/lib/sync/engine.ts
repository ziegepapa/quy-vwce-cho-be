import type { Table } from "dexie";
import { supabase } from "../supabase";
import { db } from "../db.m01a";
import { nowIso, uid } from "../defaults";
import type {
  ConflictRecord,
  EntityTable,
  OutboxItem,
  ResolveConflictResult,
  SyncMeta,
  SyncStatus,
} from "./types";
import { enqueueOutbox, outboxCount, removeOutboxForEntity } from "./outbox";

export { enqueueOutbox, outboxCount, removeOutboxForEntity };

const REMOTE_TABLE: Record<EntityTable, string> = {
  settings: "app_settings",
  goals: "goals",
  transactions: "transactions",
  annualChecklists: "annual_checklists",
  monthlySnapshots: "monthly_snapshots",
};

const TABLES: EntityTable[] = [
  "settings",
  "goals",
  "transactions",
  "annualChecklists",
  "monthlySnapshots",
];

type SyncEntity = Record<string, unknown> & { id: string };

type VerifiedRemote = {
  state: "present" | "deleted";
  data: unknown;
  version: number;
  updatedAt: string | null;
  deletedAt: string | null;
};

export type RemoteFetchResult =
  | VerifiedRemote
  | { state: "not-found" }
  | { state: "unavailable"; reason: string };

export type ResolveConflictOptions = {
  online?: boolean;
  fetchRemote?: (
    userId: string,
    table: EntityTable,
    entityId: string,
  ) => Promise<RemoteFetchResult>;
  /** Tests and offline callers can keep the conditional outbox queued. */
  pushAfterResolve?: boolean;
};

class ConditionalWriteMismatchError extends Error {
  constructor() {
    super("Remote version changed; conditional sync did not update exactly one row.");
    this.name = "ConditionalWriteMismatchError";
  }
}

function entityStore(table: EntityTable): Table<SyncEntity, string> {
  if (table === "settings") return db.settings as unknown as Table<SyncEntity, string>;
  if (table === "goals") return db.goals as unknown as Table<SyncEntity, string>;
  if (table === "transactions") return db.transactions as unknown as Table<SyncEntity, string>;
  if (table === "annualChecklists") {
    return db.annualChecklists as unknown as Table<SyncEntity, string>;
  }
  return db.monthlySnapshots as unknown as Table<SyncEntity, string>;
}

function objectPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function withoutDeletionMarkers(value: unknown): Record<string, unknown> | null {
  const payload = objectPayload(value);
  if (!payload) return null;
  const next = { ...payload };
  delete next.deletedAt;
  delete next.deleted_at;
  return next;
}

function payloadVersion(value: unknown): number {
  const payload = objectPayload(value);
  const version = payload?.version;
  return typeof version === "number" && Number.isFinite(version) ? version : 0;
}

function payloadUpdatedAt(value: unknown): string | null {
  const payload = objectPayload(value);
  return typeof payload?.updatedAt === "string" ? payload.updatedAt : null;
}

function parseRemoteRow(value: unknown): VerifiedRemote | null {
  const row = objectPayload(value);
  if (!row) return null;
  if (typeof row.version !== "number" || !Number.isFinite(row.version)) return null;
  if (row.deleted_at !== null && typeof row.deleted_at !== "string") return null;
  const deletedAt = row.deleted_at as string | null;
  return {
    state: deletedAt ? "deleted" : "present",
    data: row.data,
    version: row.version,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    deletedAt,
  };
}

function isOnline(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function isV2Conflict(conflict: ConflictRecord): boolean {
  return (
    conflict.formatVersion === 2 &&
    typeof conflict.remoteVersion === "number" &&
    Object.prototype.hasOwnProperty.call(conflict, "remoteDeletedAt")
  );
}

function priorResolution(conflict: ConflictRecord): ResolveConflictResult | null {
  if (conflict.resolved === "local") return { status: "resolved-local" };
  if (conflict.resolved === "remote") return { status: "resolved-remote" };
  if (conflict.resolved === "remote-deleted") return { status: "remote-deleted" };
  return null;
}

function withRemoteMetadata(
  conflict: ConflictRecord,
  remote: VerifiedRemote,
): ConflictRecord {
  return {
    ...conflict,
    formatVersion: 2,
    remote: remote.data,
    remoteVersion: remote.version,
    remoteUpdatedAt: remote.updatedAt,
    remoteDeletedAt: remote.deletedAt,
  };
}

async function putUnresolvedConflict(
  table: EntityTable,
  entityId: string,
  localPending: OutboxItem,
  remote: VerifiedRemote,
): Promise<void> {
  const records = await db.conflicts.where("entityId").equals(entityId).toArray();
  const existing = records.find((record) => record.table === table && !record.resolved);
  const next: ConflictRecord = {
    id: existing?.id ?? uid(),
    table,
    entityId,
    local: localPending.payload,
    remote: remote.data,
    detectedAt: nowIso(),
    formatVersion: 2,
    remoteVersion: remote.version,
    remoteUpdatedAt: remote.updatedAt,
    remoteDeletedAt: remote.deletedAt,
    localUpdatedAt: payloadUpdatedAt(localPending.payload),
  };
  await db.conflicts.put(next);
}

export function computeSyncStatus(opts: {
  online: boolean;
  syncing: boolean;
  conflictCount: number;
  pendingOutbox: number;
}): SyncStatus {
  if (!opts.online) return "offline";
  if (opts.conflictCount > 0) return "conflict";
  if (opts.syncing || opts.pendingOutbox > 0) return "syncing";
  return "synced";
}

export async function getSyncMeta(userId: string): Promise<SyncMeta> {
  const id = `user_${userId}`;
  const existing = await db.syncMeta.get(id);
  if (existing) return existing;
  const meta: SyncMeta = {
    id,
    userId,
    lastPulledAt: "",
    lastPushedAt: "",
    migrateWizardDone: false,
    migrateWizardSkipped: false,
    updatedAt: nowIso(),
  };
  await db.syncMeta.put(meta);
  return meta;
}

export async function saveSyncMeta(partial: Partial<SyncMeta> & { userId: string }): Promise<SyncMeta> {
  const current = await getSyncMeta(partial.userId);
  const next = { ...current, ...partial, id: `user_${partial.userId}`, updatedAt: nowIso() };
  await db.syncMeta.put(next);
  return next;
}

export async function listConflicts(): Promise<ConflictRecord[]> {
  return db.conflicts.filter((conflict) => !conflict.resolved).toArray();
}

export async function fetchCurrentRemote(
  userId: string,
  table: EntityTable,
  entityId: string,
): Promise<RemoteFetchResult> {
  if (!supabase) return { state: "unavailable", reason: "Supabase chưa cấu hình." };
  try {
    const { data, error } = await supabase
      .from(REMOTE_TABLE[table])
      .select("*")
      .eq("user_id", userId)
      .eq("id", entityId)
      .maybeSingle();
    if (error) {
      return { state: "unavailable", reason: "Không thể xác minh bản server." };
    }
    if (!data) return { state: "not-found" };
    const parsed = parseRemoteRow(data);
    if (!parsed) {
      return { state: "unavailable", reason: "Metadata bản server không hợp lệ." };
    }
    return parsed;
  } catch {
    return { state: "unavailable", reason: "Không thể xác minh bản server." };
  }
}

async function pushOne(userId: string, item: OutboxItem): Promise<void> {
  if (!supabase) throw new Error("Supabase chưa cấu hình");
  const remote = REMOTE_TABLE[item.table];
  if (item.op === "delete") {
    const { error } = await supabase
      .from(remote)
      .update({ deleted_at: nowIso() })
      .eq("user_id", userId)
      .eq("id", item.entityId);
    if (error) throw error;
    return;
  }

  if (item.expectedRemoteVersion !== undefined) {
    const cleanPayload = withoutDeletionMarkers(item.payload);
    if (!cleanPayload) throw new Error("Conditional sync payload không hợp lệ");
    const mutation = {
      data: cleanPayload,
      version: item.version,
      updated_at: nowIso(),
      // Local-win against a tombstone is an explicit restore.
      deleted_at: null,
    };
    const { data, error } = await supabase
      .from(remote)
      .update(mutation)
      .eq("user_id", userId)
      .eq("id", item.entityId)
      .eq("version", item.expectedRemoteVersion)
      .select("id");
    if (error) throw error;
    if (!data || data.length !== 1) throw new ConditionalWriteMismatchError();
    return;
  }

  const row = {
    id: item.entityId,
    user_id: userId,
    data: item.payload,
    version: item.version,
    updated_at: nowIso(),
    deleted_at: null,
  };
  const { error } = await supabase.from(remote).upsert(row, { onConflict: "user_id,id" });
  if (error) throw error;
}

async function refreshConflictAfterConditionalMismatch(
  userId: string,
  item: OutboxItem,
): Promise<void> {
  const remote = await fetchCurrentRemote(userId, item.table, item.entityId);
  if (remote.state === "present" || remote.state === "deleted") {
    await putUnresolvedConflict(item.table, item.entityId, item, remote);
  }
}

export async function pushOutbox(
  userId: string,
): Promise<{ pushed: number; errors: number; dead: number }> {
  if (!supabase) return { pushed: 0, errors: 0, dead: 0 };
  const items = await db.outbox.orderBy("createdAt").toArray();
  let pushed = 0;
  let errors = 0;
  let dead = 0;
  for (const item of items) {
    if (item.dead) {
      dead += 1;
      continue;
    }
    try {
      await pushOne(userId, item);
      await db.outbox.delete(item.id);
      pushed += 1;
    } catch (error) {
      errors += 1;
      const attempts = item.attempts + 1;
      const markDead = attempts >= 8;
      await db.outbox.put({
        ...item,
        attempts,
        lastError: error instanceof Error ? error.message : "Sync failed",
        dead: markDead ? true : item.dead,
      });
      if (error instanceof ConditionalWriteMismatchError) {
        try {
          await refreshConflictAfterConditionalMismatch(userId, item);
        } catch {
          // The guarded outbox remains authoritative until verification succeeds.
        }
      }
      if (markDead) dead += 1;
    }
  }
  if (pushed > 0) await saveSyncMeta({ userId, lastPushedAt: nowIso() });
  return { pushed, errors, dead };
}

export async function pullDelta(userId: string): Promise<{ pulled: number; conflicts: number }> {
  if (!supabase) return { pulled: 0, conflicts: 0 };
  const meta = await getSyncMeta(userId);
  let pulled = 0;
  let conflicts = 0;
  const since = meta.lastPulledAt || "1970-01-01T00:00:00.000Z";

  for (const table of TABLES) {
    const remote = REMOTE_TABLE[table];
    const { data, error } = await supabase
      .from(remote)
      .select("*")
      .eq("user_id", userId)
      .gt("updated_at", since)
      .order("updated_at", { ascending: true });
    if (error) throw error;
    if (!data?.length) continue;

    for (const row of data) {
      const entityId = String(row.id);
      const currentRemote = parseRemoteRow(row);
      if (!currentRemote) throw new Error("Remote sync metadata không hợp lệ");

      const pending = await db.outbox.where("entityId").equals(entityId).toArray();
      const localPending = pending.find((item) => item.table === table);

      if (localPending && localPending.op === "upsert") {
        const targetVersionChanged = localPending.version !== currentRemote.version;
        const guardedVersionChanged =
          localPending.expectedRemoteVersion !== undefined &&
          localPending.expectedRemoteVersion !== currentRemote.version;
        if (targetVersionChanged || guardedVersionChanged) {
          await putUnresolvedConflict(table, entityId, localPending, currentRemote);
          conflicts += 1;
          continue;
        }
      }

      if (currentRemote.state === "deleted") {
        const deletedAt = currentRemote.deletedAt as string;
        if (table === "settings") await db.settings.delete(entityId);
        else if (table === "goals") {
          const goal = await db.goals.get(entityId);
          if (goal) {
            await db.goals.put({
              ...goal,
              deletedAt,
              updatedAt: currentRemote.updatedAt ?? deletedAt,
              version: currentRemote.version,
            } as never);
          }
        } else if (table === "transactions") {
          const transaction = await db.transactions.get(entityId);
          if (transaction) {
            await db.transactions.put({
              ...transaction,
              deletedAt,
              updatedAt: currentRemote.updatedAt ?? deletedAt,
              version: currentRemote.version,
            } as never);
          }
        } else if (table === "annualChecklists") await db.annualChecklists.delete(entityId);
        else if (table === "monthlySnapshots") await db.monthlySnapshots.delete(entityId);
        pulled += 1;
        continue;
      }

      const remotePayload = withoutDeletionMarkers(currentRemote.data);
      if (!remotePayload) throw new Error("Remote entity payload không hợp lệ");
      const payload = {
        ...remotePayload,
        id: entityId,
        version: currentRemote.version,
      } as Record<string, unknown>;
      if (table === "settings") await db.settings.put(payload as never);
      else if (table === "goals") await db.goals.put(payload as never);
      else if (table === "transactions") await db.transactions.put(payload as never);
      else if (table === "annualChecklists") await db.annualChecklists.put(payload as never);
      else if (table === "monthlySnapshots") await db.monthlySnapshots.put(payload as never);
      pulled += 1;
    }
  }

  await saveSyncMeta({ userId, lastPulledAt: nowIso() });
  return { pulled, conflicts };
}

export async function runSync(userId: string): Promise<{
  status: SyncStatus;
  pushed: number;
  pulled: number;
  conflicts: number;
}> {
  const online = isOnline();
  if (!online || !supabase) {
    const pending = await outboxCount();
    const conflicts = (await listConflicts()).length;
    return {
      status: computeSyncStatus({
        online: false,
        syncing: false,
        conflictCount: conflicts,
        pendingOutbox: pending,
      }),
      pushed: 0,
      pulled: 0,
      conflicts,
    };
  }
  const push = await pushOutbox(userId);
  const pull = await pullDelta(userId);
  const pending = await outboxCount();
  const conflicts = (await listConflicts()).length;
  return {
    status: computeSyncStatus({
      online: true,
      syncing: false,
      conflictCount: conflicts,
      pendingOutbox: pending,
    }),
    pushed: push.pushed,
    pulled: pull.pulled,
    conflicts,
  };
}

async function applyRemoteDeletion(
  table: EntityTable,
  store: Table<SyncEntity, string>,
  entityId: string,
  remote: VerifiedRemote,
): Promise<void> {
  if (table === "goals" || table === "transactions") {
    const current = await store.get(entityId);
    if (current) {
      await store.put({
        ...current,
        id: entityId,
        deletedAt: remote.deletedAt,
        updatedAt: remote.updatedAt ?? remote.deletedAt ?? nowIso(),
        version: remote.version,
      });
    } else {
      await store.delete(entityId);
    }
    return;
  }
  await store.delete(entityId);
}

export async function resolveConflict(
  conflictId: string,
  choice: "local" | "remote",
  userId: string,
  options: ResolveConflictOptions = {},
): Promise<ResolveConflictResult> {
  const initial = await db.conflicts.get(conflictId);
  if (!initial) return { status: "failed", reason: "Không tìm thấy xung đột." };
  const alreadyResolved = priorResolution(initial);
  if (alreadyResolved) return alreadyResolved;

  const online = isOnline(options.online);
  const legacy = !isV2Conflict(initial);
  const mustFetch = choice === "remote" || legacy || typeof initial.remoteVersion !== "number";
  let currentRemote: VerifiedRemote | null = null;

  if (mustFetch) {
    if (!online) {
      return {
        status: "needs-network-verification",
        reason: "Không thể xác minh bản server; giữ nguyên dữ liệu và thử lại khi online.",
      };
    }
    const fetchRemote = options.fetchRemote ?? fetchCurrentRemote;
    const fetched = await fetchRemote(userId, initial.table, initial.entityId);
    if (fetched.state === "unavailable" || fetched.state === "not-found") {
      return {
        status: "needs-network-verification",
        reason: "Không thể xác minh bản server; giữ nguyên dữ liệu và thử lại khi online.",
      };
    }
    currentRemote = fetched;
  }

  const expectedRemoteVersion = currentRemote?.version ?? initial.remoteVersion;
  if (choice === "local" && typeof expectedRemoteVersion !== "number") {
    return {
      status: "needs-network-verification",
      reason: "Không thể xác minh version server; xung đột chưa được thay đổi.",
    };
  }

  const store = entityStore(initial.table);
  try {
    const result = await db.transaction(
      "rw",
      [store, db.outbox, db.conflicts],
      async (): Promise<ResolveConflictResult> => {
        const conflict = await db.conflicts.get(conflictId);
        if (!conflict) return { status: "failed", reason: "Không tìm thấy xung đột." };
        const prior = priorResolution(conflict);
        if (prior) return prior;

        if (choice === "local") {
          const currentLocal = await store.get(conflict.entityId);
          const cleanLocal = withoutDeletionMarkers(currentLocal);
          if (!cleanLocal) {
            return {
              status: "failed",
              reason: "Không tìm thấy bản local hiện tại; xung đột được giữ nguyên.",
            };
          }
          const nextVersion =
            Math.max(payloadVersion(cleanLocal), expectedRemoteVersion as number) + 1;
          const localPayload: SyncEntity = {
            ...cleanLocal,
            id: conflict.entityId,
            version: nextVersion,
          };
          await store.put(localPayload);
          await enqueueOutbox(
            conflict.table,
            conflict.entityId,
            "upsert",
            localPayload,
            nextVersion,
            { expectedRemoteVersion: expectedRemoteVersion as number },
          );
          const resolved = currentRemote
            ? withRemoteMetadata(conflict, currentRemote)
            : conflict;
          await db.conflicts.put({ ...resolved, resolved: "local" });
          return { status: "resolved-local" };
        }

        if (!currentRemote) {
          return {
            status: "needs-network-verification",
            reason: "Không thể xác minh bản server; xung đột chưa được thay đổi.",
          };
        }

        await removeOutboxForEntity(conflict.table, conflict.entityId);
        if (currentRemote.state === "deleted") {
          await applyRemoteDeletion(conflict.table, store, conflict.entityId, currentRemote);
          await db.conflicts.put({
            ...withRemoteMetadata(conflict, currentRemote),
            resolved: "remote-deleted",
          });
          return { status: "remote-deleted" };
        }

        const cleanRemote = withoutDeletionMarkers(currentRemote.data);
        if (!cleanRemote) {
          throw new Error("Remote entity payload không hợp lệ");
        }
        await store.put({
          ...cleanRemote,
          id: conflict.entityId,
          version: currentRemote.version,
        });
        await db.conflicts.put({
          ...withRemoteMetadata(conflict, currentRemote),
          resolved: "remote",
        });
        return { status: "resolved-remote" };
      },
    );

    if (
      result.status === "resolved-local" &&
      online &&
      options.pushAfterResolve !== false
    ) {
      await pushOutbox(userId);
    }
    return result;
  } catch {
    return {
      status: "failed",
      reason: "Không thể áp dụng resolution atomically; dữ liệu được giữ nguyên.",
    };
  }
}

export async function listDeadOutbox(): Promise<OutboxItem[]> {
  const all = await db.outbox.toArray();
  return all.filter((item) => item.dead === true);
}

export async function reviveDeadOutbox(): Promise<number> {
  const dead = await listDeadOutbox();
  for (const item of dead) {
    await db.outbox.put({ ...item, dead: false, attempts: 0, lastError: undefined });
  }
  return dead.length;
}
