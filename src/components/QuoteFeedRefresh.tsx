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
    ? { eyebrow: "Veröffentlichter Feed", title: "Marktpreise", summary: "Synchronisiert den zuletzt veröffentlichten Kurs-Feed; keine Live-Abfrage beim Anbieter.", info: "Informationen zur Kursquelle", description: "Diese Aktion lädt nur den veröffentlichten Feed in die lokale App. Sie fragt Yahoo/Onvista nicht direkt ab und liefert keinen Intraday-Kurs. Angezeigt werden der letzte abgeschlossene Kurs-Tag und der Zeitstempel des Preis-Bots. Bei Netzwerkfehlern bleiben lokale Daten erhalten.", refreshing: "Wird synchronisiert…", refresh: "Kurs-Feed synchronisieren" }
    : { eyebrow: "Feed đã công bố", title: "Giá thị trường", summary: "Đồng bộ feed giá đã xuất bản; không truy vấn trực tiếp nguồn giá trong phiên.", info: "Thông tin nguồn giá", description: "Nút này chỉ tải feed đã công bố vào ứng dụng local. Nó không gọi trực tiếp Yahoo/Onvista và không cung cấp giá intraday. Kết quả cho biết ngày phiên đóng cửa gần nhất và thời điểm bot lấy dữ liệu. Khi mạng lỗi, giá local vẫn được giữ nguyên.", refreshing: "Đang đồng bộ…", refresh: "Đồng bộ feed giá" };
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
