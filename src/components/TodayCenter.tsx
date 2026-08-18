import { useEffect, useMemo, useState } from "react";
import "../styles/today-center.css";
import "../styles/pulse-polish.css";
import "../styles/nhip-block.css";
import { useAuth } from "../lib/auth";
import { formatMoney } from "../lib/calc";
import { buildPulseDisplay } from "../lib/overviewNumbers";
import type { NhipInsight, NhipInsightKind } from "../lib/nhipInsights";
import {
  portfolioPulseDelta,
  recordEligiblePortfolioPulse,
  type PortfolioPulseState,
} from "../lib/todayCenter";
import type { TodayCenterPriceSource } from "../lib/todayCenterAdapter";
import { buildPulseTraceModel } from "../lib/todayCenterTrace";
import type { AppSettings, Transaction } from "../lib/types";
import RecentTransactions from "./RecentTransactions";
import TraceSheet from "./TraceSheet";

const HERO_OWNED_KINDS: ReadonlySet<NhipInsightKind> = new Set<NhipInsightKind>([
  "on_track",
]);

type Props = {
  totalValue: number;
  totalQuantity: number;
  valueComplete: boolean;
  pulseEligible: boolean;
  stalePriceIsins: string[];
  vwcePrice: number;
  vwcePriceSource?: TodayCenterPriceSource;
  settings: AppSettings;
  transactions: Transaction[];
  insights?: NhipInsight[];
};

function signedMoney(value: number): string {
  if (Math.abs(value) < 0.005) return formatMoney(0);
  return `${value > 0 ? "+" : "−"}${formatMoney(Math.abs(value))}`;
}

function metricTone(value: number): "positive" | "negative" | "neutral" {
  if (value > 0.005) return "positive";
  if (value < -0.005) return "negative";
  return "neutral";
}

/**
 * Overview keeps one meaningful status signal and one ownership journal.
 * An unchanged, fully-valued pulse is intentionally silent: rendering
 * “0,00 € / +0%” adds chrome without information and repeats the calm state
 * already carried by the streak hero.
 */
export default function TodayCenter({
  totalValue,
  totalQuantity,
  valueComplete,
  pulseEligible,
  stalePriceIsins,
  transactions,
  insights = [],
}: Props) {
  const auth = useAuth();
  const ownerKey = auth.user?.id ?? "local";
  const [pulse, setPulse] = useState<PortfolioPulseState | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const hasStalePrices = stalePriceIsins.length > 0;
  const valuationReliable = valueComplete && pulseEligible && !hasStalePrices;

  useEffect(() => {
    const current = recordEligiblePortfolioPulse(ownerKey, {
      capturedAt: new Date().toISOString(),
      totalValue,
      totalQuantity,
    }, valuationReliable);
    setPulse(current);
  }, [ownerKey, totalQuantity, totalValue, valuationReliable]);

  const visibleInsights = useMemo(
    () => insights.filter((insight) => !HERO_OWNED_KINDS.has(insight.kind)),
    [insights],
  );
  const showNhipCopy = visibleInsights.length > 0;
  const delta = useMemo(() => portfolioPulseDelta(pulse), [pulse]);
  const pulseDisplay = useMemo(
    () => buildPulseDisplay(delta, { baselineValue: pulse?.previous?.totalValue ?? null }),
    [delta, pulse],
  );
  const pulseChanged = Boolean(
    valuationReliable
    && delta
    && (Math.abs(delta.value) > 0.005 || Math.abs(delta.quantity) > 0.000001),
  );
  /* First baseline ("Mốc đầu tiên") is not a real delta — omit the row so
   * it does not become a competing card under the money stage (demo hierarchy).
   * Unreliable valuation or a real change still surfaces. */
  const showPulseSignal = !valuationReliable || pulseChanged;
  const showNhipSection = showNhipCopy || showPulseSignal;

  const deltaValue = !valueComplete
    ? "Đang chờ đủ giá"
    : hasStalePrices
      ? "Đang chờ giá mới"
      : delta
        ? signedMoney(delta.value)
        : "Mốc đầu tiên";
  const deltaPercent =
    pulseDisplay.showPercent && pulseDisplay.percent !== null
      ? `${pulseDisplay.percent >= 0 ? "+" : ""}${pulseDisplay.percent.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`
      : pulseDisplay.basis === "ledger_changed"
        ? "Sổ đổi giữa hai lần mở nên không tính %"
        : "Mốc trước chưa đủ để tính %";
  const deltaQuantity =
    delta && Math.abs(delta.quantity) > 0.000001
      ? `${delta.quantity > 0 ? "+" : ""}${delta.quantity.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} đơn vị`
      : "số lượng không đổi";
  const deltaCaption = !valueComplete
    ? "Không ghi mốc khi còn thiếu giá."
    : hasStalePrices
      ? `Không ghi mốc khi ${stalePriceIsins.length} mã đang dùng giá cũ.`
      : delta
        ? `${deltaPercent} · ${deltaQuantity}`
        : "Lần mở tiếp theo sẽ hiện thay đổi.";

  const pulseTraceModel = buildPulseTraceModel({
    valueComplete: valuationReliable,
    totalValue,
    totalQuantity,
    delta,
  });

  return (
    <>
      {showNhipSection ? (
        <section
          className="today-center"
          {...(showNhipCopy
            ? { "aria-labelledby": "today-center-title" }
            : { "aria-label": "Trạng thái danh mục" })}
        >
          {showNhipCopy ? (
            <header className="today-center-head">
              <h2 id="today-center-title">Trạng thái</h2>
            </header>
          ) : null}

          <div className="nhip-block">
            {showNhipCopy ? (
              <ul className="nhip-list">
                {visibleInsights.map((insight) => (
                  <li key={insight.kind} className={`nhip-item nhip-${insight.kind}`}>
                    {insight.text}
                  </li>
                ))}
              </ul>
            ) : null}

            {showPulseSignal ? (
              <button
                type="button"
                className="nhip-meta"
                onClick={() => setTraceOpen(true)}
                aria-label={`Thay đổi từ lần mở trước: ${deltaValue}. Xem nguồn dữ liệu`}
              >
                <span
                  className={`nhip-meta-value ${valuationReliable && delta ? metricTone(delta.value) : "neutral"}`}
                >
                  {deltaValue}
                </span>
                {pulseChanged ? <span className="nhip-new">Mới</span> : null}
                <span className="nhip-meta-caption">{deltaCaption}</span>
                <span className="nhip-meta-hint">Xem nguồn</span>
              </button>
            ) : null}
          </div>

          <TraceSheet
            open={traceOpen}
            onClose={() => setTraceOpen(false)}
            model={pulseTraceModel}
          />
        </section>
      ) : null}

      <RecentTransactions transactions={transactions} />
    </>
  );
}
