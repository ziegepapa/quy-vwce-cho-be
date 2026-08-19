import "../../styles/demo-v10-overview.css";

type OverviewFrameProps = {
  assetsLabel: string;
  assets: string;
  pnl: string | null;
  pnlPositive: boolean;
  streakMonths: number;
  price: string | null;
  priceAsOf: string | null;
  stale: boolean;
  shares: string | null;
  latestContribution: string | null;
  performance: string | null;
  contributionWidth: number;
};

export default function OverviewFrame({
  assetsLabel,
  assets,
  pnl,
  pnlPositive,
  streakMonths,
  price,
  priceAsOf,
  stale,
  shares,
  latestContribution,
  performance,
  contributionWidth,
}: OverviewFrameProps) {
  const months = Math.max(0, streakMonths);
  const circumference = 2 * Math.PI * 30;
  const dash = circumference * Math.min(1, months / 24);
  const dotCount = Math.min(12, Math.max(1, months));

  return (
    <main className="demo-v10-screen" aria-label="Tổng quan">
      <div className="ov">
        <section className="gl hero">
          <div className="hero-flex">
            <div className="hero-left">
              <div className="h-eye">{assetsLabel}</div>
              <div className="h-num">{assets}</div>
              <div className="h-row">
                <span className={`bdg ${pnlPositive ? "bdg-up" : "bdg-down"}`}>{pnl ?? "—"}</span>
              </div>
            </div>
            <div className="hero-ring">
              <div className="hr-shell">
                <div className="hr-pulse" aria-hidden />
                <svg className="hr-svg" viewBox="0 0 76 76" aria-hidden>
                  <defs>
                    <linearGradient id="overview-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="var(--demo-vi)" />
                      <stop offset="100%" stopColor="var(--demo-em)" />
                    </linearGradient>
                  </defs>
                  <circle cx="38" cy="38" r="30" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="7" />
                  <circle
                    cx="38"
                    cy="38"
                    r="30"
                    fill="none"
                    stroke="url(#overview-ring-gradient)"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circumference}`}
                    transform="rotate(-90 38 38)"
                  />
                </svg>
                <div className="hr-center">
                  <div className="hr-pct">{months || "—"}</div>
                </div>
              </div>
              <div className="hr-cap">tháng góp</div>
            </div>
          </div>
        </section>

        <section className="gl">
          <div className={`price-row${stale ? " stale" : ""}`}>
            <div className="pr-left">
              <div className="pr-label">Giá VWCE</div>
              <div className="pr-num">
                {stale ? <span className="pr-tilde show">~</span> : null}
                <span className="pr-cur">€</span>
                <span className={`pr-big${price ? "" : " dim"}`}>{price ? price.replace(/^€/, "") : "—"}</span>
              </div>
              <div className="pr-ts">{priceAsOf ?? "—"}</div>
            </div>
            <div className="pr-right">
              <span className={`pr-pill ${stale ? "old" : "live"}`}>
                <span className={stale ? "da" : "dl"} />
                {stale ? "GIÁ CŨ" : price ? "LIVE" : "—"}
              </span>
              <svg className="sparkline-svg" viewBox="0 0 88 30" preserveAspectRatio="none" aria-label="Lịch sử giá chưa đủ dữ liệu" />
            </div>
          </div>
        </section>

        <section className="gl combo-row">
          <div className="cr-item">
            <div className="cr-lbl">Cổ phần</div>
            <div className="cr-val cr-em">{shares ?? "—"}</div>
          </div>
          <div className="cr-div" aria-hidden />
          <div className="cr-item">
            <div className="cr-lbl">Sparplan</div>
            <div className="cr-val cr-am">—</div>
          </div>
        </section>

        <section className="gl streak-card">
          <div className="sc-top">
            <div className="sc-left">
              <span className="sc-flame" aria-hidden>🔥</span>
              <div>
                <div className="sc-count-row">
                  <span className="sc-count">{months || "—"}</span>
                  <span className="sc-unit">tháng liên tiếp</span>
                </div>
                <div className="sc-title">Chuỗi góp</div>
              </div>
            </div>
            <div className="sc-right">
              <div className="sc-next-lbl">Gần nhất</div>
              <div className="sc-next-date">{latestContribution ?? "—"}</div>
            </div>
          </div>
          <div className="sc-dots" aria-label={`${months} tháng góp liên tiếp`}>
            {Array.from({ length: dotCount }, (_, index) => (
              <span key={index} className={months > 0 ? "dot done" : "dot"} />
            ))}
          </div>
        </section>

        <section className="gl perf-card">
          <div className="perf-top">
            <span className="perf-title">Hiệu suất danh mục</span>
            <span className="perf-return">{performance ?? "—"}</span>
          </div>
          <div className="perf-bar-track" aria-hidden>
            <div className="perf-bar-base" style={{ width: `${contributionWidth}%` }} />
            <div className="perf-bar-gain" style={{ left: `${contributionWidth}%`, width: `${Math.max(0, 100 - contributionWidth)}%` }} />
          </div>
          <div className="perf-legend">
            <div className="pl-item"><span className="pl-dot base" /><span className="pl-txt">Vốn góp</span></div>
            <div className="pl-item"><span className="pl-dot gain" /><span className="pl-txt">Lãi</span></div>
          </div>
        </section>
      </div>
    </main>
  );
}
