import { useState } from "react";
import { ingestQuotesFeed } from "../lib/db";
import type { QuoteFeedIngestResult } from "../lib/db";

function resultMessage(result: QuoteFeedIngestResult): string {
  if (result.status === "offline") {
    return "Đang offline — giữ nguyên giá đã lưu trên máy.";
  }
  if (result.status === "error") {
    return `Không thể cập nhật feed. Giá local được giữ nguyên${result.errors[0] ? `: ${result.errors[0]}` : "."}`;
  }
  const parts = [
    result.updated > 0 ? `${result.updated} mã đã cập nhật` : "không có thay đổi kinh tế",
  ];
  if (result.unchanged > 0) parts.push(`${result.unchanged} mã không đổi`);
  if (result.skipped.length > 0) parts.push(`${result.skipped.length} dòng không hợp lệ đã bỏ qua`);
  if (result.errors.length > 0) parts.push(`${result.errors.length} mã cập nhật lỗi`);
  return parts.join(" · ");
}

export default function QuoteFeedRefresh({
  onUpdated,
}: {
  onUpdated?: () => void | Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setMessage(null);
    try {
      const result = await ingestQuotesFeed();
      setMessage(resultMessage(result));
      if (result.status === "ok" || result.status === "partial") {
        await onUpdated?.();
      }
    } catch (error) {
      setMessage(
        `Không thể cập nhật feed. Giá local được giữ nguyên: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="settings-v9">
      <p className="group-label">Giá tự động</p>
      <div className="group-box">
        <button
          type="button"
          className="group-action"
          style={{ minHeight: 44 }}
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {refreshing ? "Đang cập nhật…" : "Cập nhật giá tự động"}
        </button>
        <p className="group-hint">
          Tải feed theo ISIN. Lỗi mạng hoặc dữ liệu không hợp lệ không xóa giá đang có.
        </p>
        {message ? (
          <p className="group-hint" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}