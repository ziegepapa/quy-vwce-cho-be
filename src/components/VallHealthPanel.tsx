import { useState } from "react";
import snapshot from "../data/vall-health.json";
import { parseVallHealth, type VallFlag, type VallReplicationSnapshot } from "../lib/vallHealthSnapshot";
import { vallFlagOrder, vallViewState, aumChangePercent, daysUntilExternalReview } from "../lib/vallHealthView";
import type { AppLocale } from "../lib/locale";
import "../styles/vall-health.css";

const signalLabels: Record<VallFlag, [string,string]> = {
  persistentNegativeTrackingDifference: [
    "TD âm kéo dài, vượt chi phí ~0,15–0,30 điểm %/năm",
    "Anhaltende negative TD über Kosten um ca. 0,15–0,30 Prozentpunkte/Jahr",
  ],
  severeAumDrop: ["Total assets sụt mạnh qua nhiều factsheet", "Starker Rückgang der Total Assets über mehrere Factsheets"],
  lostFreeVallSparplan: ["VALL mất Sparplan miễn phí tại Trade Republic", "VALL-Sparplan bei Trade Republic nicht mehr kostenlos"],
  increasedTer: ["TER/OCF của VALL tăng", "TER/OCF von VALL steigt"],
  mergerOrLiquidation: ["Quỹ sáp nhập hoặc thanh lý", "Fondsfusion oder -auflösung"],
};
const fmt = (locale: AppLocale) => locale === "de" ? "de-DE" : "vi-VN";
function displayDate(date: string, locale: AppLocale) {
  return new Date(date + "T12:00:00Z").toLocaleDateString(fmt(locale), {day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"});
}
function percent(value: number, locale: AppLocale) {
  return new Intl.NumberFormat(fmt(locale),{minimumFractionDigits:2,maximumFractionDigits:2}).format(value) + "%";
}

export default function VallHealthPanel({locale}: {locale:AppLocale}) {
  const [filter, setFilter] = useState<"all"|"unknown">("all");
  const data = parseVallHealth(snapshot);
  const de = locale === "de";
  if (!data) return <section role="alert">{de ? "VALL-Snapshot ungültig. Keine Werte anzeigen." : "Dữ liệu VALL không hợp lệ; không hiển thị số."}</section>;

  const latest = data.history.at(-1)!;
  const previous = data.history.at(-2);
  const aumChange = previous ? aumChangePercent(latest.totalAssetsUsdMillions,previous.totalAssetsUsdMillions) : null;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const state = vallViewState(data,today);
  const daysToReview = state.nextReview ? daysUntilExternalReview(state.nextReview.date,today) : null;
  const date = (value:string) => displayDate(value,locale);
  const flags = vallFlagOrder.filter(key => filter === "all" || data.flags[key] === null);
  const decision = state.warningFlags > 0 ? (de ? "Bestätigtes Warnsignal" : "Có cờ đỏ cần kiểm tra")
    : state.unknownFlags > 0 ? (de ? "Noch kein endgültiges Urteil" : "Chưa đủ bằng chứng để kết luận")
    : (de ? "Keine gemeldeten Warnsignale" : "Chưa ghi nhận cờ đỏ trong sổ");
  const judgement = state.warningFlags > 0
    ? (de ? "Dokumentiertes Warnsignal prüfen; nur zukünftige Sparraten erwägen." : "Đối chiếu nguồn cờ đỏ; chỉ xem xét khoản góp mới, không tự bán vị thế.")
    : (de ? `Gemeldete Total Assets: ${aumChange===null?"—":"+"+Math.round(aumChange)+"%"} von September bis Oktober; OCF weiter 0,07%. Portfolio-Kennzahlen ähneln dem Index. Eine echte Tracking Difference ist erst nach einem Jahr ab August 2027 verfügbar. Ungeprüft bedeutet NICHT sicher.`
          : `Theo sổ factsheet, tiền trong quỹ tăng ${aumChange===null?"—":"+"+Math.round(aumChange)+"%"} từ 30/09 đến 31/10, phí vẫn 0,07% và vài đặc điểm danh mục gần chỉ số. Có dấu hiệu tích cực về quy mô nhưng chưa đủ để kết luận quỹ an toàn. Độ lệch hiệu suất chỉ có sau một năm, từ 08/2027; 5 cờ đỏ vẫn chưa xác minh.`);
  const trUnverified = data.tradeRepublic.vallSparplanFreeVerified === null;
  const tdUnverified = latest.trackingDifferenceAnnualPp === null;
  const unverified = [
    ...(tdUnverified ? [de ? "1-Jahres-Tracking-Difference noch nicht veröffentlicht" : "Tracking difference 1 năm chưa có dữ liệu"] : []),
    ...(trUnverified ? [de ? "VALL-spezifischer Sparplanstatus ungeprüft" : "Sparplan miễn phí riêng VALL chưa xác minh"] : []),
    ...(state.unknownFlags ? [de ? `${state.unknownFlags}/5 Warnsignale noch ungeprüft` : `${state.unknownFlags}/5 cờ đỏ chưa được xác minh`] : []),
  ];
  return <section className="vall-health" aria-label="VALL Health Monitor" data-testid="vall-health">
    <header className="vh-hero">
      <div className="vh-topline">
        <span className="vh-kicker"><span className="vh-led" aria-hidden="true"/> FUND INTELLIGENCE</span>
        <span className="vh-stamp">{de ? "Geprüfter Repo-Stand" : "Snapshot đã đối chiếu"} · {date(data.checkedOn)}</span>
      </div>
      <div className="vh-hero-main">
        <div>
          <div className="vh-asset-label">VANGUARD  /  ETF HEALTH</div>
          <h2>VALL <span>Health Monitor</span></h2>
          <p className="vh-hero-index">{data.benchmark}</p>
          <p className="vh-hero-isin">{data.fundIsin}</p>
        </div>
        <div className="vh-orbit" aria-hidden="true"><span>V</span></div>
      </div>
      <div className="vh-hero-foot">
        <span className="vh-hero-pill">{de ? "Datierter Quellenstand" : "Số liệu theo kỳ đã ghi nhận"}</span>
        <span>{de ? "Keine Live-Überwachung" : "Không giám sát trực tiếp"}</span>
      </div>
    </header>

    <div className={`vh-interpretation${state.warningFlags ? " vh-interpretation-warning" : ""}`} role="status">
      <span className="vh-status-glyph" aria-hidden="true">{state.warningFlags ? "!" : "i"}</span>
      <div>
        <span className="vh-eyebrow">{de ? "IST DER FONDS FÜR DAS KIND IN ORDNUNG?" : "QUỸ CỦA BÉ CÓ ỔN KHÔNG?"}</span>
        <h3>{decision}</h3>
        <p>{judgement}</p>
      </div>
      <div className="vh-evidence-count">
        <strong>{state.knownFlags}<small>/5</small></strong>
        <span>{de ? "Warnsignale geprüft" : "cờ đỏ đã đối chiếu"}</span>
      </div>
    </div>

    <div className="vh-section-heading">
      <div><span className="vh-eyebrow">01 / {de?"FAKTEN":"DỮ KIỆN"}</span><h3>{de ? "Drei Kernwerte" : "Ba con số quan trọng nhất"}</h3></div>
      <span className="vh-quiet">{de ? "Stand: Vanguard-Factsheet" : "Theo factsheet Vanguard"} {date(latest.asOf)}</span>
    </div>
    <dl className="vh-metrics">
      <div className="vh-metric vh-metric-primary">
        <dt>{de ? "Abweichung vom Index (Tracking difference)" : "Độ lệch so với chỉ số (Tracking difference)"} <span>01</span></dt>
        <dd>{tdUnverified ? "—" : `${latest.trackingDifferenceAnnualPp! > 0 ? "+" : ""}${percent(latest.trackingDifferenceAnnualPp!,locale)}`}</dd>
        <p className="vh-metric-tag">{tdUnverified ? (de ? "Nicht verfügbar" : "Chưa có số liệu") : (de ? "Quelle dokumentiert" : "Có số trong file")}</p>
        <small>{tdUnverified ? (de ? "Noch keine 1-Jahres-Daten (Start 18.08.2026)" : "Chưa đủ lịch sử 1 năm (quỹ ra mắt 18/08/2026)") : (de ? "Gegen den FTSE Global All Cap – laut Quelle" : "So với FTSE Global All Cap, theo kỳ đã xác minh")}</small>
      </div>
      <div className="vh-metric">
        <dt>{de ? "Geld im Fonds (Total assets)" : "Tiền trong quỹ (Total assets)"} <span>02</span></dt>
        <dd>US$ {new Intl.NumberFormat(fmt(locale), {maximumFractionDigits:0}).format(latest.totalAssetsUsdMillions)} <em>{de ? "Mio." : "triệu"}</em></dd>
        <p className="vh-metric-tag vh-tag-known">Vanguard · {date(latest.asOf)}</p>
        <small>{de ? "Total assets laut datiertem Factsheet; keine Quellmischung." : "Total assets theo factsheet có ngày chốt; không ghép số từ nguồn khác."}</small>
      </div>
      <div className="vh-metric">
        <dt>{de ? "Jährliche Fondskosten (OCF/TER)" : "Phí quỹ mỗi năm (OCF/TER)"} <span>03</span></dt>
        <dd>{latest.ongoingChargesPercent===null?"—":percent(latest.ongoingChargesPercent,locale)}</dd>
        <p className="vh-metric-tag vh-tag-known">{de ? "Faktenblatt bestätigt" : "Đã có nguồn factsheet"}</p>
        <small>{de ? "Laufende Kosten · Stand" : "Phí thường niên · ngày chốt"} {date(latest.asOf)}</small>
      </div>
      <div className="vh-metric">
        <dt>Trade Republic Sparplan <span>04</span></dt>
        <dd>{trUnverified ? "—" : data.tradeRepublic.vallSparplanFreeVerified ? (de ? "Kostenfrei" : "Miễn phí") : (de ? "Nicht gratis" : "Không miễn phí")}</dd>
        <p className="vh-metric-tag">{trUnverified ? (de ? "VALL nicht einzeln geprüft" : "Riêng VALL chưa xác minh") : (de ? "Instrumentenprüfung dokumentiert" : "Có kết quả kiểm tra riêng")}</p>
        <small>{data.tradeRepublic.generalSparplanExecutionFree
          ? (de ? "Allgemeine Sparplan-Ausführung gratis; VALL-spezifischer Status ungeprüft." : "Chính sách chung miễn phí thực hiện Sparplan; riêng VALL chưa xác minh.")
          : (de ? "Gebührenstatus nicht belegt." : "Chưa có bằng chứng về phí.")}</small>
      </div>
    </dl>

    <div className="vh-insights">
      <div className="vh-insight-card">
        <span className="vh-eyebrow">02 / {de ? "NÄCHSTER CHECK" : "LỊCH KIỂM TRA"}</span>
        <h3>{de ? "Nächster externer Termin" : "Mốc kiểm tra bên ngoài kế tiếp"}</h3>
        <div className="vh-upcoming">{state.nextReview ? date(state.nextReview.date) : "—"}</div>
        <p>{state.nextReview
          ? state.nextReview.kind === "light" ? (de ? "Kurzprüfung laut bestehendem externem Plan" : "Kiểm tra nhẹ theo kế hoạch có sẵn") : (de ? "Vollprüfung laut externem Plan" : "Đợt kiểm tra đầy đủ theo lịch bên ngoài")
          : (de ? "Alle eingetragenen Termine sind vergangen; kein Abschlussbeleg im Snapshot." : "Các mốc trong file đã qua; chưa có bằng chứng hoàn tất từ dữ liệu này.")}</p>
        <div className="vh-mini-timeline" aria-label={de ? "Externer Prüfplan" : "Lịch kiểm tra bên ngoài"}>
          {data.externalReviewDates.light.map(d=><span key={d}>{date(d)}</span>)}
          <span>{date(data.externalReviewDates.full)} · {de ? "voll" : "đầy đủ"}</span>
        </div>
      </div>
      <div className="vh-insight-card">
        <span className="vh-eyebrow">03 / {de?"OFFENE FRAGEN":"CHƯA CÓ BẰNG CHỨNG"}</span>
        <h3>{de ? "Was noch fehlt" : "Cần xác minh những gì?"}</h3>
        <p className="vh-insight-lead">{de ? "Nicht verifiziert ≠ unbedenklich" : "Chưa xác minh ≠ không có rủi ro"}</p>
        <ul className="vh-unverified">
          {unverified.length ? unverified.map(x=><li key={x}>{x}</li>) : <li>{de ? "Keine offenen Felder in dieser Datei; kein Zukunftsversprechen." : "Không có trường trống trong file; không bảo đảm kết quả tương lai."}</li>}
        </ul>
      </div>
    </div>

    <div className="vh-section-heading vh-section-heading-flags">
      <div><span className="vh-eyebrow">04 / {de?"BEOBACHTUNGSPUNKTE":"CỜ ĐỎ"}</span><h3>{de ? "Prüfprotokoll" : "Danh sách đối chiếu thủ công"}</h3></div>
      <span className="vh-quiet">{state.unknownFlags}/5 {de ? "ungeprüft" : "chưa xác minh"}</span>
    </div>
    <div className="vh-filter" role="group" aria-label={de ? "Warnsignale filtern" : "Lọc cờ đỏ"}>
      <button type="button" aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>
        {de ? "Alle fünf" : "Tất cả 5"}
      </button>
      <button type="button" aria-pressed={filter==="unknown"} onClick={()=>setFilter("unknown")}>
        {de ? `Offen (${state.unknownFlags})` : `Chưa xác minh (${state.unknownFlags})`}
      </button>
    </div>
    <ul className="vh-flags" data-testid="vall-flags">
      {flags.length ? flags.map((key,index)=>{
        const value = data.flags[key];
        return <li key={key} className={value===true?"vh-flag-alert":""}>
          <span className="vh-flag-mark" aria-hidden="true">{value===null?"?":value?"!":"✓"}</span>
          <span className="vh-flag-copy"><strong>{signalLabels[key][de?1:0]}</strong>
            <small>{value===null?(de?"Noch nicht bestätigt":"Chưa xác minh"):value?(de?"Prüfung erforderlich":"Cần kiểm tra nguồn"):(de?"Bei letzter Prüfung nicht gemeldet":"Không ghi nhận trong lần kiểm tra")}</small>
          </span>
          <span className="vh-flag-no">{String(index+1).padStart(2,"0")}</span>
        </li>;
      }) : <li className="vh-empty">{de ? "Keine offenen Signale im Snapshot. Das ist keine Garantie." : "Không còn mục chưa xác minh trong file. Không đồng nghĩa bảo đảm an toàn."}</li>}
    </ul>

    <section className="vh-compare">
      <span className="vh-eyebrow">05 / {de ? "ORIENTIERUNG" : "SO SÁNH CÓ NGỮ CẢNH"}</span>
      <h3>{de ? "Zwei Fonds. Zwei unterschiedliche Indizes." : "Hai quỹ — hai chỉ số khác nhau"}</h3>
      <div className="vh-compare-grid">
        <div><span className="vh-symbol">VALL</span><strong>{latest.ongoingChargesPercent===null?"—":percent(latest.ongoingChargesPercent,locale)}</strong><small>{data.benchmark}</small><small>{data.fundIsin}</small></div>
        <div><span className="vh-symbol">VWCE</span><strong>{percent(data.fallback.ongoingChargesPercent,locale)}</strong><small>{data.fallback.benchmark}</small><small>{data.fallback.isin}</small></div>
      </div>
      <p>{de
        ? "Die TER allein erlaubt keinen Qualitäts- oder Renditevergleich: unterschiedliche Benchmarks. Nur bei belegtem Warnsignal künftige Sparplanraten prüfen; keine automatische Veräußerung."
        : "Không lấy chênh lệch TER để kết luận quỹ nào tốt hơn: hai benchmark khác nhau. Chỉ khi cờ đỏ được xác minh mới cân nhắc chuyển Sparplan góp mới về VWCE; không tự bán vị thế cũ."}</p>
    </section>

    <footer className="vh-footer">
      <span className="vh-eyebrow">06 / {de ? "QUELLEN" : "BẰNG CHỨNG"}</span>
      <h3>{de ? "Daten nachprüfen" : "Kiểm tra nguồn gốc số liệu"}</h3>
      <nav className="vh-links" aria-label={de?"Quellen":"Nguồn dữ liệu"}>
        <a href={latest.sourceUrl} target="_blank" rel="noopener noreferrer">Vanguard factsheet <span aria-hidden="true">↗</span></a>
        <a href={data.tradeRepublic.sourceUrl} target="_blank" rel="noopener noreferrer">Trade Republic <span aria-hidden="true">↗</span></a>
        <a href={data.fallback.sourceUrl} target="_blank" rel="noopener noreferrer">VWCE factsheet <span aria-hidden="true">↗</span></a>
      </nav>
      <p>{de
        ? "Nur ein datierter Repo-Snapshot. Keine automatische Aktualisierung, keine Hintergrundüberwachung, keine Gemini-Anfrage. Keine Renditegarantie oder Anlageberatung."
        : "Chỉ hiển thị snapshot đã commit. Không tải dữ liệu nền, không tự theo dõi, không gọi Gemini. Không hứa lợi nhuận hoặc tư vấn đầu tư."}</p>
    </footer>
  </section>;
}
