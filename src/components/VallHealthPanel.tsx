import snapshot from "../data/vall-health.json";
import { parseVallHealth, verifiedVallWarning, type VallFlag } from "../lib/vallHealthSnapshot";
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

function displayDate(date: string, locale: AppLocale) {
  return new Date(date + "T12:00:00Z").toLocaleDateString(locale === "de" ? "de-DE" : "vi-VN", { day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC" });
}
function percent(value: number, locale: AppLocale) {
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "vi-VN", { minimumFractionDigits:2,maximumFractionDigits:2 }).format(value) + "%";
}
export default function VallHealthPanel({locale}: {locale:AppLocale}) {
  const data = parseVallHealth(snapshot);
  const de = locale === "de";
  if (!data) return <section role="alert">{de ? "VALL-Snapshot ungültig. Keine Werte anzeigen." : "Dữ liệu VALL không hợp lệ; không hiển thị số."}</section>;
  const latest = data.history[data.history.length - 1];
  const flags = Object.entries(data.flags) as [VallFlag,boolean|null][];
  const warning = verifiedVallWarning(data);
  const date = (v:string) => displayDate(v,locale);
  return <section className="vall-health" aria-label="VALL Health Monitor" data-testid="vall-health">
    <header className="vall-health-head">
      <h2>VALL Health Monitor</h2>
      <small>{de ? "Nur geprüfter Repo-Snapshot" : "Chỉ hiển thị snapshot đã kiểm tra"} · {date(data.checkedOn)}</small>
    </header>
    <p className="vall-health-sub">VALL · {data.fundIsin}<span>{data.benchmark}</span></p>
    <p className="vall-health-notice" role="status">
      {warning
        ? (de ? "Gemeldetes Warnsignal: Quellen prüfen; nur künftige Sparraten neu bewerten." : "Có cờ đỏ đã ghi nhận: cần xem nguồn và cân nhắc chỉ chuyển khoản góp mới.")
        : (de ? "Kein bestätigtes Warnsignal in dieser Datei. Ungeprüft bedeutet NICHT sicher." : "Chưa có cờ đỏ được xác nhận trong file. Chưa kiểm tra KHÔNG đồng nghĩa an toàn.")}
    </p>
    <dl className="vall-health-grid">
      <div><dt>Tracking difference</dt><dd>{latest.trackingDifferenceAnnualPp === null ? "—" : `${latest.trackingDifferenceAnnualPp > 0 ? "+" : ""}${percent(latest.trackingDifferenceAnnualPp,locale)}`}</dd>
        <small>{latest.trackingDifferenceAnnualPp === null ? (de ? "Noch keine 1-Jahres-Daten (Start 18.08.2026)" : "Chưa đủ lịch sử 1 năm (quỹ ra mắt 18/08/2026)") : (de ? "Zum FTSE Global All Cap; annualisiert laut Quelle" : "So với FTSE Global All Cap, theo kỳ đã xác minh")}</small></div>
      <div><dt>Total assets</dt><dd>US$ {new Intl.NumberFormat(de?"de-DE":"vi-VN",{maximumFractionDigits:0}).format(latest.totalAssetsUsdMillions)} {de?"Mio.":"triệu"}</dd>
        <small>{de?"Vanguard-Factsheet vom":"Factsheet Vanguard chốt ngày"} {date(latest.asOf)}; {de?"keine Quellmischung":"không ghép số từ nguồn khác"}</small></div>
      <div><dt>OCF / TER</dt><dd>{percent(latest.ongoingChargesPercent,locale)}</dd>
        <small>{de?"Vanguard; Stand":"Vanguard; ngày chốt"} {date(latest.asOf)}</small></div>
      <div><dt>{de?"Trade Republic Sparplan":"Sparplan Trade Republic"}</dt>
        <dd>{data.tradeRepublic.vallSparplanFreeVerified === null ? "—" : data.tradeRepublic.vallSparplanFreeVerified ? (de?"Kostenfrei bestätigt":"Đã xác nhận miễn phí") : (de?"Nicht kostenlos":"Không còn miễn phí")}</dd>
        <small>{data.tradeRepublic.generalSparplanExecutionFree
          ? (de?"Allgemeine Sparplan-Ausführung gratis; VALL-spezifischer Status ungeprüft.":"Chính sách chung miễn phí thực hiện Sparplan; riêng VALL chưa xác minh.")
          : (de?"Gebührenstatus nicht belegt.":"Chưa có bằng chứng về phí.")}</small></div>
    </dl>
    <div className="vall-health-section">
      <h3>{de?"Warnsignale aus externen Prüfungen":"Cờ đỏ từ đợt kiểm tra bên ngoài"}</h3>
      <ul className="vall-health-flags">
        {flags.map(([key,value])=><li key={key}>
          <span aria-label={value===null?"unknown":value?"red":"checked"}>
            {value===null?"—":value?"!":"✓"}
          </span>
          <span>{signalLabels[key][de?1:0]}<small>{value===null?(de?"Noch nicht bestätigt":"Chưa xác minh"):value?(de?"Prüfung erforderlich":"Cần kiểm tra nguồn"):(de?"Bei letzter Prüfung nicht gemeldet":"Không ghi nhận trong lần kiểm tra")}</small></span>
        </li>)}
      </ul>
    </div>
    <div className="vall-health-section">
      <h3>{de?"Geplante externe Prüftermine":"Lịch kiểm tra bên ngoài (không chạy trong app)"}</h3>
      <p>{de?"Kurzprüfung":"Kiểm tra nhẹ"}: {data.externalReviewDates.light.map(date).join(" · ")}<br/>
      {de?"Vollprüfung":"Kiểm tra đầy đủ"}: {date(data.externalReviewDates.full)}</p>
      <p className="vall-health-muted">{de?"Diese App startet keine Überwachung und lädt keine Kurs-/Factsheet-Daten im Hintergrund. Neue Ergebnisse erscheinen erst nach einem geprüften Daten-Commit.":"App không tự giám sát, không fetch factsheet hay chạy nền. Chỉ hiện kết quả mới sau khi commit file dữ liệu đã xác minh."}</p>
    </div>
    <div className="vall-health-section">
      <h3>{de?"Nur bei bestätigtem Warnsignal erwägen":"Chỉ xem xét khi cờ đỏ được xác nhận"}</h3>
      <p>{de?"Neue Sparplanraten ggf. zu":"Có thể cân nhắc chuyển Sparplan góp mới về"} <strong>VWCE</strong> ({data.fallback.isin}) — {data.fallback.benchmark}, OCF/TER {percent(data.fallback.ongoingChargesPercent,locale)}. {de?"Bestehende Anteile nicht automatisch verkaufen.":"Không tự bán vị thế hiện có."}</p>
    </div>
    <p className="vall-health-links">
      <a href={latest.sourceUrl} target="_blank" rel="noopener noreferrer">Vanguard factsheet</a>
      <a href={data.tradeRepublic.sourceUrl} target="_blank" rel="noopener noreferrer">Trade Republic</a>
      <a href={data.fallback.sourceUrl} target="_blank" rel="noopener noreferrer">VWCE factsheet</a>
    </p>
    <p className="vall-health-muted">{de?"Nur Dokumentation, keine Renditegarantie oder Anlageberatung. Keine Gemini-Anfrage.":"Chỉ ghi nhận dữ kiện, không hứa lợi nhuận, không tư vấn đầu tư, không gọi Gemini."}</p>
  </section>;
}
