import { db } from "../db.m01a";
import { enqueueOutbox } from "./outbox";
import type { EntityTable } from "./types";

/**
 * PR3 — vá lại khoảng hở commit/enqueue của `importV4`.
 *
 * Trước PR3, `importV4` khôi phục tombstone TRONG giao dịch nhưng xếp việc
 * "delete" vào outbox SAU khi giao dịch đã commit. Nếu tiến trình dừng giữa hai
 * bước đó (đóng tab, iOS thu hồi trang, hết pin) thì máy để lại đúng trạng thái
 * xấu nhất: tombstone nằm cục bộ mà KHÔNG có việc "delete" nào. Outbox là đường
 * DUY NHẤT để máy chủ biết dòng đó đã bị xoá, nên lần đồng bộ sau sẽ kéo dòng
 * VẪN CÒN SỐNG trên máy chủ về và dòng đã xoá "sống lại".
 *
 * PR3 đã chuyển enqueue vào trong giao dịch, nên khoảng hở đó không sinh ra nữa.
 * Hàm này để CHỮA những máy đã bị hỏng từ trước.
 *
 * Quy tắc, cố ý bảo thủ:
 * - Tombstone đã có `deleteSyncedAt` => máy chủ ĐÃ nhận được lệnh xoá, không
 *   còn gì để báo nữa. Bỏ qua hẳn, không tính vào `preserved`.
 * - Tombstone KHÔNG có item outbox nào => xếp đúng MỘT việc "delete".
 * - Tombstone đã có item outbox thuộc BẤT KỲ loại nào => giữ nguyên, không sửa,
 *   không thêm. Đây không phải sự cẩn thận quá mức: `enqueueOutbox` luôn gọi
 *   `removeOutboxForEntity` trước, nên gọi nó ở đây sẽ XOÁ một `upsert`,
 *   `recover` hay một guarded write đang chờ của cùng thực thể.
 * - Không có `userId` => không làm gì. Máy mới cài thì máy chủ chưa từng có
 *   những dòng đó, không có gì để xoá.
 *
 * PR4 — vì sao điều kiện `deleteSyncedAt` là BẮT BUỘC chứ không phải tối ưu.
 *
 * Bản PR3 chỉ hỏi "tombstone này có item outbox không". Sau một lần đẩy THÀNH
 * CÔNG, `attemptOutboxItem` xoá item khỏi outbox còn tombstone thì ở lại
 * IndexedDB vĩnh viễn. Trạng thái khoẻ mạnh đó trông giống hệt trạng thái hỏng,
 * nên hàm này xếp lại một việc "delete" ở MỌI lần đồng bộ, mãi mãi: mỗi lần là
 * một lệnh UPDATE thừa lên Supabase, `version` phình vô hạn, `deleted_at` bị ghi
 * đè bằng thời điểm hiện tại (mất luôn thời điểm xoá thật), và `updated_at` nhảy
 * nên lần `pullDelta` ngay sau đó lại kéo chính dòng đó về.
 *
 * Đo được trên production ngày 16/08/2026: một hàng goal đi từ `version` 11 lên
 * 22 trong 23 phút mà không ai đụng vào dữ liệu.
 *
 * Chạy lại nhiều lần cho cùng một kết quả: lần thứ hai thấy item vừa xếp và bỏ
 * qua; sau khi đẩy xong thì thấy `deleteSyncedAt` và cũng bỏ qua.
 */

export type TombstoneReconcileResult = {
  /** Số việc "delete" vừa được xếp thêm. */
  enqueued: number;
  /** Số tombstone đã có item outbox nên được giữ nguyên. */
  preserved: number;
};

type TombstoneRow = {
  id: string;
  deletedAt?: string | null;
  /** PR4 — máy chủ đã xác nhận lệnh xoá. Chỉ cục bộ, không bao giờ gửi đi. */
  deleteSyncedAt?: string | null;
  version?: number;
};

async function tombstoneRows(table: "goals" | "transactions"): Promise<TombstoneRow[]> {
  const rows =
    table === "goals"
      ? ((await db.goals.toArray()) as unknown as TombstoneRow[])
      : ((await db.transactions.toArray()) as unknown as TombstoneRow[]);
  // PR4: tombstone da duoc may chu xac nhan khong con la viec chua lam. Khong
  // loc o day thi moi lan dong bo lai sinh them mot lenh ghi thua.
  return rows.filter((row) => Boolean(row.deletedAt) && !row.deleteSyncedAt);
}

async function hasAnyOutboxItem(table: EntityTable, entityId: string): Promise<boolean> {
  const pending = await db.outbox.where("entityId").equals(entityId).toArray();
  return pending.some((item) => item.table === table);
}

export async function reconcileTombstoneOutbox(
  userId: string | null | undefined,
): Promise<TombstoneReconcileResult> {
  const result: TombstoneReconcileResult = { enqueued: 0, preserved: 0 };
  if (!userId) return result;

  for (const table of ["goals", "transactions"] as const) {
    for (const row of await tombstoneRows(table)) {
      if (await hasAnyOutboxItem(table, row.id)) {
        result.preserved += 1;
        continue;
      }
      // Dung version cua chinh tombstone. Nhanh delete cua pushOne khong doc
      // `item.version`, nhung giu dung so de outbox item khong noi doi.
      await enqueueOutbox(table, row.id, "delete", null, row.version ?? 1);
      result.enqueued += 1;
    }
  }
  return result;
}
