import { db } from "../db";
import { nowIso, uid } from "../defaults";
import type { EntityTable, OutboxItem } from "./types";

export async function enqueueOutbox(
  table: EntityTable,
  entityId: string,
  op: "upsert" | "delete",
  payload: unknown,
  version = 1,
): Promise<void> {
  const pending = await db.outbox.where("entityId").equals(entityId).toArray();
  for (const p of pending) {
    if (p.table === table) await db.outbox.delete(p.id);
  }
  const item: OutboxItem = {
    id: uid("ob"),
    table,
    entityId,
    op,
    payload,
    version,
    createdAt: nowIso(),
    attempts: 0,
  };
  await db.outbox.put(item);
}

export async function outboxCount(): Promise<number> {
  return db.outbox.count();
}
