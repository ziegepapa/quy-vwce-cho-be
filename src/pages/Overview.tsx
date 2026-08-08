import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getSettings,
  listGoals,
  listInstruments,
  listQuotes,
  listTransactions,
} from "../lib/db";
import type { AppSettings, Goal, Instrument, Quote, Transaction } from "../lib/types";
import { VWCE_ISIN } from "../lib/types";
import {
  buildEquitySeries,
  formatMoney,
  inflate,
  monthsBetween,
  parseDate,
} from "../lib/calc";
import { buildOverviewHero, shouldShowContributionNudge } from "../lib/overviewNumbers";
import { buildAllocationDisplay, describeAllocation } from "../lib/overviewAllocation";
import {
  buildCostBasisDisplay,
  describeCostBasis,
  describePnlSuppression,
  summarizeCostBasisLedger,
} from "../lib/overviewCostBasis";
import { buildTodayCenterPortfolioSnapshot } from "../lib/todayCenterAdapter";
import { buildPortfolioTraceModel } from "../lib/todayCenterTrace";
import {
  buildNhipInsightInput,
  buildNhipInsights,
  type NhipInsight,
} from "../lib/nhipInsights";
import TodayCenter from "../components/TodayCenter";
import TraceSheet from "../components/TraceSheet";

type Insight = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  why: string;
  cta: string;
  to: string;
};

function Sparkline({ points }: { points: { value: number }[] }) {
  if (points.length < 2) {
    return (
      <svg className="sparkline" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden>
        <path d="M0 28 Q30 20 60 24 T120 18" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    );
  }
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coordinates = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 120;
      const y = 36 - ((value - min) / span) * 28;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,40 ${coordinates} 120,40`} fill="url(#spFade)" />
      <polyline points={coordinates} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2" strokeLinejoin="round" />
      <defs>
        <linearGradient id="spFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,.25)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Overview({ refreshKey = 0 }: { displayName?: string; refreshKey?: number }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [moreActions, setMoreActions] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  // VISUAL-POLISH-001 r2: stat block collapses by default so the first
  // screenful focuses on hero + nhip only. Visible at rest; no hover needed.
  const [statStripOpen, setStatStripOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      const [nextSettings, nextGoals, nextTransactions, nextInstruments, nextQuotes] =
        await Promise.all([
          getSettings(),
          listGoals(),
          listTransactions(),
          listInstruments(),
          listQuotes(),
        ]);
      if (!active) return;
      setSettings(nextSettings);
      setGoals(nextGoals);
      setTransactions(nextTransactions);
      setInstruments(nextInstruments);
      setQuotes(nextQuotes);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const portfolioSnapshot = useMemo(
    () => buildTodayCenterPortfolioSnapshot({
      transactions,
      quotes,
      legacyVwcePrice: settings?.latestVwcePrice ?? 0,
    }),
    [transactions, quotes, settings?.latestVwcePrice],
  );
  const {
    portfolio,
    pricesByIsin,
    market,
    totalQuantity,
    vwcePrice,
    vwceQuote,
    vwcePriceSource,
  } = portfolioSnapshot;
  const series = useMemo(
    () => buildEquitySeries(transactions, pricesByIsin[VWCE_ISIN] ?? 0, pricesByIsin),
    [transactions, pricesByIsin],
  );
  // NHIP-UI-001 r1: the engine runs here because this is the only place that
  // holds both the ledger and the effective quote date.
  const nhipInsights = useMemo<NhipInsight[]>(() => {
    if (!settings) return [];
    return buildNhipInsights(
      buildNhipInsightInput(portfolioSnapshot, transactions, settings),
    ).insights;
  }, [portfolioSnapshot, transactions, settings]);

  if (loading) {
    return (
      <div className="ov">
        <div className="skeleton" style={{ height: 176, borderRadius: 22 }} />
        <div className="skeleton" style={{ height: 360, borderRadius: 24, marginTop: 16 }} />
      </div>
    );
  }

  const hasMissingPrices = !portfolioSnapshot.valueComplete;
  const securitiesKnown = market.securities;
  const cash = market.cash;
  const totalKnown = portfolioSnapshot.totalValue;
  const vwceValue = vwcePrice > 0 ? portfolio.vwceQty * vwcePrice : null;
  // CASH-MODEL-OPTIONAL-001 r1: the owner pays for the ETF from a bank or
  // broker account this app never sees, so a buy without a matching cash_in is
  // not a missing deposit unless the double-entry ledger was switched on
  // deliberately. Absent setting means securities-first.
  const trackInAppCash = settings?.trackInAppCash === true;
  const hero = buildOverviewHero({
    securitiesValue: securitiesKnown,
    cashBalance: portfolio.cashBalance,
    missingPriceCount: market.missingIsins.length,
    totalQuantity,
    costBasis: portfolio.vwceCostBasis,
    positionValue: vwceValue,
    transactionCount: transactions.length,
    trackInAppCash,
  });
  const today = new Date();
  const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  // Without this, removing the "unfunded" status would hand the screen a fresh
  // false alarm instead of removing one: in securities-first mode there is no
  // cash_in to record, so a month holding a real purchase would be reported as
  // a month without a contribution, every month, forever.
  const contributionTypes: string[] = trackInAppCash
    ? ["cash_in"]
    : ["cash_in", "buy_vwce", "buy_security"];
  const hasContributionThisMonth = transactions.some(
    (transaction) => contributionTypes.includes(transaction.type) && transaction.date.startsWith(yearMonth),
  );
  const mode: "empty" | "early" | "active" =
    hero.status === "empty"
      ? "empty"
      : transactions.length < 3
        ? "early"
        : "active";

  const insights: Insight[] = [];
  if (shouldShowContributionNudge({ status: hero.status, hasContributionThisMonth })) {
    insights.push({
      id: "contribution",
      priority: "high",
      title: "Ch\u01b0a ghi nh\u1eadn \u0111\u00f3ng g\u00f3p th\u00e1ng n\u00e0y",
      why: "Nh\u1ecbp \u0111\u00f3ng g\u00f3p \u0111\u1ec1u gi\u00fap gi\u1eef \u0111\u00fang k\u1ebf ho\u1ea1ch d\u00e0i h\u1ea1n.",
      cta: "Ghi nh\u1eadn",
      to: "/transactions",
    });
  }
  if (hasMissingPrices) {
    insights.push({
      id: "price-missing",
      priority: "high",
      title: `Thi\u1ebfu gi\u00e1 cho ${market.missingIsins.length} m\u00e3`,
      why: "T\u1ed5ng t\u00e0i s\u1ea3n ch\u01b0a \u0111\u1ea7y \u0111\u1ee7 cho \u0111\u1ebfn khi c\u00f3 gi\u00e1 t\u1eebng ISIN.",
      cta: "C\u1eadp nh\u1eadt",
      to: "/settings?tab=prices",
    });
  } else if (!vwcePrice && mode !== "empty" && portfolio.vwceQty > 0) {
    insights.push({
      id: "price",
      priority: "high",
      title: "Ch\u01b0a c\u1eadp nh\u1eadt gi\u00e1 VWCE",
      why: "S\u1ed1 li\u1ec7u t\u00e0i s\u1ea3n c\u00f3 th\u1ec3 l\u1ec7ch th\u1ef1c t\u1ebf.",
      cta: "C\u1eadp nh\u1eadt",
      to: "/settings?tab=prices",
    });
  }
  for (const goal of goals) {
    if (goal.amount <= 0) continue;
    const due = parseDate(goal.dueDate);
    const months = monthsBetween(today, due);
    const years = Math.max(0, due.getFullYear() - goal.baseYear);
    const adjusted = goal.mode === "purchasing_power"
      ? inflate(goal.amount, goal.inflationRate, years)
      : goal.amount;
    if (months <= 36 && months > 0 && goal.protectedAmount < adjusted * 0.5) {
      insights.push({
        id: `goal-${goal.id}`,
        priority: "high",
        title: `${goal.name}: ch\u1eadm ti\u1ebfn \u0111\u1ed9`,
        why: `C\u00f2n ${months} th\u00e1ng \u00b7 \u0111\u00e3 b\u1ea3o v\u1ec7 ${Math.round((goal.protectedAmount / (adjusted || 1)) * 100)}%.`,
        cta: "Xem",
        to: "/goals",
      });
    }
  }

  const cashNegative = hero.setupIncomplete;
  // DEBT_1: the ratio is taken on the same denominator the hero shows, and the
  // copy always names what it does not include yet.
  const allocation = buildAllocationDisplay(hero);
  const allocationCopy = describeAllocation(allocation);
  // DEBT_2: the cost basis names the ledger entries behind it, and a withheld
  // profit and loss names its reason instead of showing a bare dash.
  const costBasis = buildCostBasisDisplay({
    costBasis: portfolio.vwceCostBasis,
    quantity: portfolio.vwceQty,
    provenance: summarizeCostBasisLedger(transactions),
  });
  const costBasisCopy = describeCostBasis(costBasis);
  const pnlSuppression = describePnlSuppression(hero.pnlSuppressedReason, {
    missingPriceCount: market.missingIsins.length,
  });
  const pnlPct = hero.pnlPct != null ? hero.pnlPct.toFixed(1) : null;

  let nearestGoal: Goal | null = null;
  let nearestMonths = Infinity;
  let nearestTarget = 0;
  let nearestGap = 0;
  for (const goal of goals) {
    const due = parseDate(goal.dueDate);
    const months = monthsBetween(today, due);
    if (months >= 0 && months < nearestMonths) {
      nearestMonths = months;
      nearestGoal = goal;
      const years = Math.max(0, due.getFullYear() - goal.baseYear);
      nearestTarget = goal.mode === "purchasing_power"
        ? inflate(goal.amount, goal.inflationRate, years)
        : goal.amount;
      nearestGap = Math.max(0, nearestTarget - goal.protectedAmount);
    }
  }

  const primary = insights[0];
  const remainingInsights = insights.slice(1);
  const instrumentName = (isin: string) => {
    const instrument = instruments.find((candidate) => candidate.isin === isin);
    return instrument?.ticker || instrument?.name || isin;
  };
  const sourceLabel = vwcePriceSource === "manual_quote"
    ? "Tay \u0111ang th\u1eafng"
    : vwcePriceSource === "auto_quote"
      ? "Auto"
      : vwcePriceSource === "legacy_quote"
        ? "Gi\u00e1 t\u01b0\u01a1ng th\u00edch c\u0169"
        : "Ch\u01b0a c\u00f3 gi\u00e1";
  const portfolioTraceModel = buildPortfolioTraceModel({
    totalValue: hero.assets,
    securities: securitiesKnown,
    cash,
    cashNegative,
    cashShortfall: hero.cashShortfall,
    valueComplete: portfolioSnapshot.valueComplete,
    missingIsins: market.missingIsins,
    vwcePrice,
    vwceAsOf: vwceQuote?.asOf,
    provenance: portfolioSnapshot.provenance,
  });

  return (
    <div className="ov">
      <section className={`hero-v8 hero-${mode}`}>
        <div className="hero-noise" aria-hidden />
        {mode === "empty" ? (
          <div className="hero-empty-inner">
            <p className="hero-label">{"T\u1ed5ng t\u00e0i s\u1ea3n"}</p>
            <p className="hero-empty-copy">{"B\u1eaft \u0111\u1ea7u b\u1eb1ng giao d\u1ecbch \u0111\u1ea7u ti\u00ean"}</p>
            <Link to="/transactions" className="hero-cta">{"Th\u00eam giao d\u1ecbch \u0111\u1ea7u ti\u00ean"}</Link>
          </div>
        ) : (
          <>
            <button type="button" className="hero-trace-trigger" onClick={() => setTraceOpen(true)}>
              <span className="hero-label">{hasMissingPrices ? "T\u00e0i s\u1ea3n \u0111\u00e3 \u0111\u1ecbnh gi\u00e1" : "T\u1ed5ng t\u00e0i s\u1ea3n"}</span>
              <span className="hero-amount">
                <span className="hero-num">{formatMoney(hero.assets).replace(/\s*\u20ac$/, "")}</span>
                <span className="hero-eur">{"\u20ac"}</span>
              </span>
            </button>
            {hero.setupIncomplete ? (
              <span className="hero-delta">{"Ch\u01b0a ghi n\u1ea1p ti\u1ec1n "}{formatMoney(hero.cashShortfall)}</span>
            ) : hasMissingPrices ? (
              <span className="hero-delta">{"+ "}{market.missingIsins.length}{" m\u00e3 thi\u1ebfu gi\u00e1"}</span>
            ) : hero.pnl != null && hero.pnl !== 0 ? (
              <span className="hero-delta">
                {hero.pnl >= 0 ? "\u2191" : "\u2193"}{" "}{formatMoney(Math.abs(hero.pnl))}{pnlPct ? ` (${pnlPct}%)` : ""}
              </span>
            ) : null}
            <button type="button" className="hero-provenance" onClick={() => setTraceOpen(true)}>
              <span aria-hidden />
              {sourceLabel}{vwceQuote?.asOf ? ` \u00b7 ${vwceQuote.asOf}` : ""}
            </button>
            <Sparkline points={series} />
            {allocation.showBar ? (
              <>
                <div className="alloc-v8" role="img" aria-label={allocationCopy.ariaLabel}>
                  <div className="alloc-seg-v8 vwce" style={{ flex: Math.max(allocation.securitiesPct, 1) }} />
                  <div className="alloc-seg-v8 cash" style={{ flex: Math.max(allocation.cashPct, 1) }} />
                </div>
                <div className="alloc-legend-v8"><span>{allocationCopy.securitiesLabel}</span><span>{allocationCopy.cashLabel}</span></div>
                {allocationCopy.caveat ? (
                  <p className="alloc-caveat-v8">{allocationCopy.caveat}</p>
                ) : null}
              </>
            ) : (
              <div className="alloc-legend-v8"><span className="neg">{allocationCopy.unavailable}</span></div>
            )}
            {mode === "early" ? <p className="hero-early">{"C\u00f2n "}{Math.max(0, 3 - transactions.length)}{" b\u01b0\u1edbc \u0111\u1ec3 ho\u00e0n t\u1ea5t thi\u1ebft l\u1eadp"}</p> : null}
          </>
        )}
      </section>

      {/* OVERVIEW-SIMPLIFY-001: when the ledger is unfunded this is the only
          call to action on the page. Nothing competes with it.
          CASH-MODEL-OPTIONAL-001 r1: in securities-first mode setupIncomplete
          is always false, so this whole block disables itself. */}
      {cashNegative ? (
        <section className="card">
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{"S\u1ed5 \u0111ang thi\u1ebfu b\u00fat to\u00e1n n\u1ea1p ti\u1ec1n"}</p>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.45 }}>{"\u0110\u00e3 ghi mua ho\u1eb7c chi nhi\u1ec1u h\u01a1n s\u1ed1 ti\u1ec1n n\u1ea1p "}{formatMoney(hero.cashShortfall)}{"\u002c n\u00ean s\u1ed1 d\u01b0 an to\u00e0n \u0111ang \u00e2m. Ghi kho\u1ea3n n\u1ea1p t\u01b0\u01a1ng \u1ee9ng \u0111\u1ec3 t\u1ed5ng t\u00e0i s\u1ea3n v\u00e0 l\u00e3i\u2013l\u1ed7 kh\u1edbp l\u1ea1i."}</p>
          <Link to="/transactions" className="action-item" style={{ minHeight: 44 }}>{"Ghi n\u1ea1p ti\u1ec1n"}</Link>
        </section>
      ) : null}

      {nearestGoal && !cashNegative ? (
        <Link to="/goals" className="pulse-goal-line">
          <span className="pulse-goal-label">{"M\u1ed1c k\u1ebf ti\u1ebfp"}</span>
          <strong>{nearestGoal.name}</strong>
          <span className="pulse-goal-meta">{"C\u00f2n "}{formatMoney(nearestGap)}{" \u00b7 "}{nearestMonths}{" th\u00e1ng"}</span>
          <span aria-hidden>{"\u203a"}</span>
        </Link>
      ) : null}

      {settings ? (
        <TodayCenter
          totalValue={totalKnown}
          totalQuantity={totalQuantity}
          valueComplete={portfolioSnapshot.valueComplete}
          vwcePrice={vwcePrice}
          vwcePriceSource={vwcePriceSource}
          settings={settings}
          transactions={transactions}
          insights={nhipInsights}
        />
      ) : null}

      {mode !== "empty" ? (
        <section className="stat-strip" aria-label={"Chi ti\u1ebft ph\u00e2n b\u1ed5"}>
          {/* VISUAL-POLISH-001 r2: entire stat block defaults to collapsed so
              the first screenful is hero + nhip only. Visible at rest. */}
          <button
            type="button"
            className="stat-detail-btn"
            onClick={() => setStatStripOpen((open) => !open)}
            aria-expanded={statStripOpen}
          >
            {"S\u1ed1 li\u1ec7u "}{statStripOpen ? "\u25b4" : "\u25be"}
          </button>
          {statStripOpen ? (
            <>
              <div className="stat-col"><span className="stat-label">{"CK \u0111\u00e3 \u0111\u1ecbnh gi\u00e1"}</span><span className="stat-val">{formatMoney(securitiesKnown)}</span></div>
              <div className="stat-rule" aria-hidden />
              <div className="stat-col">
                <span className="stat-label">{"An to\u00e0n"}</span>
                {trackInAppCash ? (
                  <span className={`stat-val${cashNegative ? " neg" : ""}`}>{formatMoney(portfolio.cashBalance)}</span>
                ) : (
                  <>
                    {/* The column keeps its grid slot on purpose: .stat-strip is a
                        five-track grid. A neutral dash beats "0 \u20ac", which would be
                        a claim about a wallet this mode does not maintain. */}
                    <span className="stat-val">{"\u2014"}</span>
                    <span className="stat-label" style={{ fontSize: 11, opacity: 0.85 }}>{"Kh\u00f4ng theo d\u00f5i v\u00ed trong app"}</span>
                  </>
                )}
              </div>
              <div className="stat-rule" aria-hidden />
              <div className="stat-col">
                <span className="stat-label">{"L\u00e3i\u2013l\u1ed7 VWCE"}</span>
                <span className={`stat-val ${hero.pnl == null ? "" : hero.pnl >= 0 ? "pos" : "neg"}`}>{hero.pnl != null ? formatMoney(hero.pnl) : "\u2014"}</span>
                {hero.pnl == null && pnlSuppression ? (
                  <span className="stat-label" style={{ fontSize: 11, opacity: 0.85 }}>{pnlSuppression}</span>
                ) : null}
              </div>
              <button type="button" className="stat-detail-btn" onClick={() => setDetailOpen((open) => !open)} aria-expanded={detailOpen}>
                {"Chi ti\u1ebft "}{detailOpen ? "\u25b4" : "\u25be"}
              </button>
              {detailOpen ? (
                <dl className="stat-detail-list">
                  {Object.entries(market.byIsin).map(([isin, row]) => (
                    <div key={isin}>
                      <dt>{instrumentName(isin)}<span className="muted" style={{ display: "block", fontSize: 11 }}>{isin}</span></dt>
                      <dd>{row.qty.toFixed(4)}{" \u00d7 "}{row.price != null ? formatMoney(row.price) : <span style={{ color: "var(--warning-600)" }}>{"Thi\u1ebfu gi\u00e1"}</span>}{row.value != null ? ` = ${formatMoney(row.value)}` : ""}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>{"Gi\u00e1 v\u1ed1n TB VWCE"}{costBasisCopy.provenance ? <span className="muted" style={{ display: "block", fontSize: 11 }}>{costBasisCopy.provenance}</span> : null}</dt>
                    <dd>{costBasis.avgCost != null ? formatMoney(costBasis.avgCost) : <span className="muted">{costBasisCopy.value}</span>}</dd>
                  </div>
                  <div><dt>{"V\u1ed1n \u0111\u00e3 \u0111\u00f3ng"}</dt><dd>{formatMoney(portfolio.totalContributed)}</dd></div>
                  <div><dt>{"\u0110\u00e3 r\u00fat"}</dt><dd>{formatMoney(portfolio.totalWithdrawn)}</dd></div>
                  <div><dt>{"Ph\u00ed + thu\u1ebf"}</dt><dd>{formatMoney(portfolio.totalFees + portfolio.totalTax)}</dd></div>
                </dl>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {primary && !cashNegative ? (
        <section className="action-stack">
          <Link to={primary.to} className="action-item">
            <div className={`action-icon pri-${primary.priority}`} aria-hidden>!</div>
            <div className="action-body"><p className="action-title">{primary.title}</p><p className="action-why">{primary.why}</p><span className="action-cta">{primary.cta}{" \u2192"}</span></div>
          </Link>
          {remainingInsights.length > 0 ? (
            <>
              <button type="button" className="action-more" onClick={() => setMoreActions((open) => !open)}>{moreActions ? "Thu g\u1ecdn" : `+${remainingInsights.length} vi\u1ec7c kh\u00e1c`}</button>
              {moreActions ? remainingInsights.map((insight) => (
                <Link key={insight.id} to={insight.to} className="action-item action-item-sm">
                  <div className={`action-icon pri-${insight.priority}`} aria-hidden>i</div>
                  <div className="action-body"><p className="action-title">{insight.title}</p><span className="action-cta">{insight.cta}{" \u2192"}</span></div>
                </Link>
              )) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <p className="ov-foot">{"Kh\u00f4ng ph\u1ea3i t\u01b0 v\u1ea5n \u0111\u1ea7u t\u01b0. What-if l\u00e0 \u01b0\u1edbc t\u00ednh; giao d\u1ecbch v\u1eabn l\u1ea5y t\u1eeb s\u1ed5 local."}</p>

      <TraceSheet
        open={traceOpen}
        onClose={() => setTraceOpen(false)}
        model={portfolioTraceModel}
      />
    </div>
  );
}
