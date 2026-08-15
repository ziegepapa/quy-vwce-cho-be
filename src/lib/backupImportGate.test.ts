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
      "Nhập sao lưu sẽ xoá hàng đợi đồng bộ: thay đổi chưa đẩy sẽ mất, và dòng đã xoá có thể xuất hiện lại.",
    );
    expect(PENDING_SYNC_PUSH_FIRST_LABEL).toBe("Đẩy đồng bộ trước");
    expect(PENDING_SYNC_ACCEPT_LABEL).toBe("Vẫn nhập (chấp nhận rủi ro)");
  });

  it("nói rõ cả hai hậu quả: mất thay đổi chưa đẩy VÀ dòng đã xoá quay lại", () => {
    expect(PENDING_SYNC_IMPORT_RISK).toContain("thay đổi chưa đẩy sẽ mất");
    expect(PENDING_SYNC_IMPORT_RISK).toContain("đã xoá có thể xuất hiện lại");
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

  it("một `upsert` bình thường cũng được đếm vào tổng (PR3)", () => {
    expect(
      pendingSyncCountLine({ total: 1, deletes: 0, dead: 0, upserts: 1, recovers: 0, conflicts: 0 }),
    ).toBe("Còn 1 việc đồng bộ chưa xong.");
  });

  it("nói thêm về xung đột chưa xử lý (PR3)", () => {
    expect(
      pendingSyncCountLine({ total: 1, deletes: 0, dead: 0, upserts: 1, recovers: 0, conflicts: 2 }),
    ).toBe(
      "Còn 1 việc đồng bộ chưa xong. Có 2 xung đột chưa xử lý. Hãy xử lý xung đột trước khi nhập.",
    );
  });

  it("khi outbox rỗng mà còn xung đột thì không nói 'Còn 0 việc' (PR3)", () => {
    expect(
      pendingSyncCountLine({ total: 0, deletes: 0, dead: 0, upserts: 0, recovers: 0, conflicts: 1 }),
    ).toBe("Có 1 xung đột chưa xử lý. Hãy xử lý xung đột trước khi nhập.");
  });
});

describe("nhận diện lỗi bị chặn", () => {
  it("mang theo số đếm trong thông báo lỗi", () => {
    const error = new PendingSyncImportBlockedError({ total: 1, deletes: 1, dead: 0 });
    expect(error.name).toBe("PendingSyncImportBlockedError");
    expect(error.message).toContain("Còn thay đổi chưa đồng bộ xong");
    expect(error.message).toContain("trong đó 1 việc xoá");
    expect(error.message).toContain("đã xoá có thể xuất hiện lại");
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

  it("vẫn nhận ra khi summary mang đủ sáu trường (PR3)", () => {
    const summary = { total: 3, deletes: 1, dead: 0, upserts: 2, recovers: 0, conflicts: 1 };
    expect(pendingSyncImportBlock(new PendingSyncImportBlockedError(summary))).toEqual(summary);
    expect(
      pendingSyncImportBlock({
        name: "PendingSyncImportBlockedError",
        pendingSync: summary,
      }),
    ).toEqual(summary);
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
