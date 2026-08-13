import { useState } from "react";
import { ingestQuotesFeed, listQuoteSelectionStates } from "../lib/db";
import { describeRefreshResult } from "../lib/quoteFreshness";
import type {
  FeedFreshnessLevel,
  RetainedAutoQuoteInput,
} from "../lib/quoteFreshness";
import type { QuoteFeedIngestResult } from "../lib/quoteFeed";

type RefreshStatus = {
  message: string;
  level: FeedFreshnessLevel;
};

async function readRetainedAutoQuotes(): Promise<RetainedAutoQuoteInput[]> {
  try {
    const states = await listQuoteSelectionStates();
    return states.flatMap((state) => {
      const effective = state.effective;
      return effective?.source === "auto"
        ? [{ asOf: effective.asOf, fetchedAt: effective.fetchedAt }]
        : [];
    });
  } catch {
    // Freshness diagnostics must never block the refresh itself.
    return [];
  }
}

function failedResult(error: unknown): QuoteFeedIngestResult {
  return {
    status: "error",
    url: "/data/quotes.json",
    totalRows: 0,
    acceptedRows: 0,
    updated: 0,
    unchanged: 0,
    skipped: [],
    errors: [error instanceof Error ? error.message : String(error)],
  };
}

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
    const retainedAutoQuotes = await readRetainedAutoQuotes();
    try {
      const result = await ingestQuotesFeed();
      const described = describeRefreshResult(result, { retainedAutoQuotes });
      setStatus({ message: described.message, level: described.level });
      if (result.status === "ok" || result.status === "partial") {
        await onUpdated?.();
      }
    } catch (error) {
      const described = describeRefreshResult(failedResult(error), { retainedAutoQuotes });
      setStatus({ message: described.message, level: described.level });
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
          <p>Chỉ làm mới những mã có trong feed giá trên GitHub, hiện tại là VWCE. Mã khác cần nhập giá thủ công ở danh sách bên dưới. Khi mạng lỗi, ứng dụng tiếp tục dùng dữ liệu local.</p>
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
