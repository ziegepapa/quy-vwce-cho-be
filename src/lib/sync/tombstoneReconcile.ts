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
 * - Tombstone KHÔNG có item outbox nào => xếp đúng MỘT việc "delete".
 * - Tombstone đã có item outbox thuộc BẤT KỲ loại nào => giữ nguyên, không sửa,
 *   không thêm. Đây không phải sự cẩn thận quá mức: `enqueueOutbox` luôn gọi
 *   `removeOutboxForEntity` trước, nên gọi nó ở đây sẽ XOÁ một `upsert`,
 *   `recover` hay một guarded write đang chờ của cùng thực thể.
 * - Không có `userId` => không làm gì. Máy mới cài thì máy chủ chưa từng có
 *   những dòng đó, không có gì để xoá.
 *
 * Chạy lại nhiều lần cho cùng một kết quả: lần thứ hai thấy item vừa xếp và bỏ
 * qua.
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
  version?: number;
};

async function tombstoneRows(table: "goals" | "transactions"): Promise<TombstoneRow[]> {
  const rows =
    table === "goals"
      ? ((await db.goals.toArray()) as unknown as TombstoneRow[])
      : ((await db.transactions.toArray()) as unknown as TombstoneRow[]);
  return rows.filter((row) => Boolean(row.deletedAt));
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
