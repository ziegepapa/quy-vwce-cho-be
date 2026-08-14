import { describe, expect, it } from "vitest";
import {
  PENDING_SYNC_ACCEPT_LABEL,
  PENDING_SYNC_IMPORT_RISK,
  PENDING_SYNC_IMPORT_TITLE,
  PENDING_SYNC_PUSH_FIRST_LABEL,
  PendingSyncImportBlockedError,
  pendingSyncCountLine,
  pendingSyncImportBlock,
} from "./backupImportGate";

describe("copy tiếng Việt của gate nhập sao lưu", () => {
  it("khoá nguyên văn tiêu đề, câu rủi ro và nhãn hành động", () => {
    expect(PENDING_SYNC_IMPORT_TITLE).toBe("Còn thay đổi chưa đồng bộ xong");
    expect(PENDING_SYNC_IMPORT_RISK).toBe(
      "Nhập sao lưu bây giờ có thể làm giao dịch hoặc mục tiêu đã xoá xuất hiện lại.",
    );
    expect(PENDING_SYNC_PUSH_FIRST_LABEL).toBe("Đẩy đồng bộ trước");
    expect(PENDING_SYNC_ACCEPT_LABEL).toBe("Vẫn nhập (chấp nhận rủi ro)");
  });

  it("nêu rõ số việc xoá khi có", () => {
    expect(pendingSyncCountLine({ total: 3, deletes: 2, dead: 0 })).toBe(
      "Còn 3 việc đồng bộ chưa xong (trong đó 2 việc xoá).",
    );
  });

  it("không nhắc việc xoá khi không có việc xoá nào", () => {
    expect(pendingSyncCountLine({ total: 1, deletes: 0, dead: 0 })).toBe(
      "Còn 1 việc đồng bộ chưa xong.",
    );
  });

  it("nói thêm một câu khi có việc đã thử gửi nhiều lần không thành công", () => {
    expect(pendingSyncCountLine({ total: 2, deletes: 1, dead: 1 })).toBe(
      "Còn 2 việc đồng bộ chưa xong (trong đó 1 việc xoá). 1 việc đã thử gửi nhiều lần nhưng chưa thành công.",
    );
  });
});

describe("nhận diện lỗi bị chặn", () => {
  it("mang theo số đếm trong thông báo lỗi", () => {
    const error = new PendingSyncImportBlockedError({ total: 1, deletes: 1, dead: 0 });
    expect(error.name).toBe("PendingSyncImportBlockedError");
    expect(error.message).toContain("Còn thay đổi chưa đồng bộ xong");
    expect(error.message).toContain("trong đó 1 việc xoá");
    expect(error.message).toContain("đã xoá xuất hiện lại");
  });

  it("nhận ra lỗi thật", () => {
    const summary = { total: 4, deletes: 2, dead: 1 };
    expect(pendingSyncImportBlock(new PendingSyncImportBlockedError(summary))).toEqual(summary);
  });

  it("nhận ra lỗi theo hình dạng khi instanceof không còn đúng", () => {
    const plain = {
      name: "PendingSyncImportBlockedError",
      message: "đi qua ranh giới module",
      pendingSync: { total: 2, deletes: 1, dead: 0 },
    };
    expect(pendingSyncImportBlock(plain)).toEqual({ total: 2, deletes: 1, dead: 0 });
  });

  it("không nhận nhầm lỗi khác", () => {
    expect(pendingSyncImportBlock(new Error("JSON không hợp lệ"))).toBeNull();
    expect(pendingSyncImportBlock(null)).toBeNull();
    expect(pendingSyncImportBlock(undefined)).toBeNull();
    expect(pendingSyncImportBlock("PendingSyncImportBlockedError")).toBeNull();
    expect(
      pendingSyncImportBlock({ name: "PendingSyncImportBlockedError" }),
    ).toBeNull();
    expect(
      pendingSyncImportBlock({
        name: "PendingSyncImportBlockedError",
        pendingSync: { total: 1 },
      }),
    ).toBeNull();
  });
});
