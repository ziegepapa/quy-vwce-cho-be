import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSettings, listQuotes, listTransactions } from "../lib/db";
import type { SyncStatus } from "../lib/sync/types";
import { useLocale } from "../lib/locale";
import { buildConfidenceTimeline, type ConfidenceTimelineEvent } from "./confidenceTimeline";
import "../styles/confidence-timeline.css";

function timelineCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    eyebrow: "Datenvertrauen", title: "Status-Zeitleiste", intro: "Nur datierte Metadaten aus diesem Vault. Keine Buchung wird dadurch verändert.", loading: "Status-Zeitleiste wird geladen…", error: "Die Status-Zeitleiste konnte nicht geladen werden. Ihre lokalen Daten wurden nicht verändert.", retry: "Erneut versuchen", noEvents: "Noch keine datierten Statusereignisse vorhanden.", quote: "Preis-Snapshot aktualisiert", transactionCreated: "Buchung erfasst", transactionUpdated: "Buchung geändert", imported: "Import erfasst", quoteSource: "Preis", ledgerSource: "Ledger", importSource: "Import", sync: "Aktueller Datenstatus", synced: "Synchronisiert", syncing: "Synchronisierung ausstehend", offline: "Auf diesem Gerät gespeichert", conflict: "Datenkonflikt prüfen", pending: (count: number) => `${count} Änderung${count === 1 ? "" : "en"} ausstehend`, privacy: "Beträge, Notizen und Kontaktinhalte werden in dieser Zeitleiste nicht angezeigt.", back: "Zur Übersicht",
  } : {
    eyebrow: "Độ tin cậy dữ liệu", title: "Dòng thời gian trạng thái", intro: "Chỉ dùng metadata có ngày giờ từ Vault này. Trang không thay đổi giao dịch nào.", loading: "Đang tải dòng thời gian trạng thái…", error: "Không tải được dòng thời gian trạng thái. Dữ liệu trên thiết bị chưa bị thay đổi.", retry: "Thử lại", noEvents: "Chưa có sự kiện trạng thái nào có ngày giờ hợp lệ.", quote: "Đã cập nhật snapshot giá", transactionCreated: "Đã ghi giao dịch", transactionUpdated: "Đã chỉnh giao dịch", imported: "Đã ghi nhận import", quoteSource: "Giá", ledgerSource: "Ledger", importSource: "Import", sync: "Trạng thái dữ liệu hiện tại", synced: "Đã đồng bộ", syncing: "Còn thay đổi chờ đồng bộ", offline: "Được giữ trên thiết bị này", conflict: "Cần xử lý xung đột dữ liệu", pending: (count: number) => `Còn ${count} thay đổi chờ`, privacy: "Dòng thời gian không hiển thị số tiền, ghi chú hoặc nội dung liên hệ.", back: "Về Tổng quan",
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
  }) : null, [data, pending, syncStatus]);

  if (!timeline && !failed) return <section className="ct-shell" role="status" aria-live="polite"><p>{text.loading}</p></section>;
  if (!timeline || failed) return <section className="ct-shell" role="alert"><h1>{text.title}</h1><p>{text.error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>{text.retry}</button></section>;

  const syncLabel = timeline.sync.status === "synced" ? text.synced : timeline.sync.status === "syncing" ? text.syncing : timeline.sync.status === "conflict" ? text.conflict : text.offline;
  const eventLabel = (event: ConfidenceTimelineEvent) => event.kind === "quote" ? text.quote : event.kind === "transaction_created" ? text.transactionCreated : event.kind === "transaction_updated" ? text.transactionUpdated : text.imported;
  const sourceLabel = (event: ConfidenceTimelineEvent) => event.source === "quote" ? text.quoteSource : event.source === "ledger" ? text.ledgerSource : text.importSource;

  return <main className="ct-shell" aria-label={text.title}>
    <header className="ct-head"><p>{text.eyebrow}</p><h1>{text.title}</h1><span>{text.intro}</span></header>
    <section className={`ct-sync is-${timeline.sync.status}`}><div><span>{text.sync}</span><strong>{syncLabel}</strong></div><p>{timeline.sync.pending > 0 ? text.pending(timeline.sync.pending) : text.privacy}</p></section>
    <section className="ct-card"><p className="ct-privacy" role="note">{text.privacy}</p>{timeline.events.length === 0 ? <p className="ct-empty">{text.noEvents}</p> : <ol className="ct-events">{timeline.events.map((event) => <li key={event.id}><span className={`ct-dot is-${event.source}`} aria-hidden /><div><strong>{eventLabel(event)}</strong><small>{sourceLabel(event)} · {formatTime(event.at, locale)}</small></div></li>)}</ol>}</section>
    <Link className="ct-back" to="/">‹ {text.back}</Link>
  </main>;
}
