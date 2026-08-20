import { Link } from "react-router-dom";
import { useLocale } from "../lib/locale";
import { buildLotEvidenceSummary, type LotEvidenceFixtureInput, type LotEvidenceRow } from "./lotEvidence";
import "../styles/lot-evidence.css";

const FIXTURES: LotEvidenceFixtureInput[] = [
  { evidenceId: "fixture-001", eventKind: "purchase", eventDate: "2024-02-14", instrumentLabel: "ETF fixture A", lotId: "lot-fixture-a", sourceStatus: "known", quantityStatus: "known" },
  { evidenceId: "fixture-002", eventKind: "transfer", eventDate: "2024-05-10", instrumentLabel: "ETF fixture A", lotId: "lot-fixture-b", sourceStatus: "missing", quantityStatus: "known" },
  { evidenceId: "fixture-003", eventKind: "split", eventDate: "2025-01-07", instrumentLabel: "ETF fixture B", lotId: "lot-fixture-c", sourceStatus: "known", quantityStatus: "known" },
  { evidenceId: "fixture-004", eventKind: "partial_sale", eventDate: "2025-03-21", instrumentLabel: "ETF fixture B", sourceStatus: "known", quantityStatus: "known" },
  { evidenceId: "fixture-005", eventKind: "sale", eventDate: "2025-06-30", instrumentLabel: "ETF fixture C", lotId: "lot-fixture-d", sourceStatus: "conflict", quantityStatus: "conflict" },
];

function copy(locale: "vi" | "de") {
  return locale === "de" ? {
    eyebrow: "P11.1 · Testbereich", title: "Lot-Nachweise", intro: "Nur synthetische Fixtures. Diese Ansicht liest keine Vault-Daten und speichert nichts.", warning: "Dies ist kein Steuerrechner und kein offizieller Steuerbericht.", dataNotice: "Fehlende oder widersprüchliche Angaben bleiben als nicht bestimmt sichtbar.", summary: (ready: number, total: number) => `${ready} von ${total} Nachweisen prüfbar`, all: "Nur-Lese-Ansicht", event: "Ereignis", instrument: "Instrument", status: "Lot-Status", source: "Quelle", reason: "Grund", reviewable: "Prüfbar", notReady: "Nicht bereit", known: "Bekannt", incomplete: "Unvollständig", unknown: "Nicht bestimmt", sourceKnown: "Bekannt", sourceMissing: "Fehlt", sourceConflict: "Widersprüchlich", reasonReady: "Grunddaten vorhanden", reasonMissingLot: "Lot fehlt", reasonMissingTransfer: "Transferquelle fehlt", reasonMissingSplit: "Split-Nachweis fehlt", reasonConflict: "Quellen widersprechen sich", reasonQuantity: "Mengenangabe fehlt oder widerspricht sich", purchase: "Kauf", sale: "Verkauf", transfer: "Transfer", split: "Split", partial_sale: "Teilverkauf", back: "Zurück zur Übergabe", noTax: "Keine Steuerberechnung, keine FIFO-Auswahl und keine Empfehlung.", unknownRule: "Nicht bestimmt ist ein gültiger Status — es gibt keinen stillen Ersatzwert.", date: (value: string) => new Intl.DateTimeFormat("de-DE").format(new Date(value)),
  } : {
    eyebrow: "P11.1 · Khu vực thử nghiệm", title: "Bằng chứng lô", intro: "Chỉ dùng fixture giả. Trang này không đọc dữ liệu vault và không lưu gì.", warning: "Đây không phải bộ tính thuế và không phải hồ sơ thuế chính thức.", dataNotice: "Dữ liệu thiếu hoặc mâu thuẫn luôn được giữ ở trạng thái chưa xác định.", summary: (ready: number, total: number) => `${ready}/${total} bằng chứng có thể xem xét`, all: "Chỉ đọc", event: "Sự kiện", instrument: "Công cụ", status: "Trạng thái lô", source: "Nguồn", reason: "Lý do", reviewable: "Có thể xem xét", notReady: "Chưa sẵn sàng", known: "Đã biết", incomplete: "Chưa đủ", unknown: "Chưa xác định", sourceKnown: "Đã biết", sourceMissing: "Thiếu", sourceConflict: "Mâu thuẫn", reasonReady: "Đủ dữ liệu nền", reasonMissingLot: "Thiếu thông tin lô", reasonMissingTransfer: "Thiếu nguồn transfer", reasonMissingSplit: "Thiếu bằng chứng split", reasonConflict: "Các nguồn mâu thuẫn", reasonQuantity: "Thiếu hoặc mâu thuẫn số lượng", purchase: "Mua", sale: "Bán", transfer: "Chuyển", split: "Split", partial_sale: "Bán một phần", back: "Về bàn giao", noTax: "Không tính thuế, không tự chọn FIFO và không khuyến nghị.", unknownRule: "Chưa xác định là trạng thái hợp lệ — không có giá trị thay thế âm thầm.", date: (value: string) => new Intl.DateTimeFormat("vi-VN").format(new Date(value)),
  };
}

function eventLabel(row: LotEvidenceRow, text: ReturnType<typeof copy>) {
  return text[row.eventKind];
}
function reasonLabel(row: LotEvidenceRow, text: ReturnType<typeof copy>) {
  const map = { ready: "reasonReady", missing_lot: "reasonMissingLot", missing_transfer_source: "reasonMissingTransfer", missing_split_reference: "reasonMissingSplit", conflicting_source: "reasonConflict", missing_quantity: "reasonQuantity" } as const;
  return text[map[row.reasonCode]];
}

export default function LotEvidence() {
  const { locale } = useLocale();
  const text = copy(locale);
  const summary = buildLotEvidenceSummary(FIXTURES);
  return <main className="lot-shell" aria-label={text.title}>
    <header className="lot-head"><p>{text.eyebrow}</p><h1>{text.title}</h1><span>{text.all}</span></header>
    <section className="lot-notice" role="note"><strong>{text.intro}</strong><p>{text.warning} {text.dataNotice}</p></section>
    <section className="lot-card lot-summary"><div><span>{text.all}</span><strong>{text.summary(summary.ready, summary.total)}</strong></div><p>{text.noTax}</p></section>
    <section className="lot-card" aria-live="polite"><div className="lot-card-head"><h2>{text.title}</h2><span>{summary.notReady} {text.notReady}</span></div><div className="lot-list">{summary.rows.map((row) => <article className={`lot-row is-${row.reviewState}`} key={row.evidenceId}>
      <div className="lot-row-main"><strong>{eventLabel(row, text)}</strong><span>{row.instrumentLabel} · {text.date(row.eventDate)}</span></div>
      <div className="lot-row-status"><span className="lot-pill">{row.lotStatus === "known" ? text.known : row.lotStatus === "incomplete" ? text.incomplete : text.unknown}</span><small>{row.reviewState === "reviewable" ? text.reviewable : text.notReady}</small></div>
      <div className="lot-row-detail"><span>{text.source}: {row.sourceStatus === "known" ? text.sourceKnown : row.sourceStatus === "missing" ? text.sourceMissing : text.sourceConflict}</span><span>{text.reason}: {reasonLabel(row, text)}</span></div>
    </article>)}</div></section>
    <p className="lot-unknown-note">{text.unknownRule}</p>
    <Link className="lot-back" to="/handoff">‹ {text.back}</Link>
  </main>;
}
