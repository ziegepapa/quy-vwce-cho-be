import { useState } from "react";
import { ingestQuotesFeed } from "../lib/db";
import type { QuoteFeedIngestResult } from "../lib/db";

function resultMessage(result: QuoteFeedIngestResult): string {
  if (result.status === "offline") {
    return "Đang offline — giá đã lưu trên máy vẫn được giữ nguyên.";
  }
  if (result.status === "error") {
    return `Chưa cập nhật được. Giá đang dùng không bị thay đổi${result.errors[0] ? `: ${result.errors[0]}` : "."}`;
  }
  const parts = [result.updated > 0 ? `${result.updated} mã đã cập nhật` : "Giá đã là bản mới nhất"];
  if (result.unchanged > 0) parts.push(`${result.unchanged} mã không đổi`);
  if (result.skipped.length > 0) parts.push(`${result.skipped.length} dòng không hợp lệ đã bỏ qua`);
  if (result.errors.length > 0) parts.push(`${result.errors.length} mã gặp lỗi`);
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
        `Chưa cập nhật được. Giá đang dùng không bị thay đổi: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="settings-card quote-feed-card">
      <div className="settings-card-head">
        <div>
          <p className="settings-card-eyebrow">Tự động</p>
          <h3>Giá thị trường</h3>
          <p>Lấy giá mới theo ISIN. Khi mạng lỗi, ứng dụng tiếp tục dùng dữ liệu local.</p>
        </div>
        <span className="settings-icon-bubble" aria-hidden>↻</span>
      </div>
      <button
        type="button"
        className="settings-primary-action"
        disabled={refreshing}
        onClick={() => void refresh()}
      >
        {refreshing ? "Đang cập nhật…" : "Cập nhật giá bây giờ"}
      </button>
      {message ? (
        <p className="settings-inline-status" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
