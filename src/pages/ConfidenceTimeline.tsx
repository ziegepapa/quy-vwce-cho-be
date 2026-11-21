import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSettings, listQuotes, listTransactions } from "../lib/db";
import type { SyncStatus } from "../lib/sync/types";
import { isSecuritySell, isSecurityTx, isValidAsOfDate, resolveInstrumentIsin } from "../lib/instrument";
import { VALL_ISIN, VWCE_ISIN, type Transaction } from "../lib/types";
import { useLocale } from "../lib/locale";
import {
  buildConfidenceTimeline,
  type ConfidenceTimelineEvent,
  type ConfidenceTimelineLens,
  type ConfidenceTimelineSource,
} from "./confidenceTimeline";
import { IconDownload, IconSim, IconTx, IconUser } from "../components/Icons";
import "../styles/confidence-timeline.css";

function timelineCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    heading: "Zeitleiste",
    journey: "Deine Anlagechronik",
    heroIntro: "Jeder Kauf ein Kapitel. Dein Weg im Überblick.",
    tradesLabel: "Investments",
    volumeLabel: "Kaufvolumen",
    sinceLabel: "Erster Kauf",
    firstTrade: "Erste Wertpapierbuchung",
    toTrades: "Transaktionen öffnen",
    noTrades: "Noch keine Wertpapiertransaktionen.",
    buy: "Kauf",
    sell: "Verkauf",
    title: "Status-Zeitleiste",
    intro: "Datierte Ereignisse aus diesem Vault. Die Zeitleiste verändert keine Buchung.",
    loading: "Status-Zeitleiste wird geladen…",
    error: "Die Status-Zeitleiste konnte nicht geladen werden. Ihre lokalen Daten wurden nicht verändert.",
    retry: "Erneut versuchen",
    noEvents: "Noch keine datierten Statusereignisse vorhanden.",
    noVisibleEvents: "Für diese Auswahl sind keine datierten Statusereignisse vorhanden.",
    dayEvents: (count: number) => `${count} Ereignis${count === 1 ? "" : "se"}`,
    today: "Heute",
    yesterday: "Gestern",
    quote: "Kurs-Snapshot",
    transactionCreated: "Buchung erfasst",
    transactionUpdated: "Buchung geändert",
    imported: "Import erfasst",
    quoteSource: "Preis",
    ledgerSource: "Ledger",
    importSource: "Import",
    sync: "Aktueller Datenstatus",
    syncIdle: "Keine Änderungen warten auf Synchronisierung.",
    synced: "Synchronisiert",
    syncing: "Synchronisierung ausstehend",
    offline: "Auf diesem Gerät gespeichert",
    conflict: "Datenkonflikt prüfen",
    pending: (count: number) => `${count} Änderung${count === 1 ? "" : "en"} ausstehend`,
    privacy: "Beträge und Kursdaten werden angezeigt, wenn sie vorhanden sind. Notizen öffnen Sie bei Bedarf. Notfallkontakte öffnen Sie bei Bedarf; angezeigt wird der aktuelle Stand, keine Historie pro Kontakt.",
    timeLens: "Zeitraum",
    sources: "Quellen",
    all: "Alles",
    last30: "30 Tage",
    last90: "90 Tage",
    thisYear: "Dieses Jahr",
    showMore: (shown: number, total: number) => `Weitere anzeigen (${shown}/${total})`,
    showNote: "Notiz anzeigen",
    session: "Kursdatum",
    botFetched: "Kursquelle abgerufen",
    venue: "Handelsplatz",
    reportDate: "Berichtsdatum",
    positions: "Positionen",
    manualPrice: "Manueller Kurs",
    contactSource: "Notfallkontakte",
    contactSnapshot: (count: number) => `Aktueller Notfallkontakt-Snapshot · ${count}`,
    showContacts: (count: number) => `Kontaktdaten anzeigen (${count})`,
    relation: "Beziehung",
    phone: "Telefon",
    email: "E-Mail",
    contactSnapshotNote: "Aktueller gespeicherter Stand; keine Historie pro Kontakt.",
    back: "Zur Übersicht",
  } : {
    heading: "Dòng thời gian",
    journey: "Hành trình đầu tư",
    heroIntro: "Mỗi lần đầu tư là một dấu mốc trên hành trình.",
    tradesLabel: "Lượt đầu tư",
    volumeLabel: "Tổng giá trị mua",
    sinceLabel: "Lần mua đầu",
    firstTrade: "Giao dịch chứng khoán đầu tiên",
    toTrades: "Mở nhật ký giao dịch",
    noTrades: "Chưa có giao dịch chứng khoán.",
    buy: "Mua",
    sell: "Bán",
    title: "Dòng thời gian trạng thái",
    intro: "Các sự kiện có ngày giờ từ Vault này. Dòng thời gian không thay đổi giao dịch.",
    loading: "Đang tải dòng thời gian trạng thái…",
    error: "Không tải được dòng thời gian trạng thái. Dữ liệu trên thiết bị chưa bị thay đổi.",
    retry: "Thử lại",
    noEvents: "Chưa có sự kiện trạng thái nào có ngày giờ hợp lệ.",
    noVisibleEvents: "Không có sự kiện trạng thái phù hợp với bộ lọc hiện tại.",
    dayEvents: (count: number) => `${count} sự kiện`,
    today: "Hôm nay",
    yesterday: "Hôm qua",
    quote: "Snapshot giá",
    transactionCreated: "Đã ghi giao dịch",
    transactionUpdated: "Đã chỉnh giao dịch",
    imported: "Đã ghi nhận import",
    quoteSource: "Giá",
    ledgerSource: "Ledger",
    importSource: "Import",
    sync: "Trạng thái dữ liệu hiện tại",
    syncIdle: "Không có thay đổi đang chờ đồng bộ.",
    synced: "Đã đồng bộ",
    syncing: "Còn thay đổi chờ đồng bộ",
    offline: "Được giữ trên thiết bị này",
    conflict: "Cần xử lý xung đột dữ liệu",
    pending: (count: number) => `Còn ${count} thay đổi chờ`,
    privacy: "Số tiền và giá hiển thị khi có dữ liệu. Ghi chú mở riêng khi bạn chọn xem; liên hệ khẩn cấp chỉ hiển thị khi bạn mở chi tiết; đây là danh sách hiện tại, không phải lịch sử từng liên hệ.",
    timeLens: "Khoảng thời gian",
    sources: "Nguồn",
    all: "Tất cả",
    last30: "30 ngày",
    last90: "90 ngày",
    thisYear: "Năm nay",
    showMore: (shown: number, total: number) => `Xem thêm (${shown}/${total})`,
    showNote: "Xem ghi chú",
    session: "Phiên giá",
    botFetched: "Bot lấy dữ liệu",
    venue: "Sàn",
    reportDate: "Ngày báo cáo",
    positions: "vị thế",
    manualPrice: "Giá thủ công",
    contactSource: "Liên hệ khẩn cấp",
    contactSnapshot: (count: number) => `Snapshot liên hệ hiện tại · ${count} người`,
    showContacts: (count: number) => `Xem thông tin liên hệ (${count})`,
    relation: "Quan hệ",
    phone: "Điện thoại",
    email: "Email",
    contactSnapshotNote: "Đây là danh sách hiện đang lưu, không phải lịch sử thay đổi riêng từng liên hệ.",
    back: "Về Tổng quan",
  };
}

function formatTime(value: string, locale: "vi" | "de") {
  const date = new Date(value);
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sourceIcon(source: ConfidenceTimelineSource) {
  if (source === "quote") return <IconSim />;
  if (source === "ledger") return <IconTx />;
  if (source === "import") return <IconDownload />;
  return <IconUser />;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDay(date: Date, locale: "vi" | "de"): string {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

type TimelineDayGroup = {
  key: string;
  label: string;
  events: ConfidenceTimelineEvent[];
};

/**
 * Nhóm sự kiện theo ngày lịch địa phương. Sự kiện đã xếp mới-nhất-trước
 * nên ngày đầu tiên cũng là ngày mới nhất. Sự kiện có `at` không hợp lệ
 * không vào nhóm nào (builder đã loại chúng khỏi danh sách).
 */
function groupTimelineEventsByDay(
  events: readonly ConfidenceTimelineEvent[],
  locale: "vi" | "de",
  text: ReturnType<typeof timelineCopy>,
): TimelineDayGroup[] {
  const groups: TimelineDayGroup[] = [];
  const today = new Date();
  const todayKey = dayKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);
  for (const event of events) {
    const date = new Date(event.at);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    let group = groups.find((item) => item.key === key);
    if (!group) {
      const day = formatDay(date, locale);
      const label = key === todayKey ? `${text.today} · ${day}` : key === yesterdayKey ? `${text.yesterday} · ${day}` : day;
      group = { key, label, events: [] };
      groups.push(group);
    }
    group.events.push(event);
  }
  return groups;
}

function formatSessionDate(value: string, locale: "vi" | "de") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTradeMonth(value: string, locale: "vi" | "de") {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatMoney(value: number, currency: string, locale: "vi" | "de") {
  try {
    return new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString(locale === "de" ? "de-DE" : "vi-VN")} ${currency}`;
  }
}

function instrumentLabel(isin: string) {
  if (isin === VWCE_ISIN) return "VWCE";
  if (isin === VALL_ISIN) return "VALL";
  return isin;
}

function transactionTypeLabel(type: string, locale: "vi" | "de") {
  const labels: Record<string, { vi: string; de: string }> = {
    buy_vwce: { vi: "Mua VWCE", de: "VWCE kaufen" },
    sell_vwce: { vi: "Bán VWCE", de: "VWCE verkaufen" },
    buy_security: { vi: "Mua chứng khoán khác", de: "Anderes Wertpapier kaufen" },
    sell_security: { vi: "Bán chứng khoán khác", de: "Anderes Wertpapier verkaufen" },
    cash_in: { vi: "Tiền vào", de: "Geldeingang" },
    cash_out: { vi: "Chi tiền", de: "Geldausgang" },
    tax: { vi: "Thuế", de: "Steuer" },
    fee: { vi: "Phí", de: "Gebühr" },
    safe_interest: { vi: "Lãi an toàn", de: "Sicherheitszins" },
    adjust: { vi: "Điều chỉnh", de: "Anpassung" },
  };
  return labels[type]?.[locale] ?? type;
}

function transactionAmount(amount: number, type: string, locale: "vi" | "de") {
  const sign = type === "cash_in" || type === "safe_interest" ? "+" : ["cash_out", "tax", "fee"].includes(type) ? "−" : "";
  return `${sign}${formatMoney(amount, "EUR", locale)}`;
}

function eventHeading(event: ConfidenceTimelineEvent, locale: "vi" | "de", text: ReturnType<typeof timelineCopy>) {
  if (event.contacts) return text.contactSnapshot(event.contacts.length);
  if (event.quote) {
    const instrument = instrumentLabel(event.quote.instrumentIsin);
    return locale === "de" ? `Kurs-Snapshot · ${instrument}` : `Snapshot giá · ${instrument}`;
  }
  if (event.transaction) {
    const kind = event.kind === "transaction_created"
      ? text.transactionCreated
      : event.kind === "transaction_updated"
        ? text.transactionUpdated
        : text.imported;
    return `${kind} · ${transactionTypeLabel(event.transaction.type, locale)}`;
  }
  if (event.statement) {
    return locale === "de" ? "Depot-Auszug importiert" : "Đã nhập sao kê danh mục";
  }
  return event.kind === "quote" ? text.quote : event.kind === "transaction_created" ? text.transactionCreated : event.kind === "transaction_updated" ? text.transactionUpdated : text.imported;
}

export default function ConfidenceTimeline({ syncStatus, pending }: { syncStatus: SyncStatus; pending: number }) {
  const { locale } = useLocale();
  const text = timelineCopy(locale);
  const [data, setData] = useState<{
    settings: Awaited<ReturnType<typeof getSettings>>;
    quotes: Awaited<ReturnType<typeof listQuotes>>;
    transactions: Awaited<ReturnType<typeof listTransactions>>;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [lens, setLens] = useState<ConfidenceTimelineLens>("all");
  const [sources, setSources] = useState<ConfidenceTimelineSource[]>(["quote", "ledger", "import", "contacts"]);
  const [limit, setLimit] = useState(30);
  const [tradeDayLimit, setTradeDayLimit] = useState(30);

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
    notfallmappe: data.settings.notfallmappe ?? null,
    syncStatus,
    pending,
    lens,
    sources,
    limit,
  }) : null, [data, lens, limit, pending, sources, syncStatus]);

  const dayGroups = useMemo(
    () => timeline ? groupTimelineEventsByDay(timeline.events, locale, text) : [],
    [timeline, locale, text],
  );

  const tradeDays = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const tx of data?.transactions ?? []) {
      if (tx.deletedAt || !isSecurityTx(tx.type) || !isValidAsOfDate(tx.date)) continue;
      const group = groups.get(tx.date);
      if (group) group.push(tx);
      else groups.set(tx.date, [tx]);
    }
    return [...groups].sort(([left], [right]) => right.localeCompare(left));
  }, [data]);

  const selectLens = (next: ConfidenceTimelineLens) => { setLens(next); setLimit(30); };
  const toggleSource = (source: ConfidenceTimelineSource) => {
    setSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source]);
    setLimit(30);
  };

  if (!timeline && !failed) return <section className="ct-shell" role="status" aria-live="polite"><p>{text.loading}</p></section>;
  if (!timeline || failed) return <section className="ct-shell" role="alert"><h1>{text.title}</h1><p>{text.error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>{text.retry}</button></section>;

  const firstTradeDate = tradeDays.at(-1)?.[0];
  const totalTrades = tradeDays.reduce((count, [, trades]) => count + trades.length, 0);
  const boughtVolume = tradeDays.reduce((sum, [, trades]) => sum + trades.reduce((daySum, tx) => daySum + (isSecuritySell(tx.type) ? 0 : tx.amount), 0), 0);
  const syncLabel = timeline.sync.status === "synced" ? text.synced : timeline.sync.status === "syncing" ? text.syncing : timeline.sync.status === "conflict" ? text.conflict : text.offline;
  const sourceLabel = (source: ConfidenceTimelineSource) => source === "quote" ? text.quoteSource : source === "ledger" ? text.ledgerSource : source === "contacts" ? text.contactSource : text.importSource;
  const lenses: Array<{ key: ConfidenceTimelineLens; label: string }> = [{ key: "all", label: text.all }, { key: "30d", label: text.last30 }, { key: "90d", label: text.last90 }, { key: "thisYear", label: text.thisYear }];
  const sourceOptions: Array<{ key: ConfidenceTimelineSource; label: string }> = [{ key: "quote", label: text.quoteSource }, { key: "ledger", label: text.ledgerSource }, { key: "import", label: text.importSource }, { key: "contacts", label: text.contactSource }];
  const emptyMessage = timeline.totalEvents === 0 && data && (data.quotes.length + data.transactions.length + (data.settings.depotStatements?.length ?? 0) + (data.settings.notfallmappe?.contacts.length ?? 0) > 0) ? text.noVisibleEvents : text.noEvents;

  return (
    <main className="ct-shell" aria-label={text.heading}>
      <header className="ct-head mwj-page-head mwj-journey-hero">
        <div className="mwj-journey-hero-content">
          <span className="mwj-journey-eyebrow">{text.journey}</span>
          <h1>{text.heading}</h1>
          <p>{text.heroIntro}</p>
          <dl className="mwj-journey-highlights">
            <div><dd>{totalTrades}</dd><dt>{text.tradesLabel}</dt></div>
            <div><dd>{formatMoney(boughtVolume, "EUR", locale)}</dd><dt>{text.volumeLabel}</dt></div>
            <div><dd>{firstTradeDate ? formatTradeMonth(firstTradeDate, locale) : "—"}</dd><dt>{text.sinceLabel}</dt></div>
          </dl>
        </div>
      </header>

      <section className="ct-card ct-trades" aria-labelledby="ct-trades-title">
        <h2 id="ct-trades-title">{text.journey}</h2>
        {tradeDays.length === 0 ? (
          <div className="ct-trade-empty">
            <p className="ct-empty">{text.noTrades}</p>
            <Link className="ct-back" to="/transactions">{text.toTrades} ›</Link>
          </div>
        ) : (
          <div className="ct-days ct-trade-rail">
            {tradeDays.slice(0, tradeDayLimit).map(([date, trades], index) => (
              <Fragment key={date}>
                {date.slice(0, 7) !== tradeDays[index - 1]?.[0].slice(0, 7) ? (
                  <h3 className="ct-trade-month">{formatTradeMonth(date, locale)}</h3>
                ) : null}
                <section className="ct-day ct-trade-day">
                  <h4 className="ct-day-title"><time dateTime={date}>{formatSessionDate(date, locale)}</time></h4>
                  {date === firstTradeDate ? <p className="ct-first-trade">{text.firstTrade}</p> : null}
                  <ul className="ct-events">
                    {trades.map((tx) => {
                      const isin = resolveInstrumentIsin(tx);
                      const action = isSecuritySell(tx.type) ? text.sell : text.buy;
                      const name = isin ? `${action} ${instrumentLabel(isin)}` : transactionTypeLabel(tx.type, locale);
                      return (
                        <li key={tx.id}>
                          <span className={`ct-source ${isin === VALL_ISIN ? "is-quote" : "is-ledger"}`} aria-hidden="true"><IconTx /></span>
                          <strong>{name}</strong>
                          <span className="ct-event-value">{formatMoney(tx.amount, "EUR", locale)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </Fragment>
            ))}
          </div>
        )}
        {tradeDayLimit < tradeDays.length ? (
          <button className="ct-more" type="button" onClick={() => setTradeDayLimit((value) => value + 30)}>{text.showMore(tradeDayLimit, tradeDays.length)}</button>
        ) : null}
      </section>

      <details className="ct-card ct-confidence" open={tradeDays.length === 0}>
        <summary><h2>{text.title}</h2></summary>
        <p className="ct-confidence-intro">{text.intro}</p>
        <div className={`ct-sync is-${timeline.sync.status}`}>
          <div><span>{text.sync}</span><strong>{syncLabel}</strong></div>
          <p>{timeline.sync.pending > 0 ? text.pending(timeline.sync.pending) : text.syncIdle}</p>
        </div>
        <section className="ct-card ct-lenses">
          <div className="ct-lens-group">
            <span>{text.timeLens}</span>
            <div role="group" aria-label={text.timeLens}>
              {lenses.map((option) => <button type="button" key={option.key} aria-pressed={lens === option.key} onClick={() => selectLens(option.key)}>{option.label}</button>)}
            </div>
          </div>
          <div className="ct-lens-group">
            <span>{text.sources}</span>
            <div role="group" aria-label={text.sources}>
              {sourceOptions.map((option) => <button type="button" key={option.key} aria-pressed={sources.includes(option.key)} onClick={() => toggleSource(option.key)}>{option.label}</button>)}
            </div>
          </div>
        </section>

        <section className="ct-journal">
          <p className="ct-privacy" role="note">{text.privacy}</p>
          {timeline.events.length === 0 ? <p className="ct-empty">{emptyMessage}</p> : (
            <div className="ct-days">
              {dayGroups.map((group, index) => (
                <details className="ct-day" key={group.key} open={index === 0}>
                  <summary className="ct-day-summary">
                    <span className="ct-day-title">{group.label}</span>
                    <span className="ct-day-count">{text.dayEvents(group.events.length)}</span>
                  </summary>
                  <ol className="ct-events">
                    {group.events.map((event) => (
                      <li key={event.id}>
                        <span className={`ct-source is-${event.source}`} aria-hidden="true">{sourceIcon(event.source)}</span>
                        <div className="ct-event-content">
                          <strong>{eventHeading(event, locale, text)}</strong>
                          <small className="ct-event-meta">{sourceLabel(event.source)} · {formatTime(event.at, locale)}</small>

                          {event.quote ? (
                            <div className="ct-event-details">
                              <span className="ct-event-value">{formatMoney(event.quote.price, event.quote.currency, locale)}</span>
                              <small>{text.session}: {formatSessionDate(event.quote.asOf, locale)}{event.quote.venue ? ` · ${text.venue}: ${event.quote.venue}` : ""}</small>
                              {event.quote.fetchedAt ? <small>{text.botFetched}: {formatTime(event.quote.fetchedAt, locale)}</small> : <small>{event.quote.source === "manual" ? text.manualPrice : ""}</small>}
                            </div>
                          ) : null}

                          {event.transaction ? (
                            <div className="ct-event-details">
                              <span className="ct-event-value">{transactionAmount(event.transaction.amount, event.transaction.type, locale)}</span>
                              {event.transaction.instrumentIsin ? <small>{instrumentLabel(event.transaction.instrumentIsin)}</small> : null}
                              {event.transaction.notes?.trim() ? (
                                <details className="ct-event-note">
                                  <summary>{text.showNote}</summary>
                                  <p>{event.transaction.notes}</p>
                                </details>
                              ) : null}
                            </div>
                          ) : null}

                          {event.contacts ? (
                            <details className="ct-event-contact">
                              <summary>{text.showContacts(event.contacts.length)}</summary>
                              <p className="ct-event-contact-note">{text.contactSnapshotNote}</p>
                              <ul>
                                {event.contacts.map((contact) => (
                                  <li key={contact.id}>
                                    <strong>{contact.name}</strong>
                                    {contact.relation ? <small>{text.relation}: {contact.relation}</small> : null}
                                    {contact.phone ? <small>{text.phone}: <a href={`tel:${contact.phone}`}>{contact.phone}</a></small> : null}
                                    {contact.email ? <small>{text.email}: <a href={`mailto:${contact.email}`}>{contact.email}</a></small> : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}

                    {event.statement ? (
                      <small className="ct-event-detail-line">
                        {text.reportDate}: {formatSessionDate(event.statement.date, locale)} · {event.statement.positionsCount} {text.positions}
                      </small>
                    ) : null}
                  </div>
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          )}
          {timeline.events.length < timeline.totalEvents ? <button className="ct-more" type="button" onClick={() => setLimit((value) => value + 30)}>{text.showMore(timeline.events.length, timeline.totalEvents)}</button> : null}
        </section>
      </details>
      <Link className="ct-back" to="/">‹ {text.back}</Link>
    </main>
  );
}
