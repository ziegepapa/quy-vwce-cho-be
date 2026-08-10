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
  readPortfolioPulse,
  recordPortfolioPulse,
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
 * Overview now keeps one compact pulse and one ownership journal. The old
 * Sao kê / An toàn / Mô phỏng shortcut rows repeated destinations already
 * present in the primary navigation and made the home screen read like a
 * second menu. Their underlying pages, data and calculations are untouched.
 */
export default function TodayCenter({
  totalValue,
  totalQuantity,
  valueComplete,
  transactions,
  insights = [],
}: Props) {
  const auth = useAuth();
  const ownerKey = auth.user?.id ?? "local";
  const [pulse, setPulse] = useState<PortfolioPulseState | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  useEffect(() => {
    const current = valueComplete
      ? recordPortfolioPulse(ownerKey, {
          capturedAt: new Date().toISOString(),
          totalValue,
          totalQuantity,
        })
      : readPortfolioPulse(ownerKey);
    setPulse(current);
  }, [ownerKey, totalQuantity, totalValue, valueComplete]);

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
    delta && (Math.abs(delta.value) > 0.005 || Math.abs(delta.quantity) > 0.000001),
  );

  const deltaValue = !valueComplete
    ? "Đang chờ đủ giá"
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
    : delta
      ? `${deltaPercent} · ${deltaQuantity}`
      : "Lần mở tiếp theo sẽ hiện thay đổi.";

  const pulseTraceModel = buildPulseTraceModel({
    valueComplete,
    totalValue,
    totalQuantity,
    delta,
  });

  return (
    <>
      <section
        className="today-center"
        {...(showNhipCopy
          ? { "aria-labelledby": "today-center-title" }
          : { "aria-label": "Nhịp Quỹ" })}
      >
        {showNhipCopy ? (
          <header className="today-center-head">
            <h2 id="today-center-title">Nhịp Quỹ</h2>
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

          <button
            type="button"
            className="nhip-meta"
            onClick={() => setTraceOpen(true)}
            aria-label={`Thay đổi từ lần mở trước: ${deltaValue}. Xem nguồn dữ liệu`}
          >
            <span
              className={`nhip-meta-value ${valueComplete && delta ? metricTone(delta.value) : "neutral"}`}
            >
              {deltaValue}
            </span>
            {pulseChanged ? <span className="nhip-new">Mới</span> : null}
            <span className="nhip-meta-caption">{deltaCaption}</span>
            <span className="nhip-meta-hint">Xem nguồn</span>
          </button>
        </div>

        <TraceSheet
          open={traceOpen}
          onClose={() => setTraceOpen(false)}
          model={pulseTraceModel}
        />
      </section>

      <RecentTransactions transactions={transactions} />
    </>
  );
}
