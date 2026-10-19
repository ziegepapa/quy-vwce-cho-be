import { useMemo } from "react";
import { useLocale } from "../../lib/locale";
import { formatMoney } from "../../lib/calc";
import type { PortfolioHeartbeat } from "../../pages/portfolioHeartbeat";
import type { PortfolioDataHealth, PortfolioDataHealthIssue } from "../../pages/portfolioDataHealth";
import type { YearInReview } from "../../pages/yearInReview";
import type { ValueHistoryPoint } from "../../lib/valueHistory";
import ValueHistoryChart from "../ValueHistoryChart";
import "../../styles/overview-ban2.css";

/** One allocation slice: numeric value + weight for the donut and the table. */
export type AllocationSlice = {
  isin: string;
  ticker: string;
  /** Full fund name, e.g. "Vanguard FTSE All-World". */
  name: string;
  /** Value in EUR (number, not formatted). */
  value: number;
  /** 0–100. */
  weightPct: number;
  /** Formatted shares, e.g. "1,9192". */
  shares: string;
  /** Formatted "170,44 €/cp", null when no price. */
  pricePerShare: string | null;
  /** Formatted "327,11 €". */
  valueLabel: string;
};

export type UpdateItem = {
  key: string;
  /** Formatted "16/10/2026". */
  dateLabel: string;
  title: string;
  detail: string;
};

type OverviewFrameProps = {
  assetsLabel: string;
  /** Formatted total, e.g. "446,58 €". */
  assets: string;
  /** Formatted lifetime contributions, e.g. "440,00 €". */
  contributedLabel: string;
  /** Formatted gain, e.g. "+6,58 €", null when unavailable. */
  gainLabel: string | null;
  /** Formatted gain pct, e.g. "+1,5%", null when unavailable. */
  gainPctLabel: string | null;
  gainPositive: boolean;
  /** Formatted latest quote date, e.g. "16/10/2026". */
  priceDateLabel: string | null;
  stale: boolean;
  fundCount: number;
  /** Formatted pace, e.g. "120,00 €/tháng". */
  paceLabel: string | null;
  daysToNext: number | null;
  milestone: { targetLabel: string; progressPct: number; remainingLabel: string } | null;
  allocation: AllocationSlice[];
  valueHistory: ValueHistoryPoint[] | null;
  updates: UpdateItem[];
  heartbeat: PortfolioHeartbeat;
  dataHealth: PortfolioDataHealth;
  yearInReview: YearInReview;
  yearReviewYears: number[];
  onYearReviewYearChange: (year: number) => void;
};

function overviewCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    pageLabel: "Übersicht",
    totalAssets: "Gesamtvermögen",
    contributedByYou: "Eingezahlt",
    marketAdded: "Markt dazu",
    gainUnavailable: "Noch nicht bewertbar",
    fundCount: "Fonds",
    pace: "Sparrate",
    nextContribution: "Nächster Beitrag",
    inDays: (days: number) => days === 0 ? "heute" : `in ${days} Tagen`,
    priceUpdated: "Kurse aktualisiert",
    stalePrice: "Alter Kurs",
    nextMilestone: "Nächster Meilenstein",
    noFixedTarget: "Kein festes Ziel — einfach weiter sparen.",
    milestone: "Meilenstein",
    reached: "Erreicht",
    remaining: "Noch",
    journeyTitle: "Langfristige Reise",
    journeyLine1: "beginnt mit kleinen Beträgen",
    journeyLine2: "Jeden Tag ein bisschen — die Zukunft wird ganz anders!",
    valueVsContributed: "Wert vs Eingezahlt",
    honestCaption: "Der Anstieg kommt hauptsächlich von Ihren Einzahlungen — der Abstand der Linien ist der echte Gewinn.",
    valueLine: "Wert",
    contributedLine: "Eingezahlt",
    allocation: "Vermögensaufteilung",
    allocationSub: "Nach aktuellem Wert.",
    totalValue: "Gesamtwert",
    portfolio: "Portfolio",
    viewDetails: "Details ansehen →",
    fund: "Fonds",
    currentValue: "Aktueller Wert",
    weight: "Gewichtung",
    shares: "Anteile",
    recentUpdates: "Neueste Updates",
    viewFullHistory: "Vollständigen Verlauf ansehen →",
    attention: "Zu beachten",
    review: "Prüfen ›",
    yearReviewMissingNotes: (count: number) => count === 1 ? "1 Notiz fehlt" : `${count} Notizen fehlen`,
    healthIssue: (issue: PortfolioDataHealthIssue) => issue.code === "transaction_quality"
      ? `${issue.count} Datenpunkte prüfen`
      : issue.code === "missing_quotes"
        ? `Kurse für ${issue.count} Wertpapiere fehlen`
        : issue.code === "stale_quotes"
          ? `Kurse für ${issue.count} Wertpapiere aktualisieren`
          : "Backup noch nicht erfasst",
    rhythmQuality: (count: number) => `${count} Transaktion${count === 1 ? "" : "en"} prüfen`,
    rhythmMissingPrices: (count: number) => `Kurse für ${count} Wertpapier${count === 1 ? "" : "e"} fehlen`,
    rhythmStalePrices: (count: number) => `Kurse für ${count} Wertpapier${count === 1 ? "" : "e"} aktualisieren`,
    yearReview: "Jahresrückblick",
    yearReviewExport: "Bericht exportieren",
    yearReviewTransactions: "Buchungen",
    yearReviewFees: "Gebühren",
    reviewYear: "Prüfjahr",
  } : {
    pageLabel: "Tổng quan",
    totalAssets: "Tổng giá trị tài sản",
    contributedByYou: "Bạn đã góp",
    marketAdded: "Thị trường thêm",
    gainUnavailable: "Chưa định giá",
    fundCount: "Số quỹ",
    pace: "Nhịp góp",
    nextContribution: "Kỳ góp tới",
    inDays: (days: number) => days === 0 ? "hôm nay" : `trong ${days} ngày`,
    priceUpdated: "Giá cập nhật",
    stalePrice: "Giá cũ",
    nextMilestone: "Cột mốc tiếp theo",
    noFixedTarget: "Không có vạch đích cố định — cứ góp đều.",
    milestone: "Cột mốc",
    reached: "Đã đạt",
    remaining: "Còn lại",
    journeyTitle: "Hành trình dài hạn",
    journeyLine1: "bắt đầu từ những khoản nhỏ",
    journeyLine2: "Mỗi ngày một chút, tương lai sẽ rất khác!",
    valueVsContributed: "Giá trị vs Đã góp",
    honestCaption: "Đường đi lên chủ yếu là tiền bạn góp — khoảng cách 2 đường mới là lãi thật.",
    valueLine: "Giá trị",
    contributedLine: "Đã góp",
    allocation: "Phân bổ tài sản",
    allocationSub: "Theo giá trị hiện tại.",
    totalValue: "Tổng giá trị",
    portfolio: "Danh mục đầu tư",
    viewDetails: "Xem chi tiết →",
    fund: "Quỹ",
    currentValue: "Giá trị hiện tại",
    weight: "Tỷ trọng",
    shares: "Số cổ phần",
    recentUpdates: "Cập nhật gần nhất",
    viewFullHistory: "Xem lịch sử đầy đủ →",
    attention: "Cần chú ý",
    review: "Rà soát ›",
    yearReviewMissingNotes: (count: number) => count === 1 ? "1 ghi chú còn thiếu" : `${count} ghi chú còn thiếu`,
    healthIssue: (issue: PortfolioDataHealthIssue) => issue.code === "transaction_quality"
      ? `${issue.count} mục dữ liệu cần rà soát`
      : issue.code === "missing_quotes"
        ? `Thiếu giá cho ${issue.count} mã`
        : issue.code === "stale_quotes"
          ? `Cần cập nhật giá cho ${issue.count} mã`
          : "Chưa ghi nhận sao lưu",
    rhythmQuality: (count: number) => `${count} giao dịch cần rà soát`,
    rhythmMissingPrices: (count: number) => `Thiếu giá cho ${count} mã`,
    rhythmStalePrices: (count: number) => `Cần cập nhật giá cho ${count} mã`,
    yearReview: "Tổng kết năm",
    yearReviewExport: "Xuất báo cáo",
    yearReviewTransactions: "giao dịch",
    yearReviewFees: "Phí",
    reviewYear: "Năm",
  };
}

type AttentionItem = {
  key: string;
  label: string;
  href: string | null;
};

/** Merged attention list — same dedup logic as before, restyled. */
function buildAttentionItems(
  heartbeat: PortfolioHeartbeat,
  dataHealth: PortfolioDataHealth,
  text: ReturnType<typeof overviewCopy>,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const seen = new Set<string>();
  const byCode = new Map(dataHealth.issues.map((issue) => [issue.code, issue]));
  const heartbeatCode = heartbeat.attention.kind === "quality"
    ? "transaction_quality"
    : heartbeat.attention.kind === "missing_prices"
      ? "missing_quotes"
      : heartbeat.attention.kind === "stale_prices"
        ? "stale_quotes"
        : null;
  const preciseLabel = (issue: PortfolioDataHealthIssue) =>
    issue.code === "transaction_quality" && dataHealth.missingNotesOnly
      ? text.yearReviewMissingNotes(dataHealth.missingNoteCount)
      : text.healthIssue(issue);
  if (heartbeat.attention.kind !== "none") {
    const issue = heartbeatCode ? byCode.get(heartbeatCode) : undefined;
    if (issue) {
      items.push({ key: issue.code, label: preciseLabel(issue), href: issue.href });
      seen.add(issue.code);
    } else {
      const label = heartbeat.attention.kind === "quality"
        ? text.rhythmQuality(heartbeat.attention.count)
        : heartbeat.attention.kind === "missing_prices"
          ? text.rhythmMissingPrices(heartbeat.attention.count)
          : text.rhythmStalePrices(heartbeat.attention.count);
      items.push({ key: `heartbeat-${heartbeat.attention.kind}`, label, href: heartbeat.attention.href });
      if (heartbeatCode) seen.add(heartbeatCode);
    }
  }
  for (const issue of dataHealth.issues) {
    if (seen.has(issue.code)) continue;
    items.push({ key: issue.code, label: preciseLabel(issue), href: issue.href });
  }
  return items;
}

/** Soft landscape illustration for the hero — hills, sun, trees. */
function LandscapeArt() {
  return (
    <svg className="ovb2-art" viewBox="0 0 400 220" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      <circle cx="330" cy="42" r="26" fill="#fde68a" />
      <path d="M0 150 L90 70 L170 140 L250 60 L340 140 L400 90 L400 220 L0 220 Z" fill="#bbf7d0" opacity=".7" />
      <path d="M0 175 L120 110 L230 170 L330 120 L400 160 L400 220 L0 220 Z" fill="#86efac" opacity=".8" />
      <g fill="#16a34a" opacity=".85">
        <circle cx="60" cy="170" r="14" /><rect x="58" y="170" width="4" height="18" />
        <circle cx="150" cy="160" r="18" /><rect x="148" y="160" width="4" height="22" />
        <circle cx="250" cy="168" r="15" /><rect x="248" y="168" width="4" height="20" />
        <circle cx="330" cy="158" r="19" /><rect x="328" y="158" width="4" height="24" />
      </g>
    </svg>
  );
}

/** Donut of the allocation. Colors cycle blue → green → amber → purple. */
const DONUT_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6"];
function AllocationDonut({ allocation, totalLabel, totalSub }: {
  allocation: AllocationSlice[];
  totalLabel: string;
  totalSub: string;
}) {
  const total = allocation.reduce((s, a) => s + a.value, 0);
  const r = 52;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  const segs = allocation.map((a, i) => {
    const len = total > 0 ? (a.value / total) * circ : 0;
    const seg = { ...a, len, offset: -acc, color: DONUT_COLORS[i % DONUT_COLORS.length] };
    acc += len;
    return seg;
  });
  return (
    <div className="ovb2-donutwrap">
      <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={totalSub} className="ovb2-donut">
        <circle cx="66" cy="66" r={r} fill="none" className="ovb2-donut-track" strokeWidth="20" />
        {segs.map((s) => (
          <circle
            key={s.isin}
            cx="66" cy="66" r={r} fill="none"
            stroke={s.color} strokeWidth="20"
            strokeDasharray={`${s.len.toFixed(1)} ${circ.toFixed(1)}`}
            strokeDashoffset={s.offset.toFixed(1)}
            transform="rotate(-90 66 66)"
          />
        ))}
        <text x="66" y="63" textAnchor="middle" fontSize="15" fontWeight="800" className="ovb2-donut-total">{totalLabel}</text>
        <text x="66" y="80" textAnchor="middle" fontSize="10" className="ovb2-donut-sub">{totalSub}</text>
      </svg>
      <div className="ovb2-alloc">
        {segs.map((s) => (
          <div className="ovb2-allocrow" key={s.isin}>
            <span className="ovb2-sw" style={{ background: s.color }} />
            <span className="ovb2-allocname">{s.ticker}<small>{s.name} · {s.isin}</small></span>
            <span className="ovb2-allocval">{s.valueLabel}<small>{s.weightPct.toFixed(1).replace(".", ",")}%</small></span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OverviewFrame(props: OverviewFrameProps) {
  const {
    assetsLabel, assets, contributedLabel, gainLabel, gainPctLabel, gainPositive,
    priceDateLabel, stale, fundCount, paceLabel, daysToNext, milestone,
    allocation, valueHistory, updates, heartbeat, dataHealth,
    yearInReview, yearReviewYears, onYearReviewYearChange,
  } = props;
  const { locale } = useLocale();
  const text = overviewCopy(locale);
  const attentionItems = useMemo(
    () => buildAttentionItems(heartbeat, dataHealth, text),
    [heartbeat, dataHealth, text],
  );
  const yearReviewDisplay = [
    `${yearInReview.transactionCount} ${text.yearReviewTransactions}`,
    `${text.yearReviewFees} ${formatMoney(yearInReview.fees)}`,
  ].join(" · ");
  const yearReviewLine = useMemo(() => [
    `${text.yearReview} ${yearInReview.year}`,
    `${text.yearReviewTransactions}: ${yearInReview.transactionCount}`,
  ].join("\n"), [text, yearInReview]);
  const exportYearReview = () => {
    const url = URL.createObjectURL(new Blob([`${yearReviewLine}\n`], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vwce-year-in-review-${yearInReview.year}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="ovb2" aria-label={text.pageLabel}>
      <div className="ovb2-grid">
        <div className="ovb2-main">
          {/* Hero */}
          <section className="ovb2-card ovb2-hero" aria-label={assetsLabel}>
            <LandscapeArt />
            <div className="ovb2-k">{text.totalAssets}</div>
            <div className="ovb2-big">{assets}</div>
            <div className="ovb2-comp">
              {text.contributedByYou} <b>{contributedLabel}</b>
              {gainLabel ? (
                <> · {text.marketAdded} <span className={gainPositive ? "up" : "down"}>{gainLabel}{gainPctLabel ? ` (${gainPctLabel})` : ""}</span></>
              ) : (
                <> · <span className="muted">{text.gainUnavailable}</span></>
              )}
            </div>
            <div className="ovb2-ministats">
              <div><span>{text.fundCount}</span><b>{fundCount}</b></div>
              <div><span>{text.pace}</span><b>{paceLabel ?? "—"}</b></div>
              <div><span>{text.nextContribution}</span><b>{daysToNext != null ? text.inDays(daysToNext) : "—"}</b></div>
              <div><span>{text.priceUpdated}</span><b>{priceDateLabel ?? "—"}{stale ? ` · ${text.stalePrice}` : ""}</b></div>
            </div>
          </section>

          {/* Chart + donut */}
          <div className="ovb2-mid">
            {valueHistory ? (
              <section className="ovb2-card ovb2-chart-card" aria-label={text.valueVsContributed}>
                <h3>{text.valueVsContributed}</h3>
                <p className="ovb2-sub">{text.honestCaption}</p>
                <div className="ovb2-legend">
                  <span><i style={{ background: "#16a34a" }} />{text.valueLine}</span>
                  <span><i className="dashed" />{text.contributedLine}</span>
                </div>
                <ValueHistoryChart points={valueHistory} label={text.valueVsContributed} />
              </section>
            ) : null}
            {allocation.length > 0 ? (
              <section className="ovb2-card ovb2-donut-card" aria-label={text.allocation}>
                <h3>{text.allocation}</h3>
                <p className="ovb2-sub">{text.allocationSub}</p>
                <AllocationDonut allocation={allocation} totalLabel={assets} totalSub={text.totalValue} />
              </section>
            ) : null}
          </div>

          {/* Holdings table — no per-fund profit comparison */}
          {allocation.length > 0 ? (
            <section className="ovb2-card ovb2-table-card" aria-label={text.portfolio}>
              <div className="ovb2-cardhead">
                <h3>📄 {text.portfolio}</h3>
                <a className="ovb2-link" href="#/transactions">{text.viewDetails}</a>
              </div>
              <table className="ovb2-tbl">
                <thead>
                  <tr>
                    <th>{text.fund}</th>
                    <th className="num">{text.currentValue}</th>
                    <th className="num">{text.weight}</th>
                    <th className="num">{text.shares}</th>
                  </tr>
                </thead>
                <tbody>
                  {allocation.map((a, i) => (
                    <tr key={a.isin}>
                      <td>
                        <div className="ovb2-fund">
                          <span className="ovb2-badge" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}>
                            {a.ticker.slice(0, 1)}
                          </span>
                          <span>
                            <span className="ovb2-fname">{a.ticker}</span><br />
                            <span className="ovb2-fsub">{a.name} ({a.isin})</span>
                          </span>
                        </div>
                      </td>
                      <td className="num"><b>{a.valueLabel}</b><small>{a.pricePerShare ?? "—"}</small></td>
                      <td className="num"><b>{a.weightPct.toFixed(1).replace(".", ",")}%</b></td>
                      <td className="num"><b>{a.shares}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {/* Attention */}
          {attentionItems.length > 0 ? (
            <section className="ovb2-card ovb2-attention" aria-label={text.attention}>
              <h3>{text.attention}</h3>
              <ul>
                {attentionItems.map((item) => (
                  <li key={item.key}>
                    {item.href ? (
                      <a href={item.href}><span>{item.label}</span><span className="ovb2-go">{text.review}</span></a>
                    ) : (
                      <span className="ovb2-static"><span>{item.label}</span></span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Year review footer */}
          <section className="ovb2-foot" aria-label={text.yearReview}>
            <div className="ovb2-foothead">
              <span className="ovb2-title">{text.yearReview}</span>
              <label>
                <select
                  aria-label={text.reviewYear}
                  value={yearInReview.year}
                  onChange={(event) => onYearReviewYearChange(Number(event.target.value))}
                >
                  {yearReviewYears.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <button type="button" className="ovb2-export" onClick={exportYearReview}>{text.yearReviewExport}</button>
            </div>
            <p className="ovb2-muted">{yearReviewDisplay}</p>
          </section>
        </div>

        <div className="ovb2-side">
          {/* Next milestone — value-based, no fixed target */}
          {milestone ? (
            <section className="ovb2-card ovb2-mile" aria-label={text.nextMilestone}>
              <h3>🎯 {text.nextMilestone}</h3>
              <p className="ovb2-sub">{text.noFixedTarget}</p>
              <div className="ovb2-bar"><i style={{ width: `${Math.min(100, Math.max(0, milestone.progressPct))}%` }} /></div>
              <div className="ovb2-row"><span>{text.milestone} <b>{milestone.targetLabel}</b></span><span>{text.reached} <b>{milestone.progressPct.toFixed(1).replace(".", ",")}%</b></span></div>
              <div className="ovb2-row muted"><span>{text.remaining}</span><span><b>{milestone.remainingLabel}</b></span></div>
            </section>
          ) : null}

          {/* Motivational */}
          <section className="ovb2-card ovb2-journey">
            <h4>🌱 {text.journeyTitle}</h4>
            <p><b>{text.journeyLine1}</b><br />{text.journeyLine2}</p>
          </section>

          {/* Recent updates */}
          {updates.length > 0 ? (
            <section className="ovb2-card ovb2-updates" aria-label={text.recentUpdates}>
              <h3>🕘 {text.recentUpdates}</h3>
              {updates.map((u) => (
                <div className="ovb2-update" key={u.key}>
                  <span className="ovb2-dot" />
                  <span><b>{u.dateLabel}</b> — {u.title}<br /><span className="ovb2-muted">{u.detail}</span></span>
                </div>
              ))}
              <a className="ovb2-link" href="#/transactions">{text.viewFullHistory}</a>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
