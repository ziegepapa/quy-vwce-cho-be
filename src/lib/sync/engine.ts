import { supabase } from "../supabase";
import { db } from "../db.m01a";
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
    }
  }
  if (pushed > 0) await saveSyncMeta({ userId, lastPushedAt: nowIso() });
  return { pushed, errors, dead };
}