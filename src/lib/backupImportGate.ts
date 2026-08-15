import type { PendingSyncSummary } from "./sync/types";

/**
 * DELETE-TOMBSTONE-BACKUP-001 — copy và nhận diện lỗi cho gate nhập sao lưu.
 *
 * Module này CỐ Ý thuần (không import Dexie) để màn hình Cài đặt đọc được copy
 * và nhận diện được lỗi mà không phải nạp tầng dữ liệu.
 */

export const PENDING_SYNC_IMPORT_TITLE = "Còn thay đổi chưa đồng bộ xong";

/**
 * PR3 — câu rủi ro cũ chỉ nói tới dòng đã xoá sống lại, nên nó SAI khi việc còn
 * treo là một `upsert` bình thường. Nhập sao lưu xoá sạch cả hàng đợi đồng bộ,
 * nên phải nói rõ cả hai hậu quả.
 */
export const PENDING_SYNC_IMPORT_RISK =
  "Nhập sao lưu sẽ xoá hàng đợi đồng bộ: thay đổi chưa đẩy sẽ mất, và dòng đã xoá có thể xuất hiện lại.";

export const PENDING_SYNC_PUSH_FIRST_LABEL = "Đẩy đồng bộ trước";

export const PENDING_SYNC_ACCEPT_LABEL = "Vẫn nhập (chấp nhận rủi ro)";

export function pendingSyncCountLine(summary: PendingSyncSummary): string {
  const conflicts = summary.conflicts ?? 0;
  const base =
    summary.deletes > 0
      ? `Còn ${summary.total} việc đồng bộ chưa xong (trong đó ${summary.deletes} việc xoá).`
      : `Còn ${summary.total} việc đồng bộ chưa xong.`;
  const parts: string[] = [];
  // Khi chi con xung dot (outbox rong) thi cau "Con 0 viec..." chi gay hoang mang.
  if (summary.total > 0 || conflicts === 0) parts.push(base);
  if (summary.dead > 0) {
    parts.push(`${summary.dead} việc đã thử gửi nhiều lần nhưng chưa thành công.`);
  }
  if (conflicts > 0) {
    parts.push(`Có ${conflicts} xung đột chưa xử lý. Hãy xử lý xung đột trước khi nhập.`);
  }
  return parts.join(" ");
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

/**
 * CHỈ kiểm tra ba trường gốc. `upserts`/`recovers`/`conflicts` là tuỳ chọn, nên
 * một payload cũ (hoặc một lỗi đã đi qua ranh giới module trước khi PR3 ship)
 * vẫn phải được nhận ra — nếu bắt buộc đủ sáu trường thì giao diện sẽ âm thầm
 * coi lỗi bị chặn là một lỗi lạ và hiện "Không nhập được backup".
 */
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
