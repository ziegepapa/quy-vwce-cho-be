import "../../styles/demo-v10-overview.css";

type OverviewFrameProps = {
  assetsLabel: string;
  assets: string;
  pnl: string | null;
  pnlPositive: boolean;
  ringLabel: string;
  ringPct: number;
  price: string | null;
  priceAsOf: string | null;
  stale: boolean;
  shares: string | null;
  streakMonths: number | null;
  latestContribution: string | null;
  performance: string | null;
  contributionWidth: number;
};

export default function OverviewFrame({
  assetsLabel,
  assets,
  pnl,
  pnlPositive,
  ringLabel,
  ringPct,
  price,
  priceAsOf,
  stale,
  shares,
  streakMonths,
  latestContribution,
  performance,
  contributionWidth,
}: OverviewFrameProps) {
  const safePct = Math.max(0, Math.min(100, ringPct));
  const circumference = 2 * Math.PI * 30;
  const dash = circumference * safePct / 100;

  return (
    <main className="demo-v10-screen demo-v10-overview" aria-label="Tổng quan">
      <section className="demo-v10-gl demo-v10-hero">
        <div className="demo-v10-hero-flex">
          <div className="demo-v10-hero-left">
            <p className="demo-v10-eyebrow">{assetsLabel}</p>
            <button type="button" className="demo-v10-hero-value" aria-label="Mở chi tiết tài sản">{assets}</button>
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
                <circle cx="38" cy="38" r="30" fill="none" stroke="url(#overview-ring-gradient)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`} transform="rotate(-90 38 38)" />
              </svg>
              <span>{Math.round(safePct)}%</span>
            </div>
            <small>{ringLabel}</small>
          </div>
        </div>
      </section>

      {price ? <section className="demo-v10-gl demo-v10-price">
        <div className={stale ? "demo-v10-price-row is-stale" : "demo-v10-price-row"}>
          <div>
            <p className="demo-v10-eyebrow">Giá VWCE</p>
            <strong>{stale ? "~ " : ""}{price}</strong>
            <small>{priceAsOf ?? "Chưa có ngày phiên"}</small>
          </div>
          <div className="demo-v10-price-status">
            <span className={stale ? "is-stale" : "is-live"}>{stale ? "GIÁ CŨ" : "LIVE"}</span>
            <svg viewBox="0 0 88 30" aria-hidden><path d="M2 25 L16 22 L28 18 L42 15 L56 9 L70 5 L86 2" fill="none" stroke="var(--demo-em)" strokeWidth="2" strokeLinecap="round" /></svg>
          </div>
        </div>
      </section> : null}

      {shares ? <section className="demo-v10-gl demo-v10-combo">
        <div><p className="demo-v10-eyebrow">Cổ phần</p><strong>{shares}</strong></div>
        <i aria-hidden />
        <div><p className="demo-v10-eyebrow">Sparplan</p><strong className="demo-v10-amber">—</strong></div>
      </section> : null}

      {streakMonths ? <section className="demo-v10-gl demo-v10-streak">
        <div className="demo-v10-streak-top"><div><span className="demo-v10-flame">🔥</span><strong>{streakMonths}</strong><span> tháng liên tiếp</span><small>Chuỗi Sparplan</small></div><div><p className="demo-v10-eyebrow">Gần nhất</p><strong>{latestContribution ?? "—"}</strong></div></div>
        <div className="demo-v10-dots">{Array.from({ length: 18 }, (_, index) => <i key={index} className={index < streakMonths ? "is-done" : index === streakMonths ? "is-current" : ""} />)}</div>
      </section> : null}

      {performance ? <section className="demo-v10-gl demo-v10-performance">
        <div><span>Hiệu suất danh mục</span><strong>{performance}</strong></div>
        <div className="demo-v10-performance-bar"><i style={{ width: `${contributionWidth}%` }} /><b style={{ left: `${contributionWidth}%` }} /></div>
        <p><span><i /> Vốn góp</span><span><i /> Lãi</span></p>
        <button type="button">Chi tiết ›</button>
      </section> : null}
    </main>
  );
}
