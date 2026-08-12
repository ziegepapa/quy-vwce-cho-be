import { db } from "../db.m01a";
import { nowIso, uid } from "../defaults";
import type {
  EntityTable,
  OrdinaryOutboxItem,
  RecoveryOutboxItem,
} from "./types";

export type EnqueueOutboxOptions = {
  expectedRemoteVersion?: number;
  recoverySessionId?: string;
};

export type EnqueueRecoveryInput = {
  recoverySessionId: string;
  table: EntityTable;
  entityId: string;
  payload: unknown;
  sourceLocalVersion: number | null;
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
  const item: OrdinaryOutboxItem = {
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
    ...(options?.recoverySessionId
      ? { recoverySessionId: options.recoverySessionId }
      : {}),
  };
  await db.outbox.put(item);
}

export async function enqueueRecoveryItem(
  input: EnqueueRecoveryInput,
): Promise<RecoveryOutboxItem> {
  const pending = await db.outbox.where("entityId").equals(input.entityId).toArray();
  const sameEntity = pending.filter((item) => item.table === input.table);
  const existing = sameEntity.find(
    (item): item is RecoveryOutboxItem =>
      item.op === "recover" && item.recoverySessionId === input.recoverySessionId,
  );
  if (existing) return existing;
  if (sameEntity.length > 0) throw new Error("Recovery queue blocked");

  const item: RecoveryOutboxItem = {
    id: uid("recovery"),
    table: input.table,
    entityId: input.entityId,
    op: "recover",
    payload: input.payload,
    recoverySessionId: input.recoverySessionId,
    sourceLocalVersion: input.sourceLocalVersion,
    createdAt: nowIso(),
    attempts: 0,
  };
  await db.outbox.put(item);
  return item;
}

export async function outboxCount(): Promise<number> {
  return db.outbox.count();
}
