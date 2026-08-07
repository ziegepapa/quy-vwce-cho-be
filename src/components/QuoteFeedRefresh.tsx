import { useState } from "react";
import { ingestQuotesFeed } from "../lib/db";
import { describeRefreshResult } from "../lib/quoteFreshness";
import type { FeedFreshnessLevel } from "../lib/quoteFreshness";

type RefreshStatus = {
  message: string;
  level: FeedFreshnessLevel;
};

export default function QuoteFeedRefresh({
  onUpdated,
}: {
  onUpdated?: () => void | Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<RefreshStatus | null>(null);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setStatus(null);
    try {
      const result = await ingestQuotesFeed();
      const described = describeRefreshResult(result);
      setStatus({ message: described.message, level: described.level });
      if (result.status === "ok" || result.status === "partial") {
        await onUpdated?.();
      }
    } catch (error) {
      setStatus({
        level: "unknown",
        message: `Chưa cập nhật được. Giá đang dùng không bị thay đổi: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
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
      {status ? (
        <p
          className="settings-inline-status"
          data-freshness={status.level}
          role="status"
          aria-live="polite"
        >
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
