import type { Table } from "dexie";
import { supabase } from "../supabase";
import { db } from "../db.m01a";
import { nowIso, uid } from "../defaults";
import type {
  ConflictRecord,
  EntityTable,
  LocalPendingConflictReason,
  LocalSyncPendingReason,
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

const userSyncTails = new Map<string, Promise<void>>();

type SyncEntity = Record<string, unknown> & { id: string };
type SyncLockContext = { networkAllowed: boolean };
type BrowserLockManager = {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    callback: () => Promise<T>,
  ): Promise<T>;
};

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

type SelectedGuardedOutbox = Pick<
  OutboxItem,
  "id" | "table" | "entityId" | "version" | "expectedRemoteVersion"
>;

type PushItemOutcome =
  | { kind: "confirmed" }
  | { kind: "sync-pending"; reason: LocalSyncPendingReason; dead: boolean }
  | {
      kind: "pending-conflict";
      reason: LocalPendingConflictReason;
      dead: boolean;
    };

class ConditionalWriteMismatchError extends Error {
  constructor() {
    super("Conditional write mismatch");
    this.name = "ConditionalWriteMismatchError";
  }
}

function browserLockManager(): BrowserLockManager | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  const locks = (navigator as Navigator & { locks?: BrowserLockManager }).locks;
  return locks && typeof locks.request === "function" ? locks : null;
}

async function enqueueUserSync<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const previous = userSyncTails.get(userId) ?? Promise.resolve();
  let releaseGate: (() => void) | undefined;
  let released = false;
  const gate = new Promise<void>((resolve) => {
    releaseGate = () => resolve();
  });
  const release = (): void => {
    if (released) return;
    released = true;
    releaseGate?.();
  };
  const tail = previous.catch(() => undefined).then(() => gate);
  userSyncTails.set(userId, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (userSyncTails.get(userId) === tail) userSyncTails.delete(userId);
  }
}

async function withUserSyncLock<T>(
  userId: string,
  operation: (context: SyncLockContext) => Promise<T>,
): Promise<T> {
  return enqueueUserSync(userId, async () => {
    if (typeof window === "undefined") return operation({ networkAllowed: true });
    const locks = browserLockManager();
    if (!locks) return operation({ networkAllowed: false });
    return locks.request(`vwce-sync:${userId}`, { mode: "exclusive" }, () =>
      operation({ networkAllowed: true }),
    );
  });
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

async function priorResolution(
  conflict: ConflictRecord,
  online: boolean,
): Promise<ResolveConflictResult | null> {
  if (conflict.resolved === "remote") return { status: "resolved-remote" };
  if (conflict.resolved === "remote-deleted") return { status: "remote-deleted" };
  if (conflict.resolved !== "local") return null;

  const records = await db.conflicts.where("entityId").equals(conflict.entityId).toArray();
  const replacement = records.find(
    (record) => record.table === conflict.table && !record.resolved,
  );
  if (replacement) {
    return {
      status: "resolved-local-pending-conflict",
      reason: replacement.reasonCategory ?? "guarded-update-not-applied",
    };
  }
  const pending = await db.outbox.where("entityId").equals(conflict.entityId).toArray();
  if (pending.some((item) => item.table === conflict.table)) {
    return {
      status: "resolved-local-sync-pending",
      reason: online ? "sync-temporarily-unavailable" : "offline",
    };
  }
  return { status: "resolved-local" };
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
  options: {
    reasonCategory: LocalPendingConflictReason;
    supersedesConflictId?: string;
  },
): Promise<{ conflict: ConflictRecord; created: boolean }> {
  const records = await db.conflicts.where("entityId").equals(entityId).toArray();
  const matching = records.filter((record) => record.table === table && !record.resolved);
  const existing =
    matching.find((record) => record.sourceOutboxId === localPending.id) ?? matching[0];
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
    reasonCategory: options.reasonCategory,
    sourceOutboxId: localPending.id,
    ...(options.supersedesConflictId
      ? { supersedesConflictId: options.supersedesConflictId }
      : existing?.supersedesConflictId
        ? { supersedesConflictId: existing.supersedesConflictId }
        : {}),
  };
  await db.conflicts.put(next);
  return { conflict: next, created: !existing };
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
  if (!supabase) return { state: "unavailable", reason: "unavailable" };
  try {
    const { data, error } = await supabase
      .from(REMOTE_TABLE[table])
      .select("*")
      .eq("user_id", userId)
      .eq("id", entityId)
      .maybeSingle();
    if (error) return { state: "unavailable", reason: "unavailable" };
    if (!data) return { state: "not-found" };
    const parsed = parseRemoteRow(data);
    return parsed ?? { state: "unavailable", reason: "invalid-metadata" };
  } catch {
    return { state: "unavailable", reason: "unavailable" };
  }
}

async function pushOne(userId: string, item: OutboxItem): Promise<void> {
  if (!supabase) throw new Error("Sync unavailable");
  const remote = REMOTE_TABLE[item.table];
  if (item.op === "delete") {
    const { error } = await supabase
      .from(remote)
      .update({ deleted_at: nowIso() })
      .eq("user_id", userId)
      .eq("id", item.entityId);
    if (error) throw new Error("Sync failed");
    return;
  }

  if (item.expectedRemoteVersion !== undefined) {
    const cleanPayload = withoutDeletionMarkers(item.payload);
    if (!cleanPayload) throw new Error("Sync failed");
    const mutation = {
      data: cleanPayload,
      version: item.version,
      updated_at: nowIso(),
      deleted_at: null,
    };
    const { data, error } = await supabase
      .from(remote)
      .update(mutation)
      .eq("user_id", userId)
      .eq("id", item.entityId)
      .eq("version", item.expectedRemoteVersion)
      .select("id");
    if (error) throw new Error("Sync failed");
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
  if (error) throw new Error("Sync failed");
}

async function markOutboxFailure(itemId: string): Promise<boolean> {
  const current = await db.outbox.get(itemId);
  if (!current) return false;
  const attempts = current.attempts + 1;
  const dead = attempts >= 8;
  await db.outbox.put({
    ...current,
    attempts,
    lastError: "Sync failed",
    dead: dead ? true : current.dead,
  });
  return dead;
}

async function closeReplacementConflicts(item: OutboxItem): Promise<void> {
  const records = await db.conflicts.where("entityId").equals(item.entityId).toArray();
  for (const conflict of records) {
    if (
      conflict.table === item.table &&
      !conflict.resolved &&
      conflict.sourceOutboxId === item.id
    ) {
      await db.conflicts.put({ ...conflict, resolved: "local" });
    }
  }
}

async function attemptOutboxItem(
  userId: string,
  expectedItem: OutboxItem,
  supersedesConflictId?: string,
): Promise<PushItemOutcome> {
  const item = await db.outbox.get(expectedItem.id);
  if (
    !item ||
    item.table !== expectedItem.table ||
    item.entityId !== expectedItem.entityId ||
    item.version !== expectedItem.version ||
    item.expectedRemoteVersion !== expectedItem.expectedRemoteVersion
  ) {
    return { kind: "sync-pending", reason: "sync-temporarily-unavailable", dead: false };
  }

  try {
    await pushOne(userId, item);
    await db.transaction("rw", [db.outbox, db.conflicts], async () => {
      await db.outbox.delete(item.id);
      await closeReplacementConflicts(item);
    });
    return { kind: "confirmed" };
  } catch (error) {
    const dead = await markOutboxFailure(item.id);
    if (!(error instanceof ConditionalWriteMismatchError)) {
      return { kind: "sync-pending", reason: "sync-temporarily-unavailable", dead };
    }

    try {
      const remote = await fetchCurrentRemote(userId, item.table, item.entityId);
      if (remote.state !== "present" && remote.state !== "deleted") {
        return { kind: "sync-pending", reason: "sync-temporarily-unavailable", dead };
      }
      const reason: LocalPendingConflictReason =
        remote.version !== item.expectedRemoteVersion
          ? "server-version-changed"
          : "guarded-update-not-applied";
      await putUnresolvedConflict(item.table, item.entityId, item, remote, {
        reasonCategory: reason,
        supersedesConflictId,
      });
      return { kind: "pending-conflict", reason, dead };
    } catch {
      return { kind: "sync-pending", reason: "sync-temporarily-unavailable", dead };
    }
  }
}

async function pushOutboxUnlocked(
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
    const outcome = await attemptOutboxItem(userId, item);
    if (outcome.kind === "confirmed") pushed += 1;
    else {
      errors += 1;
      if (outcome.dead) dead += 1;
    }
  }
  if (pushed > 0) await saveSyncMeta({ userId, lastPushedAt: nowIso() });
  return { pushed, errors, dead };
}

export async function pushOutbox(
  userId: string,
): Promise<{ pushed: number; errors: number; dead: number }> {
  return withUserSyncLock(userId, ({ networkAllowed }) =>
    networkAllowed
      ? pushOutboxUnlocked(userId)
      : Promise.resolve({ pushed: 0, errors: 0, dead: 0 }),
  );
}

async function pullDeltaUnlocked(userId: string): Promise<{ pulled: number; conflicts: number }> {
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
    if (error) throw new Error("Sync failed");
    if (!data?.length) continue;

    for (const row of data) {
      const entityId = String(row.id);
      const currentRemote = parseRemoteRow(row);
      if (!currentRemote) throw new Error("Sync failed");

      const pending = await db.outbox.where("entityId").equals(entityId).toArray();
      const localPending = pending.find((item) => item.table === table);

      if (localPending && localPending.op === "upsert") {
        if (localPending.expectedRemoteVersion !== undefined) {
          if (localPending.expectedRemoteVersion !== currentRemote.version) {
            const result = await putUnresolvedConflict(
              table,
              entityId,
              localPending,
              currentRemote,
              { reasonCategory: "server-version-changed" },
            );
            if (result.created) conflicts += 1;
          }
          // A guarded target is intentionally expected+1. Never pull the
          // expected remote over it while the exact outbox item is pending.
          continue;
        }
        if (localPending.version !== currentRemote.version) {
          const result = await putUnresolvedConflict(
            table,
            entityId,
            localPending,
            currentRemote,
            { reasonCategory: "server-version-changed" },
          );
          if (result.created) conflicts += 1;
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
      if (!remotePayload) throw new Error("Sync failed");
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

export async function pullDelta(userId: string): Promise<{ pulled: number; conflicts: number }> {
  return withUserSyncLock(userId, ({ networkAllowed }) =>
    networkAllowed
      ? pullDeltaUnlocked(userId)
      : Promise.resolve({ pulled: 0, conflicts: 0 }),
  );
}

async function runSyncUnlocked(
  userId: string,
  networkAllowed: boolean,
): Promise<{ status: SyncStatus; pushed: number; pulled: number; conflicts: number }> {
  const online = isOnline();
  if (!online || !supabase || !networkAllowed) {
    const pending = await outboxCount();
    const conflicts = (await listConflicts()).length;
    return {
      status: computeSyncStatus({
        online: online && networkAllowed,
        syncing: false,
        conflictCount: conflicts,
        pendingOutbox: pending,
      }),
      pushed: 0,
      pulled: 0,
      conflicts,
    };
  }
  const push = await pushOutboxUnlocked(userId);
  const pull = await pullDeltaUnlocked(userId);
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

export async function runSync(userId: string): Promise<{
  status: SyncStatus;
  pushed: number;
  pulled: number;
  conflicts: number;
}> {
  return withUserSyncLock(userId, ({ networkAllowed }) =>
    runSyncUnlocked(userId, networkAllowed),
  );
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

async function resolveConflictUnlocked(
  conflictId: string,
  choice: "local" | "remote",
  userId: string,
  options: ResolveConflictOptions,
  networkAllowed: boolean,
): Promise<ResolveConflictResult> {
  const initial = await db.conflicts.get(conflictId);
  if (!initial) return { status: "failed", reason: "conflict-not-found" };
  const actualOnline = isOnline(options.online);
  const alreadyResolved = await priorResolution(initial, actualOnline);
  if (alreadyResolved) return alreadyResolved;

  const online = actualOnline && networkAllowed;
  const legacy = !isV2Conflict(initial);
  const mustFetch = choice === "remote" || legacy || typeof initial.remoteVersion !== "number";
  let currentRemote: VerifiedRemote | null = null;

  if (mustFetch) {
    if (!online) {
      return {
        status: "needs-network-verification",
        reason: actualOnline ? "remote-verification-unavailable" : "offline",
      };
    }
    const fetchRemote = options.fetchRemote ?? fetchCurrentRemote;
    const fetched = await fetchRemote(userId, initial.table, initial.entityId);
    if (fetched.state === "unavailable" || fetched.state === "not-found") {
      return {
        status: "needs-network-verification",
        reason: "remote-verification-unavailable",
      };
    }
    currentRemote = fetched;
  }

  const expectedRemoteVersion = currentRemote?.version ?? initial.remoteVersion;
  if (choice === "local" && typeof expectedRemoteVersion !== "number") {
    return {
      status: "needs-network-verification",
      reason: "remote-version-unavailable",
    };
  }

  const store = entityStore(initial.table);
  try {
    const transactionResult = await db.transaction(
      "rw",
      [store, db.outbox, db.conflicts],
      async (): Promise<
        | { kind: "result"; result: ResolveConflictResult }
        | { kind: "local"; item: OutboxItem; originalConflictId: string }
      > => {
        const conflict = await db.conflicts.get(conflictId);
        if (!conflict) {
          return { kind: "result", result: { status: "failed", reason: "conflict-not-found" } };
        }
        const prior = await priorResolution(conflict, actualOnline);
        if (prior) return { kind: "result", result: prior };

        if (choice === "local") {
          const currentLocal = await store.get(conflict.entityId);
          const cleanLocal = withoutDeletionMarkers(currentLocal);
          if (!cleanLocal) {
            return {
              kind: "result",
              result: { status: "failed", reason: "local-state-unavailable" },
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
          const candidates = await db.outbox.where("entityId").equals(conflict.entityId).toArray();
          const selected = candidates.filter(
            (item) =>
              item.table === conflict.table &&
              item.op === "upsert" &&
              item.version === nextVersion &&
              item.expectedRemoteVersion === expectedRemoteVersion,
          );
          if (selected.length !== 1) throw new Error("Guarded outbox selection failed");
          const resolved = currentRemote
            ? withRemoteMetadata(conflict, currentRemote)
            : conflict;
          await db.conflicts.put({ ...resolved, resolved: "local" });
          return {
            kind: "local",
            item: selected[0],
            originalConflictId: conflict.id,
          };
        }

        if (!currentRemote) {
          return {
            kind: "result",
            result: {
              status: "needs-network-verification",
              reason: "remote-verification-unavailable",
            },
          };
        }

        await removeOutboxForEntity(conflict.table, conflict.entityId);
        if (currentRemote.state === "deleted") {
          await applyRemoteDeletion(conflict.table, store, conflict.entityId, currentRemote);
          await db.conflicts.put({
            ...withRemoteMetadata(conflict, currentRemote),
            resolved: "remote-deleted",
          });
          return { kind: "result", result: { status: "remote-deleted" } };
        }

        const cleanRemote = withoutDeletionMarkers(currentRemote.data);
        if (!cleanRemote) throw new Error("Invalid remote entity");
        await store.put({
          ...cleanRemote,
          id: conflict.entityId,
          version: currentRemote.version,
        });
        await db.conflicts.put({
          ...withRemoteMetadata(conflict, currentRemote),
          resolved: "remote",
        });
        return { kind: "result", result: { status: "resolved-remote" } };
      },
    );

    if (transactionResult.kind === "result") return transactionResult.result;
    if (!actualOnline) {
      return { status: "resolved-local-sync-pending", reason: "offline" };
    }
    if (!networkAllowed || !supabase || options.pushAfterResolve === false) {
      return {
        status: "resolved-local-sync-pending",
        reason: "sync-temporarily-unavailable",
      };
    }

    const outcome = await attemptOutboxItem(
      userId,
      transactionResult.item,
      transactionResult.originalConflictId,
    );
    if (outcome.kind === "confirmed") {
      try {
        await saveSyncMeta({ userId, lastPushedAt: nowIso() });
      } catch {
        // Sync confirmation is based on guarded write + exact outbox removal.
      }
      return { status: "resolved-local" };
    }
    if (outcome.kind === "pending-conflict") {
      return { status: "resolved-local-pending-conflict", reason: outcome.reason };
    }
    return { status: "resolved-local-sync-pending", reason: outcome.reason };
  } catch {
    return { status: "failed", reason: "atomic-resolution-failed" };
  }
}

export async function resolveConflict(
  conflictId: string,
  choice: "local" | "remote",
  userId: string,
  options: ResolveConflictOptions = {},
): Promise<ResolveConflictResult> {
  return withUserSyncLock(userId, ({ networkAllowed }) =>
    resolveConflictUnlocked(conflictId, choice, userId, options, networkAllowed),
  );
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
