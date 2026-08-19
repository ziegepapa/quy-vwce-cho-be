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

  return (
    <main className="demo-v10-screen demo-v10-overview" aria-label="Tổng quan">
      <section className="demo-v10-gl demo-v10-hero">
        <div className="demo-v10-hero-flex">
          <div className="demo-v10-hero-left">
            <p className="demo-v10-eyebrow">{assetsLabel}</p>
            <div className="demo-v10-hero-value">{assets}</div>
            {pnl ? <span className={`demo-v10-pnl ${pnlPositive ? "is-up" : "is-down"}`}>{pnl}</span> : null}
          </div>
          <div className="demo-v10-ring">
            <div className="demo-v10-ring-shell">
              <svg viewBox="0 0 76 76" aria-hidden>
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
              <span className="demo-v10-ring-center">
                <strong>{months > 0 ? months : "—"}</strong>
                {months > 0 ? <em>tháng</em> : null}
              </span>
            </div>
            <small>chuỗi góp</small>
          </div>
        </div>
      </section>

      {price ? (
        <section className="demo-v10-gl demo-v10-price">
          <div className={stale ? "demo-v10-price-row is-stale" : "demo-v10-price-row"}>
            <div>
              <p className="demo-v10-eyebrow">Giá VWCE</p>
              <strong>{stale ? "~ " : ""}{price}</strong>
              <small>{priceAsOf ?? "—"}</small>
            </div>
            <div className="demo-v10-price-status">
              <span className={stale ? "is-stale" : "is-live"}>{stale ? "GIÁ CŨ" : "LIVE"}</span>
              {/* Geometry reserved; no invented sparkline path */}
              <svg viewBox="0 0 88 30" aria-hidden className="demo-v10-spark-empty" />
            </div>
          </div>
        </section>
      ) : null}

      {shares ? (
        <section className="demo-v10-gl demo-v10-combo">
          <div>
            <p className="demo-v10-eyebrow">Cổ phần</p>
            <strong>{shares}</strong>
          </div>
          <i aria-hidden />
          <div>
            <p className="demo-v10-eyebrow">Sparplan</p>
            <strong className="demo-v10-amber">—</strong>
          </div>
        </section>
      ) : null}

      {months > 0 ? (
        <section className="demo-v10-gl demo-v10-streak">
          <div className="demo-v10-streak-top">
            <div>
              <span className="demo-v10-flame">🔥</span>
              <strong>{months}</strong>
              <span> tháng liên tiếp</span>
              <small>Chuỗi góp</small>
            </div>
            <div>
              <p className="demo-v10-eyebrow">Gần nhất</p>
              <strong>{latestContribution ?? "—"}</strong>
            </div>
          </div>
        </section>
      ) : null}

      {performance ? (
        <section className="demo-v10-gl demo-v10-performance">
          <div>
            <span>Hiệu suất danh mục</span>
            <strong>{performance}</strong>
          </div>
          <div className="demo-v10-performance-bar">
            <i style={{ width: `${contributionWidth}%` }} />
            <b style={{ left: `${contributionWidth}%`, width: `${Math.max(0, 100 - contributionWidth)}%` }} />
          </div>
          <p>
            <span><i /> Vốn góp</span>
            <span><i /> Lãi</span>
          </p>
        </section>
      ) : null}
    </main>
  );
}
