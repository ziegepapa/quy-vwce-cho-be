import { db } from "../db.m01a";
import { nowIso, uid } from "../defaults";
import type { EntityTable, OutboxItem } from "./types";

export type EnqueueOutboxOptions = {
  expectedRemoteVersion?: number;
};

export async function removeOutboxForEntity(
  table: EntityTable,
  entityId: string,
): Promise<void> {
  const pending = await db.outbox.where("entityId").equals(entityId).toArray();
  for (const item of pending) {
    if (item.table === table) await db.outbox.delete(item.id);
  }
}

export async function enqueueOutbox(
  table: EntityTable,
  entityId: string,
  op: "upsert" | "delete",
  payload: unknown,
  version = 1,
  options?: EnqueueOutboxOptions,
): Promise<void> {
  await removeOutboxForEntity(table, entityId);
  const item: OutboxItem = {
    id: uid("ob"),
    table,
    entityId,
    op,
    payload,
    version,
    createdAt: nowIso(),
    attempts: 0,
    ...(options?.expectedRemoteVersion !== undefined
      ? { expectedRemoteVersion: options.expectedRemoteVersion }
      : {}),
  };
  await db.outbox.put(item);
}

export async function outboxCount(): Promise<number> {
  return db.outbox.count();
}
