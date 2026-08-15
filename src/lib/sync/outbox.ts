import { db } from "../db.m01a";
import { nowIso, uid } from "../defaults";
import type {
  EntityTable,
  OrdinaryOutboxItem,
  PendingSyncSummary,
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

/**
 * AN TOAN DU LIEU -- version-guard cho ban ghi singleton "settings".
 *
 * Tra ve `expectedRemoteVersion` de push "settings" chay theo duong conditional
 * update (`.eq("version", base)`) thay vi upsert vo dieu kien. Nho vay mot ban
 * settings CUC BO cu (vi du sau dang xuat/dang nhap tren may khac, hoac dua
 * tranh push-truoc-pull) KHONG the ghi de len ban moi hon tren server va xoa mat
 * Ho so khan cap (notfallmappe) -- thay vao do se sinh conflict de nguoi dung tu
 * quyet.
 *
 * - Neu dang co outbox item "settings" cho san: ke thua base cu, de chuoi chinh
 *   sua offline duoc gop lai van guard dung version goc (tranh conflict gia tren
 *   cung mot may).
 * - Neu chua co: dung `prevVer` khi > 0 (settings da tung pull/dong bo ve, phai
 *   guard). `prevVer === 0` nghia la ban ghi moi tinh chua tung len server ->
 *   tra ve `undefined` de push dau tien la insert/upsert khong dieu kien.
 */
export async function settingsGuardBaseVersion(
  prevVer: number,
): Promise<number | undefined> {
  const pending = await db.outbox.where("entityId").equals("settings").toArray();
  const existing = pending.find(
    (item): item is OrdinaryOutboxItem =>
      item.table === "settings" && item.op === "upsert",
  );
  if (existing) return existing.expectedRemoteVersion;
  return prevVer > 0 ? prevVer : undefined;
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

/**
 * DELETE-TOMBSTONE-BACKUP-001 — dem viec dong bo con treo truoc mot thao tac
 * xoa-roi-ghi-lai toan bo du lieu cuc bo (khoi phuc sao luu).
 *
 * `deletes` la con so quan trong: outbox la duong DUY NHAT de may chu biet mot
 * dong da bi xoa. Neu no bien mat cung outbox thi lan keo du lieu sau se mang
 * dong VAN CON SONG tren may chu tro lai.
 *
 * `dead` cung phai chan: `pushOutboxUnlocked` bo qua item da chet MAI MAI cho
 * toi khi co nguoi bam `reviveDeadOutbox`, nen mot viec xoa da chet co the nam
 * do rat lau ma khong ai biet.
 *
 * PR3 — dem THEM tung loai op va so xung dot chua xu ly, vi gate khong con hep
 * o viec xoa nua. `importBackup` xoa sach ca `outbox` va `conflicts`: mot
 * `upsert` chua day cung mat vinh vien, va mot xung dot chua xu ly cung bien mat
 * truoc khi nguoi dung kip chon ben nao.
 */
export async function summarizePendingSync(): Promise<PendingSyncSummary> {
  const items = await db.outbox.toArray();
  let deletes = 0;
  let dead = 0;
  let upserts = 0;
  let recovers = 0;
  for (const item of items) {
    if (item.op === "delete") deletes += 1;
    if (item.op === "upsert") upserts += 1;
    if (item.op === "recover") recovers += 1;
    if (item.dead === true) dead += 1;
  }
  // Cung mot cach doc nhu `listConflicts` trong engine: chi tinh xung dot CHUA
  // duoc giai quyet.
  const unresolved = await db.conflicts.filter((conflict) => !conflict.resolved).toArray();
  return { total: items.length, deletes, dead, upserts, recovers, conflicts: unresolved.length };
}
