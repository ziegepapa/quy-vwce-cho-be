import type { BackupPayload } from "./types";
import { validateBackupPayload } from "./backupSchema";
import { importBackup as importBackupUnchecked } from "./db.m09";
import { PendingSyncImportBlockedError } from "./backupImportGate";
import { summarizePendingSync } from "./sync/outbox";

export type ImportBackupOptions = {
  /**
   * Người dùng đã đọc cảnh báo và vẫn muốn nhập. CHỈ được đặt true từ một hành
   * động tường minh của người dùng, không bao giờ mặc định.
   */
  acceptPendingSyncRisk?: boolean;
};

/**
 * Public fail-closed import entry point.
 * Rejects malformed files before db.m09 starts its clear-and-restore transaction.
 *
 * DELETE-TOMBSTONE-BACKUP-001 — db.m09 xoá sạch cả `outbox`, `conflicts` và
 * `syncMeta` trong cùng giao dịch clear-and-restore. Một việc "delete" chưa đẩy
 * là đường DUY NHẤT để máy chủ biết dòng đó đã bị xoá; nếu nó mất theo outbox
 * thì lần đồng bộ sau là hydrate lần đầu (vì `syncMeta` cũng mất) và sẽ kéo dòng
 * VẪN CÒN SỐNG trên máy chủ về — dòng đã xoá "sống lại", im lặng, không sinh
 * xung đột. Luồng khôi phục của MigrateWizard không cứu được vì nó chỉ chèn
 * thêm, không diễn tả được "đã xoá".
 *
 * Vì vậy chặn TRƯỚC khi có bất kỳ thay đổi nào, và chỉ đi tiếp khi người dùng
 * chấp nhận rủi ro một cách tường minh.
 *
 * PR3 — phạm vi hẹp cũ (chỉ việc "delete" và việc đã chết) là SAI, không phải
 * "cố ý":
 *
 * 1. Một `upsert` bình thường chưa đẩy cũng mất VĨNH VIỄN khi outbox bị xoá
 *    sạch. Nó không giống "khôi phục bản cũ": thay đổi đó có thể mới hơn cả file
 *    sao lưu, và không có đường nào lấy lại.
 * 2. Một `recover` đang chờ là dữ liệu người dùng chưa từng lên máy chủ.
 * 3. Một xung đột CHƯA xử lý cũng bị xoá cùng `conflicts` — người dùng mất luôn
 *    quyền chọn bên nào, im lặng.
 *
 * Vì vậy gate bây giờ fail-closed: chặn khi CÒN BẤT KỲ item nào trong outbox,
 * HOẶC còn bất kỳ xung đột chưa xử lý. Owner vẫn có đường đi tiếp tường minh
 * bằng `acceptPendingSyncRisk`.
 */
export async function importBackup(
  payload: BackupPayload,
  options?: ImportBackupOptions,
): Promise<void> {
  const validation = validateBackupPayload(payload);
  if (!validation.ok) throw new Error(validation.error);
  if (options?.acceptPendingSyncRisk !== true) {
    const pendingSync = await summarizePendingSync();
    if (pendingSync.total > 0 || (pendingSync.conflicts ?? 0) > 0) {
      throw new PendingSyncImportBlockedError(pendingSync);
    }
  }
  await importBackupUnchecked(validation.payload);
}
