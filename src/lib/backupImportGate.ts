import type { PendingSyncSummary } from "./sync/types";

/**
 * DELETE-TOMBSTONE-BACKUP-001 — copy và nhận diện lỗi cho gate nhập sao lưu.
 *
 * Module này CỐ Ý thuần (không import Dexie) để màn hình Cài đặt đọc được copy
 * và nhận diện được lỗi mà không phải nạp tầng dữ liệu.
 */

export const PENDING_SYNC_IMPORT_TITLE = "Còn thay đổi chưa đồng bộ xong";

export const PENDING_SYNC_IMPORT_RISK =
  "Nhập sao lưu bây giờ có thể làm giao dịch hoặc mục tiêu đã xoá xuất hiện lại.";

export const PENDING_SYNC_PUSH_FIRST_LABEL = "Đẩy đồng bộ trước";

export const PENDING_SYNC_ACCEPT_LABEL = "Vẫn nhập (chấp nhận rủi ro)";

export function pendingSyncCountLine(summary: PendingSyncSummary): string {
  const base =
    summary.deletes > 0
      ? `Còn ${summary.total} việc đồng bộ chưa xong (trong đó ${summary.deletes} việc xoá).`
      : `Còn ${summary.total} việc đồng bộ chưa xong.`;
  if (summary.dead > 0) {
    return `${base} ${summary.dead} việc đã thử gửi nhiều lần nhưng chưa thành công.`;
  }
  return base;
}

export class PendingSyncImportBlockedError extends Error {
  readonly pendingSync: PendingSyncSummary;

  constructor(pendingSync: PendingSyncSummary) {
    super(
      `${PENDING_SYNC_IMPORT_TITLE}. ${pendingSyncCountLine(pendingSync)} ${PENDING_SYNC_IMPORT_RISK}`,
    );
    this.name = "PendingSyncImportBlockedError";
    this.pendingSync = pendingSync;
    Object.setPrototypeOf(this, PendingSyncImportBlockedError.prototype);
  }
}

function isPendingSyncSummary(value: unknown): value is PendingSyncSummary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.total === "number" &&
    typeof candidate.deletes === "number" &&
    typeof candidate.dead === "number"
  );
}

/**
 * Nhận diện theo HÌNH DẠNG, không chỉ `instanceof`: lỗi có thể đi qua ranh giới
 * module hoặc bị bọc lại khi Dexie/promise chuyển tiếp, và khi đó `instanceof`
 * âm thầm sai. Trả về số đếm để giao diện hiển thị đúng cảnh báo.
 */
export function pendingSyncImportBlock(error: unknown): PendingSyncSummary | null {
  if (error instanceof PendingSyncImportBlockedError) return error.pendingSync;
  if (!error || typeof error !== "object") return null;
  const candidate = error as { name?: unknown; pendingSync?: unknown };
  if (candidate.name !== "PendingSyncImportBlockedError") return null;
  return isPendingSyncSummary(candidate.pendingSync) ? candidate.pendingSync : null;
}
