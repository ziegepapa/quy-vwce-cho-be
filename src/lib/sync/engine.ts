import { supabase } from "../supabase";
import { db } from "../db";
import { nowIso, uid } from "../defaults";
import type { ConflictRecord, EntityTable, OutboxItem, SyncMeta, SyncStatus } from "./types";
import { enqueueOutbox, outboxCount } from "./outbox";

export { enqueueOutbox, outboxCount };

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
  return db.conflicts.filter((c) => !c.resolved).toArray();
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

export async function pushOutbox(
  userId: string,
): Promise<{ pushed: number; errors: number; dead: number }> {
  if (!supabase) return { pushed: 0, errors: 0, dead: 0 };
  const items = await db.outbox.orderBy("createdAt").toArray();
  let pushed = 0;
  let errors = 0;
  let dead = 0;
  for (const item of items) {
    // Bỏ qua mục đã chết — không chặn hàng đợi phía sau
    if (item.dead) {
      dead += 1;
      continue;
    }
    try {
      await pushOne(userId, item);
      await db.outbox.delete(item.id);
      pushed += 1;
    } catch (e) {
      errors += 1;
      const attempts = item.attempts + 1;
      const markDead = attempts >= 8;
      await db.outbox.put({
        ...item,
        attempts,
        lastError: e instanceof Error ? e.message : String(e),
        dead: markDead ? true : item.dead,
      });
      if (markDead) dead += 1;
      // continue — thử các mục tiếp theo
    }
  }
  if (pushed > 0) await saveSyncMeta({ userId, lastPushedAt: nowIso() });
  return { pushed, errors, dead };
}

function localVersion(row: unknown): number {
  if (row && typeof row === "object" && "version" in row) {
    const v = (row as { version?: number }).version;
    return typeof v === "number" ? v : 1;
  }
  return 1;
}

function localUpdated(row: unknown): string {
  if (row && typeof row === "object" && "updatedAt" in row) {
    return String((row as { updatedAt?: string }).updatedAt ?? "");
  }
  return "";
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
      .select("id, data, version, updated_at, deleted_at")
      .eq("user_id", userId)
      .gt("updated_at", since);
    if (error) throw error;
    if (!data?.length) continue;

    for (const row of data) {
      const entityId = row.id as string;
      if (row.deleted_at) {
        if (table === "settings") await db.settings.delete(entityId);
        else if (table === "goals") await db.goals.delete(entityId);
        else if (table === "transactions") await db.transactions.delete(entityId);
        else if (table === "annualChecklists") await db.annualChecklists.delete(entityId);
        else if (table === "monthlySnapshots") await db.monthlySnapshots.delete(entityId);
        pulled += 1;
        continue;
      }

      const payload = row.data as Record<string, unknown>;
      const remoteVer = (row.version as number) ?? 1;
      const remoteUpdated = (row.updated_at as string) ?? "";

      let local: unknown = null;
      if (table === "settings") local = await db.settings.get(entityId);
      else if (table === "goals") local = await db.goals.get(entityId);
      else if (table === "transactions") local = await db.transactions.get(entityId);
      else if (table === "annualChecklists") local = await db.annualChecklists.get(entityId);
      else if (table === "monthlySnapshots") local = await db.monthlySnapshots.get(entityId);

      const pending = await db.outbox
        .filter((o) => o.table === table && o.entityId === entityId)
        .count();

      if (local && pending > 0) {
        const conflict: ConflictRecord = {
          id: uid("cf"),
          table,
          entityId,
          local,
          remote: payload,
          detectedAt: nowIso(),
        };
        await db.conflicts.put(conflict);
        conflicts += 1;
        continue;
      }

      if (local) {
        const lv = localVersion(local);
        const lu = localUpdated(local);
        if (lv > remoteVer || (lu && remoteUpdated && lu > remoteUpdated && pending > 0)) {
          const conflict: ConflictRecord = {
            id: uid("cf"),
            table,
            entityId,
            local,
            remote: payload,
            detectedAt: nowIso(),
          };
          await db.conflicts.put(conflict);
          conflicts += 1;
          continue;
        }
      }

      const withMeta = { ...payload, id: entityId, version: remoteVer, updatedAt: remoteUpdated };
      if (table === "settings") await db.settings.put(withMeta as never);
      else if (table === "goals") await db.goals.put(withMeta as never);
      else if (table === "transactions") await db.transactions.put(withMeta as never);
      else if (table === "annualChecklists") await db.annualChecklists.put(withMeta as never);
      else if (table === "monthlySnapshots") await db.monthlySnapshots.put(withMeta as never);
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
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (!online || !supabase) {
    const pending = await outboxCount();
    const c = (await listConflicts()).length;
    return {
      status: computeSyncStatus({
        online: false,
        syncing: false,
        conflictCount: c,
        pendingOutbox: pending,
      }),
      pushed: 0,
      pulled: 0,
      conflicts: c,
    };
  }
  const push = await pushOutbox(userId);
  const pull = await pullDelta(userId);
  const pending = await outboxCount();
  const c = (await listConflicts()).length;
  return {
    status: computeSyncStatus({
      online: true,
      syncing: false,
      conflictCount: c,
      pendingOutbox: pending,
    }),
    pushed: push.pushed,
    pulled: pull.pulled,
    conflicts: c + pull.conflicts,
  };
}

export async function resolveConflict(
  conflictId: string,
  choice: "local" | "remote",
  userId: string,
): Promise<void> {
  const c = await db.conflicts.get(conflictId);
  if (!c) return;
  if (choice === "local") {
    await enqueueOutbox(c.table, c.entityId, "upsert", c.local, localVersion(c.local) + 1);
  } else {
    // Xóa outbox đang chờ của cùng thực thể — tránh lần đẩy sau ghi đè bản remote
    const pending = await db.outbox.where("entityId").equals(c.entityId).toArray();
    for (const p of pending) {
      if (p.table === c.table) await db.outbox.delete(p.id);
    }
    const payload = c.remote as Record<string, unknown>;
    const withMeta = { ...payload, id: c.entityId };
    if (c.table === "settings") await db.settings.put(withMeta as never);
    else if (c.table === "goals") await db.goals.put(withMeta as never);
    else if (c.table === "transactions") await db.transactions.put(withMeta as never);
    else if (c.table === "annualChecklists") await db.annualChecklists.put(withMeta as never);
    else if (c.table === "monthlySnapshots") await db.monthlySnapshots.put(withMeta as never);
  }
  await db.conflicts.put({ ...c, resolved: choice });
  if (typeof navigator !== "undefined" && navigator.onLine) {
    await pushOutbox(userId);
  }
}

/** Mục outbox đã chết (thử ≥ 8 lần). */
export async function listDeadOutbox(): Promise<OutboxItem[]> {
  const all = await db.outbox.toArray();
  return all.filter((i) => i.dead === true);
}

/** Đặt lại dead/attempts để thử đồng bộ lại. */
export async function reviveDeadOutbox(): Promise<number> {
  const dead = await listDeadOutbox();
  for (const item of dead) {
    await db.outbox.put({ ...item, dead: false, attempts: 0, lastError: undefined });
  }
  return dead.length;
}
