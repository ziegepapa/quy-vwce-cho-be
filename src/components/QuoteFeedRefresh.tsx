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
    ? { eyebrow: "Automatisch", title: "Marktpreise", description: "Es werden nur Kennungen aus dem Preis-Feed auf GitHub aktualisiert, derzeit VWCE. Andere Werte benötigen unten einen manuellen Kurs. Bei Netzwerkfehlern verwendet die App weiterhin lokale Daten.", refreshing: "Wird aktualisiert…", refresh: "Kurse jetzt aktualisieren" }
    : { eyebrow: "Tự động", title: "Giá thị trường", description: "Chỉ làm mới những mã có trong feed giá trên GitHub, hiện tại là VWCE. Mã khác cần nhập giá thủ công ở danh sách bên dưới. Khi mạng lỗi, ứng dụng tiếp tục dùng dữ liệu local.", refreshing: "Đang cập nhật…", refresh: "Cập nhật giá bây giờ" };
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
          <p className="settings-card-eyebrow">{text.eyebrow}</p>
          <h3>{text.title}</h3>
          <p>{text.description}</p>
        </div>
        <span className="settings-icon-bubble" aria-hidden>↻</span>
      </div>
      <button
        type="button"
        className="settings-primary-action"
        disabled={refreshing}
        onClick={() => void refresh()}
      >
        {refreshing ? text.refreshing : text.refresh}
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
