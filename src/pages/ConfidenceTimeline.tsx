import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSettings, listQuotes, listTransactions } from "../lib/db";
import type { SyncStatus } from "../lib/sync/types";
import { useLocale } from "../lib/locale";
import { buildConfidenceTimeline, type ConfidenceEventKind, type ConfidenceTimelineLens, type ConfidenceTimelineSource } from "./confidenceTimeline";
import "../styles/confidence-timeline.css";

function timelineCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    eyebrow: "Datenvertrauen", title: "Status-Zeitleiste", intro: "Nur datierte Metadaten aus diesem Vault. Keine Buchung wird dadurch verändert.", loading: "Status-Zeitleiste wird geladen…", error: "Die Status-Zeitleiste konnte nicht geladen werden. Ihre lokalen Daten wurden nicht verändert.", retry: "Erneut versuchen", noEvents: "Noch keine datierten Statusereignisse vorhanden.", noVisibleEvents: "Für diese Auswahl sind keine datierten Statusereignisse vorhanden.", quote: "Preis-Snapshot aktualisiert", transactionCreated: "Buchung erfasst", transactionUpdated: "Buchung geändert", imported: "Import erfasst", quoteSource: "Preis", ledgerSource: "Ledger", importSource: "Import", sync: "Aktueller Datenstatus", synced: "Synchronisiert", syncing: "Synchronisierung ausstehend", offline: "Auf diesem Gerät gespeichert", conflict: "Datenkonflikt prüfen", pending: (count: number) => `${count} Änderung${count === 1 ? "" : "en"} ausstehend`, privacy: "Beträge, Notizen und Kontaktinhalte werden in dieser Zeitleiste nicht angezeigt.", timeLens: "Zeitraum", sources: "Quellen", all: "Alles", last30: "30 Tage", last90: "90 Tage", thisYear: "Dieses Jahr", showMore: (shown: number, total: number) => `Weitere anzeigen (${shown}/${total})`, back: "Zur Übersicht",
  } : {
    eyebrow: "Độ tin cậy dữ liệu", title: "Dòng thời gian trạng thái", intro: "Chỉ dùng metadata có ngày giờ từ Vault này. Trang không thay đổi giao dịch nào.", loading: "Đang tải dòng thời gian trạng thái…", error: "Không tải được dòng thời gian trạng thái. Dữ liệu trên thiết bị chưa bị thay đổi.", retry: "Thử lại", noEvents: "Chưa có sự kiện trạng thái nào có ngày giờ hợp lệ.", noVisibleEvents: "Không có sự kiện trạng thái phù hợp với bộ lọc hiện tại.", quote: "Đã cập nhật snapshot giá", transactionCreated: "Đã ghi giao dịch", transactionUpdated: "Đã chỉnh giao dịch", imported: "Đã ghi nhận import", quoteSource: "Giá", ledgerSource: "Ledger", importSource: "Import", sync: "Trạng thái dữ liệu hiện tại", synced: "Đã đồng bộ", syncing: "Còn thay đổi chờ đồng bộ", offline: "Được giữ trên thiết bị này", conflict: "Cần xử lý xung đột dữ liệu", pending: (count: number) => `Còn ${count} thay đổi chờ`, privacy: "Dòng thời gian không hiển thị số tiền, ghi chú hoặc nội dung liên hệ.", timeLens: "Khoảng thời gian", sources: "Nguồn", all: "Tất cả", last30: "30 ngày", last90: "90 ngày", thisYear: "Năm nay", showMore: (shown: number, total: number) => `Xem thêm (${shown}/${total})`, back: "Về Tổng quan",
  };
}

function formatTime(value: string, locale: "vi" | "de") {
  const date = new Date(value);
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function ConfidenceTimeline({ syncStatus, pending }: { syncStatus: SyncStatus; pending: number }) {
  const { locale } = useLocale();
  const text = timelineCopy(locale);
  const [data, setData] = useState<{ settings: Awaited<ReturnType<typeof getSettings>>; quotes: Awaited<ReturnType<typeof listQuotes>>; transactions: Awaited<ReturnType<typeof listTransactions>> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [lens, setLens] = useState<ConfidenceTimelineLens>("all");
  const [sources, setSources] = useState<ConfidenceTimelineSource[]>(["quote", "ledger", "import"]);
  const [limit, setLimit] = useState(30);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    void Promise.all([getSettings(), listQuotes(), listTransactions()]).then(([settings, quotes, transactions]) => {
      if (alive) setData({ settings, quotes, transactions });
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [attempt]);

  const timeline = useMemo(() => data ? buildConfidenceTimeline({
    quotes: data.quotes,
    transactions: data.transactions,
    depotStatements: data.settings.depotStatements ?? [],
    syncStatus,
    pending,
    lens,
    sources,
    limit,
  }) : null, [data, lens, limit, pending, sources, syncStatus]);

  const selectLens = (next: ConfidenceTimelineLens) => { setLens(next); setLimit(30); };
  const toggleSource = (source: ConfidenceTimelineSource) => {
    setSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source]);
    setLimit(30);
  };

  if (!timeline && !failed) return <section className="ct-shell" role="status" aria-live="polite"><p>{text.loading}</p></section>;
  if (!timeline || failed) return <section className="ct-shell" role="alert"><h1>{text.title}</h1><p>{text.error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>{text.retry}</button></section>;

  const syncLabel = timeline.sync.status === "synced" ? text.synced : timeline.sync.status === "syncing" ? text.syncing : timeline.sync.status === "conflict" ? text.conflict : text.offline;
  const eventLabel = (kind: ConfidenceEventKind) => kind === "quote" ? text.quote : kind === "transaction_created" ? text.transactionCreated : kind === "transaction_updated" ? text.transactionUpdated : text.imported;
  const sourceLabel = (source: ConfidenceTimelineSource) => source === "quote" ? text.quoteSource : source === "ledger" ? text.ledgerSource : text.importSource;
  const lenses: Array<{ key: ConfidenceTimelineLens; label: string }> = [{ key: "all", label: text.all }, { key: "30d", label: text.last30 }, { key: "90d", label: text.last90 }, { key: "thisYear", label: text.thisYear }];
  const sourceOptions: Array<{ key: ConfidenceTimelineSource; label: string }> = [{ key: "quote", label: text.quoteSource }, { key: "ledger", label: text.ledgerSource }, { key: "import", label: text.importSource }];
  const emptyMessage = timeline.totalEvents === 0 && data && (data.quotes.length + data.transactions.length + (data.settings.depotStatements?.length ?? 0) > 0) ? text.noVisibleEvents : text.noEvents;

  return <main className="ct-shell" aria-label={text.title}>
    <header className="ct-head"><p>{text.eyebrow}</p><h1>{text.title}</h1><span>{text.intro}</span></header>
    <section className={`ct-sync is-${timeline.sync.status}`}><div><span>{text.sync}</span><strong>{syncLabel}</strong></div><p>{timeline.sync.pending > 0 ? text.pending(timeline.sync.pending) : text.privacy}</p></section>
    <section className="ct-card ct-lenses"><div className="ct-lens-group"><span>{text.timeLens}</span><div role="group" aria-label={text.timeLens}>{lenses.map((option) => <button type="button" key={option.key} aria-pressed={lens === option.key} onClick={() => selectLens(option.key)}>{option.label}</button>)}</div></div><div className="ct-lens-group"><span>{text.sources}</span><div role="group" aria-label={text.sources}>{sourceOptions.map((option) => <button type="button" key={option.key} aria-pressed={sources.includes(option.key)} onClick={() => toggleSource(option.key)}>{option.label}</button>)}</div></div></section>
    <section className="ct-card"><p className="ct-privacy" role="note">{text.privacy}</p>{timeline.events.length === 0 ? <p className="ct-empty">{emptyMessage}</p> : <ol className="ct-events">{timeline.events.map((event) => <li key={event.id}><span className={`ct-dot is-${event.source}`} aria-hidden /><div><strong>{eventLabel(event.kind)}</strong><small>{sourceLabel(event.source)} · {formatTime(event.at, locale)}</small></div></li>)}</ol>}{timeline.events.length < timeline.totalEvents ? <button className="ct-more" type="button" onClick={() => setLimit((value) => value + 30)}>{text.showMore(timeline.events.length, timeline.totalEvents)}</button> : null}</section>
    <Link className="ct-back" to="/">‹ {text.back}</Link>
  </main>;
}
