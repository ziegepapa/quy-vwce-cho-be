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

  const maxAum = Math.max(...data.history.map(item => item.totalAssetsUsdMillions));
  const chartPoints = data.history.map((item,index)=>({
    ...item, x: 25 + 270*index/Math.max(1,data.history.length-1),
    y: 102 - (item.totalAssetsUsdMillions/maxAum)*78,
  }));
  const replicationMetrics = [
    {key:"holdings", name:de?"Anzahl Aktien":"Số mã nắm giữ", note:de?"Der Fonds investiert über eine Stichprobe, nicht zwingend in jeden Indexwert.":"Quỹ mua một mẫu đại diện, không nhất thiết giữ đủ mọi mã trong chỉ số.", unit:"integer"},
    {key:"priceEarnings", name:"P/E", note:de?"Marktpreis im Verhältnis zum Gewinn der Unternehmen.":"Giá cổ phiếu so với lợi nhuận của doanh nghiệp.", unit:"multiple"},
    {key:"priceBook", name:"P/B", note:de?"Marktpreis im Verhältnis zum buchhalterischen Eigenkapital.":"Giá cổ phiếu so với giá trị sổ sách.", unit:"multiple"},
    {key:"returnOnEquityPercent", name:"ROE", note:de?"Gewinn der Unternehmen im Verhältnis zum Eigenkapital.":"Lợi nhuận doanh nghiệp tạo ra so với vốn chủ sở hữu.", unit:"percent"},
    {key:"earningsGrowthPercent", name:de?"Gewinnwachstum":"Tăng trưởng lợi nhuận", note:de?"Veränderung des Unternehmensgewinns im Bezugszeitraum.":"Mức tăng lợi nhuận của các công ty trong kỳ đo.", unit:"percent"},
    {key:"dividendYieldPercent", name:de?"Dividendenrendite":"Lợi suất cổ tức", note:de?"Rendite der Aktien im Fonds, nicht eine Auszahlung an das Kind.":"Lợi suất cổ tức của cổ phiếu trong quỹ, không phải tiền tự trả cho Bé.", unit:"percent"},
  ] as const satisfies readonly {key:keyof Omit<VallReplicationSnapshot,"asOf"|"sourceUrl"|"provenance">;name:string;note:string;unit:string}[];
  const comparisonValue = (value:number,unit:string) => unit==="integer"
    ? new Intl.NumberFormat(fmt(locale),{maximumFractionDigits:0}).format(value)
    : unit==="multiple" ? new Intl.NumberFormat(fmt(locale),{minimumFractionDigits:1,maximumFractionDigits:1}).format(value)+"×"
    : new Intl.NumberFormat(fmt(locale),{minimumFractionDigits:1,maximumFractionDigits:1}).format(value)+"%";
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
      <span className="vh-quiet">{de ? "Vermerk aus dem Factsheet-Buch" : "Sổ factsheet theo kỳ"} · {date(latest.asOf)}</span>
    </div>

    <dl className="vh-metrics">
      <div className="vh-metric vh-metric-primary">
        <dt>{de?"Geld im Fonds (Total assets)":"Tiền trong quỹ (Total assets)"} <span>01</span></dt>
        <dd>US$ {new Intl.NumberFormat(fmt(locale),{maximumFractionDigits:0}).format(latest.totalAssetsUsdMillions)} <em>{de?"Mio.":"triệu"}</em></dd>
        <p className="vh-metric-tag vh-tag-known">{date(latest.asOf)}</p>
        <small>{de?"Gesamtvermögen laut Fonds-Factsheet, nicht das persönliche Geld des Kindes. Die Größe ist keine Bestandsgarantie.":"Quy mô tài sản của cả quỹ, không phải số dư của Bé. Quỹ lớn hơn không bảo đảm sẽ không đóng cửa."}</small>
      </div>
      <div className="vh-metric">
        <dt>{de?"Jährliche Fondskosten (OCF/TER)":"Phí quỹ mỗi năm (OCF/TER)"} <span>02</span></dt>
        <dd>{latest.ongoingChargesPercent===null?"—":percent(latest.ongoingChargesPercent,locale)}</dd>
        <p className="vh-metric-tag vh-tag-known">{date(latest.asOf)}</p>
        <small>{de?"Anteil der jährlich laufenden Fondskosten, keine garantierte Rendite.":"Phần phí vận hành quỹ mỗi năm, không phải tỷ lệ lợi nhuận."}</small>
      </div>
      <div className="vh-metric">
        <dt>{de?"Indexabweichung (Tracking difference)":"Độ lệch so với chỉ số (Tracking difference)"} <span>03</span></dt>
        <dd>{tdUnverified ? "—" : (latest.trackingDifferenceAnnualPp! > 0 ? "+" : "")+percent(latest.trackingDifferenceAnnualPp!,locale)}</dd>
        <p className="vh-metric-tag">{de?"Noch nicht veröffentlicht":"Chưa đủ dữ liệu"}</p>
        <small>{de?"Der Fonds startete am 18.08.2026. Vanguard veröffentlicht 1-Jahres-Performance erst nach einem Jahr, frühestens ab August 2027.":"Quỹ mới ra mắt 18/08/2026. Vanguard chỉ công bố hiệu suất sau 1 năm, sớm nhất từ 08/2027."}</small>
        <details className="vh-term"><summary>{de?"Begriff erklären":"Giải thích thuật ngữ"}</summary><p>{de?"Die Differenz zwischen Fondsrendite und eigenem Index über denselben Zeitraum.":"Chênh lệch lợi nhuận quỹ và chính chỉ số FTSE Global All Cap trong cùng một kỳ."}</p></details>
      </div>
    </dl>
    <details className="vh-expand" data-testid="vall-tr-fees">
      <summary>{de?"Trade Republic: Gebührenhinweis und Nachweis":"Trade Republic: phí mua và tình trạng xác minh"}</summary>
      <div className="vh-expand-body">
        <p><strong>{de?"Sparplan-Ausführung":"Mua theo Sparplan"}: {data.tradeRepublic.userReportedFees.sparplanExecutionEur} €</strong> · {de?"Einzelkauf":"Mua lẻ"}: {data.tradeRepublic.userReportedFees.oneOffOrderEur} €</p>
        <p>{de?"Von Chien am":"Chien xác nhận ngày"} {date(data.tradeRepublic.userReportedFees.asOf)}. {de?"Kein verifizierter Broker-Beleg; VALL-spezifischer Status ungeprüft.":"Chưa có biên nhận broker để xác minh riêng cho VALL; trạng thái vẫn chưa xác minh."}</p>
        <p>{de?"Allgemeine TR-Regel: kostenlose Sparplan-Ausführung. Konditionen je Order prüfen.":"Chính sách TR chung: Sparplan miễn phí thực hiện. Cần xem phí cụ thể của lệnh thật."}</p>
      </div>
    </details>

    <section className="vh-data-section" aria-label={de?"Entwicklung des Fondsvermögens":"Xu hướng tiền trong quỹ"}>
      <span className="vh-eyebrow">02 / {de?"FONDSVERMÖGEN":"XU HƯỚNG QUY MÔ"}</span>
      <h3>{de?"Entwicklung der Total Assets":"Tiền trong quỹ qua các kỳ"}</h3>
      <p>{de?"US-Dollar Millionen, je Stichtag des Factsheets; keine Performance des Kindes.":"Đơn vị: triệu USD; mỗi điểm là ngày chốt factsheet, không phải lãi/lỗ của Bé."}</p>
      <svg className="vh-aum-chart" viewBox="0 0 320 124" role="img" aria-label={de?"Total Assets nach Factsheet: 660, 2573, 4353 Millionen US-Dollar":"AUM theo factsheet: 660, 2573, 4353 triệu USD"}>
        <line x1="25" y1="109" x2="295" y2="109" stroke="currentColor" opacity=".25"/>
        <polyline fill="none" stroke="#229e91" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round"
          points={chartPoints.map(point => String(point.x)+","+String(point.y)).join(" ")}/>
        {chartPoints.map(point=><circle key={point.asOf} cx={point.x} cy={point.y} r="5" fill="#229e91" stroke="currentColor" strokeWidth="1"/>)}
      </svg>
      <ol className="vh-aum-values">{data.history.map(item=><li key={item.asOf}><strong>{new Intl.NumberFormat(fmt(locale)).format(item.totalAssetsUsdMillions)}</strong><small>{date(item.asOf)}</small></li>)}</ol>
      <p className="vh-aum-change" data-testid="vall-aum-change">{previous&&aumChange!==null
        ? (de?"Vom 30.09. bis 31.10.: +":"Từ 30/09 → 31/10: +")+Math.round(aumChange)+"% "+(de?"Total Assets, kein Anlageertrag.":"quy mô quỹ, không phải lợi nhuận.")
        : (de?"Keine vergleichbare Vorperiode.":"Chưa có kỳ trước để so sánh.")}</p>
      <details className="vh-expand">
        <summary>{de?"Anteilsklassenvermögen / Herkunft":"Tài sản lớp quỹ (Share class assets) và nguồn"}</summary>
        <div className="vh-expand-body">
          <p>{data.history.map(item=>date(item.asOf)+": US$ "+new Intl.NumberFormat(fmt(locale)).format(item.shareClassAssetsUsdMillions)).join(" · ")} {de?"Millionen":"triệu USD"}</p>
          <p>{de?"August/Oktober: Daten aus Chiens datiertem Prüfbuch; der aktuell zugängliche PDF-Link zeigt September. Vor unabhängiger Bestätigung nicht als live verifiziert darstellen.":"Tháng 8/10: số từ sổ factsheet bạn cung cấp; liên kết PDF hiện truy xuất bản 30/09. Chưa thể đối chiếu độc lập bản tháng 10 qua đường dẫn này."}</p>
        </div>
      </details>
    </section>

    <details className="vh-expand vh-replication" data-testid="vall-replication">
      <summary>{de?"Indexmerkmale vergleichen (31.10.2026)":"Bám sát đặc điểm danh mục (31/10/2026)"}</summary>
      <div className="vh-expand-body">
        <p>{de?"Kennzahlen der Positionen, KEINE Fondsrendite und KEINE Tracking Difference. Klicke einen Begriff zur Erklärung.":"Đây là đặc điểm các cổ phiếu quỹ nắm giữ so với chỉ số, KHÔNG phải hiệu suất hay tracking difference. Bấm thuật ngữ để xem giải thích."}</p>
        <div className="vh-replication-head"><span>{de?"Kennzahl":"Chỉ tiêu"}</span><span>VALL</span><span>FTSE Global All Cap</span></div>
        {replicationMetrics.map(row=>{
          const values=data.replicationSnapshot[row.key];
          return <div className="vh-replication-row" key={row.key}>
            <details className="vh-term"><summary>{row.name}</summary><p>{row.note}</p></details>
            <span>{comparisonValue(values.fund,row.unit)}</span>
            <span>{comparisonValue(values.benchmark,row.unit)}</span>
          </div>;
        })}
        <p>{de?"Stichproben-Replikation: ähnliche Kennzahlen beweisen noch keine geringe Performance-Abweichung. Quelle: datierter Oktober-Eintrag aus Chiens Ledger.":"Quỹ sử dụng lấy mẫu đại diện. Chỉ số danh mục gần nhau không chứng minh độ lệch hiệu suất thấp. Nguồn: số tháng 10 từ sổ bạn đã đối chiếu."}</p>
      </div>
    </details>


    <div className="vh-insights">
      <div className="vh-insight-card">
        <span className="vh-eyebrow">04 / {de ? "NÄCHSTER CHECK" : "LỊCH KIỂM TRA"}</span>
        <h3>{de ? "Nächster externer Termin" : "Mốc kiểm tra bên ngoài kế tiếp"}</h3>
        <div className="vh-upcoming">{state.nextReview ? date(state.nextReview.date) : "—"}</div>
        <p className="vh-countdown" data-testid="vall-countdown">{daysToReview !== null ? (daysToReview===0 ? (de?"Heute geplant — kein Abschlussbeleg":"Dự kiến hôm nay — chưa xác nhận đã kiểm tra") : (de?"Noch "+daysToReview+" Tage":"Còn "+daysToReview+" ngày")) : (de?"Kein weiterer Termin in der Datei":"Chưa có mốc mới trong file")}</p>
        <p>{state.nextReview
          ? state.nextReview.kind === "light" ? (de ? "Kurzprüfung laut bestehendem externem Plan" : "Kiểm tra nhẹ theo kế hoạch có sẵn") : (de ? "Vollprüfung laut externem Plan" : "Đợt kiểm tra đầy đủ theo lịch bên ngoài")
          : (de ? "Alle eingetragenen Termine sind vergangen; kein Abschlussbeleg im Snapshot." : "Các mốc trong file đã qua; chưa có bằng chứng hoàn tất từ dữ liệu này.")}</p>
        <div className="vh-mini-timeline" aria-label={de ? "Externer Prüfplan" : "Lịch kiểm tra bên ngoài"}>
          {data.externalReviewDates.light.map(d=><span key={d}>{date(d)}</span>)}
          <span>{date(data.externalReviewDates.full)} · {de ? "voll" : "đầy đủ"}</span>
        </div>
      </div>
      <div className="vh-insight-card">
        <span className="vh-eyebrow">05 / {de?"OFFENE FRAGEN":"CHƯA CÓ BẰNG CHỨNG"}</span>
        <h3>{de ? "Was noch fehlt" : "Cần xác minh những gì?"}</h3>
        <p className="vh-insight-lead">{de ? "Nicht verifiziert ≠ unbedenklich" : "Chưa xác minh ≠ không có rủi ro"}</p>
        <ul className="vh-unverified">
          {unverified.length ? unverified.map(x=><li key={x}>{x}</li>) : <li>{de ? "Keine offenen Felder in dieser Datei; kein Zukunftsversprechen." : "Không có trường trống trong file; không bảo đảm kết quả tương lai."}</li>}
        </ul>
      </div>
    </div>


    <section className="vh-know-when" aria-label={de?"Wann gibt es neue Daten?":"Khi nào có dữ liệu mới?"}>
      <span className="vh-eyebrow">06 / {de?"ZEITPLAN DER NACHWEISE":"KHI NÀO BIẾT ĐƯỢC GÌ?"}</span>
      <h3>{de?"Welche Antwort ist wann möglich?":"Khi nào biết được gì?"}</h3>
      <ol>
        <li><strong>{de?"Mitte Dezember 2026 (voraussichtlich)":"Giữa 12/2026 (dự kiến)"}</strong><span>{de?"November-Factsheet prüfen; nur wenn tatsächlich veröffentlicht.":"Xem factsheet tháng 11 khi Vanguard thực sự phát hành; không tự cập nhật."}</span></li>
        <li><strong>{de?"Ab August 2027":"Từ 08/2027"}</strong><span>{de?"Erste Jahres-Performance möglich; dann erst Tracking Difference zum eigenen FTSE Global All Cap beurteilen.":"Có thể bắt đầu có dữ liệu hiệu suất một năm để đánh giá độ lệch so với đúng FTSE Global All Cap."}</span></li>
        <li><strong>{de?"Nach Beleg einer echten Order":"Khi Chien xác nhận biên nhận lệnh thật"}</strong><span>{de?"Dann erst den VALL-Sparplan-Gebührenstatus als verifiziert markieren.":"Lúc đó mới được đánh dấu phí Sparplan riêng VALL đã xác minh từ broker."}</span></li>
      </ol>
    </section>
    <div className="vh-section-heading vh-section-heading-flags">
      <div><span className="vh-eyebrow">07 / {de?"BEOBACHTUNGSPUNKTE":"CỜ ĐỎ"}</span><h3>{de ? "Prüfprotokoll" : "Danh sách đối chiếu thủ công"}</h3></div>
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
      <span className="vh-eyebrow">08 / {de ? "ORIENTIERUNG" : "SO SÁNH CÓ NGỮ CẢNH"}</span>
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
      <span className="vh-eyebrow">09 / {de ? "QUELLEN" : "BẰNG CHỨNG"}</span>
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
