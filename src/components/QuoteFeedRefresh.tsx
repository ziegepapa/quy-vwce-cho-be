import { useState } from "react";
import { ingestQuotesFeed, listQuoteSelectionStates } from "../lib/db";
import { describeRefreshResult } from "../lib/quoteFreshness";
import type {
  FeedFreshnessLevel,
  RetainedAutoQuoteInput,
} from "../lib/quoteFreshness";
import type { QuoteFeedIngestResult } from "../lib/quoteFeed";
import { useLocale } from "../lib/locale";

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
  const { locale } = useLocale();
  const text = locale === "de"
    ? { eyebrow: "Automatisch", title: "Marktpreise", summary: "VWCE wird aus dem hinterlegten Kurs-Feed aktualisiert.", info: "Informationen zur Kursquelle", description: "Es werden nur Kennungen aus dem Kurs-Feed aktualisiert, derzeit VWCE. Andere Werte benötigen einen unten erfassten manuellen Kurs. Bei Netzwerkfehlern verwendet die App weiterhin lokale Daten.", refreshing: "Wird aktualisiert…", refresh: "Kurse jetzt aktualisieren" }
    : { eyebrow: "Tự động", title: "Giá thị trường", summary: "VWCE được cập nhật từ feed giá đã cấu hình.", info: "Thông tin nguồn giá", description: "Chỉ những mã có trong feed giá mới được cập nhật, hiện tại là VWCE. Mã khác cần có giá thủ công trong danh sách bên dưới. Khi mạng lỗi, ứng dụng tiếp tục dùng dữ liệu local.", refreshing: "Đang cập nhật…", refresh: "Cập nhật giá bây giờ" };
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
    <section className="p40-price-feed">
      <div className="p40-price-feed-head">
        <div>
          <span>{text.eyebrow}</span>
          <h3>{text.title}</h3>
          <p>{text.summary}</p>
        </div>
        <button type="button" className="p40-price-refresh" disabled={refreshing} onClick={() => void refresh()}>
          {refreshing ? text.refreshing : text.refresh}
        </button>
      </div>
      <details className="p40-price-feed-info">
        <summary>{text.info}</summary>
        <p>{text.description}</p>
      </details>
      {status ? (
        <p className="p40-price-feed-status" data-freshness={status.level} role="status" aria-live="polite">
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
