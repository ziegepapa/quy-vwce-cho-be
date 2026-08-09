import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/today-center.css";
import "../styles/pulse-polish.css";
import "../styles/nhip-block.css";
import { useAuth } from "../lib/auth";
import { db } from "../lib/db";
import { formatMoney, parseDecimal } from "../lib/calc";
import { listDepotStatements } from "../lib/depotStatements";
import {
  buildDepotReconciliation,
  describeDepotReconciliation,
  type DepotReconciliationDisplay,
} from "../lib/depotReconciliation";
import { buildPulseDisplay } from "../lib/overviewNumbers";
import { isLedgerEmpty, type NhipInsight, type NhipInsightKind } from "../lib/nhipInsights";
import {
  markRestoreCompleted,
  portfolioPulseDelta,
  readPortfolioPulse,
  readRestoreCompleted,
  recordPortfolioPulse,
  type PortfolioPulseState,
} from "../lib/todayCenter";
import {
  buildTodayCenterSafety,
  buildTodayCenterWhatIf,
} from "../lib/todayCenterEngine";
import type { TodayCenterPriceSource } from "../lib/todayCenterAdapter";
import {
  buildPulseTraceModel,
  buildSafetyTraceModel,
  buildWhatIfTraceModel,
  type SafetyTraceDisplayItem,
} from "../lib/todayCenterTrace";
import type { AppSettings, Transaction } from "../lib/types";
import TraceSheet from "./TraceSheet";

/**
 * OVERVIEW-RHYTHM-001 r4 -- insight kinds the hero already says out loud.
 *
 * RhythmHero prints "Bạn đã góp X € trong 35 ngày qua" from the very same
 * window, and its ring already communicates "the rhythm is holding" without
 * words. `on_track` therefore adds nothing here except a second reading of
 * one fact, one line apart -- exactly the duplication r4 is closing.
 *
 * This is a RENDER filter, not an engine change. buildNhipInsights keeps
 * emitting on_track for every other caller and for the tests; this surface
 * simply declines to draw it.
 *
 * Everything not listed here survives, because none of it is in the hero:
 *   stale_price          -- the VWCE quote is N days old (PRICE-FRESHNESS-UI-001)
 *   days_to_goal         -- N days left to the plan milestone
 *   empty_start          -- the fund has not started yet
 *   contribution_rhythm  -- the 35-day window is EMPTY, i.e. the rhythm broke
 *
 * Note the asymmetry that makes this safe: the rhythm branch of the engine is
 * exclusive. It emits on_track when the window has contributions and
 * contribution_rhythm when it has none. Dropping on_track can therefore never
 * swallow a warning -- the only kind removed is the reassuring one.
 */
const HERO_OWNED_KINDS: ReadonlySet<NhipInsightKind> = new Set<NhipInsightKind>([
  "on_track",
]);

type SafetySnapshot = {
  backupAt: string;
  restoreAt: string;
  offlineReady: boolean;
};

type Props = {
  totalValue: number;
  totalQuantity: number;
  valueComplete: boolean;
  vwcePrice: number;
  vwcePriceSource?: TodayCenterPriceSource;
  settings: AppSettings;
  transactions: Transaction[];
  /**
   * NHIP-UI-001 r1 — deterministic sentences from buildNhipInsights, built in
   * Overview where the full portfolio snapshot (and the quote date) lives.
   */
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

export default function TodayCenter({
  totalValue,
  totalQuantity,
  valueComplete,
  vwcePrice,
  vwcePriceSource,
  settings,
  transactions,
  insights = [],
}: Props) {
  const auth = useAuth();
  const ownerKey = auth.user?.id ?? "local";
  const [pulse, setPulse] = useState<PortfolioPulseState | null>(null);
  const [reconciliation, setReconciliation] = useState<DepotReconciliationDisplay | null>(null);
  const [reconciliationLoaded, setReconciliationLoaded] = useState(false);
  const [safety, setSafety] = useState<SafetySnapshot>({
    backupAt: "",
    restoreAt: "",
    offlineReady: false,
  });
  const [whatIfAmount, setWhatIfAmount] = useState(() =>
    String(Math.max(50, Math.round(settings.contributionY1 || 100))),
  );
  const [traceOpen, setTraceOpen] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);

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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const registrationPromise =
          "serviceWorker" in navigator
            ? navigator.serviceWorker.getRegistration().catch(() => undefined)
            : Promise.resolve(undefined);
        const [statements, metadata, registration] = await Promise.all([
          listDepotStatements(),
          db.appMetadata.get("meta"),
          registrationPromise,
        ]);
        if (!active) return;

        const latest = statements[0];
        setReconciliation(
          buildDepotReconciliation({
            statement: latest ? { date: latest.date, positions: latest.positions } : null,
            transactions,
            today: new Date().toISOString().slice(0, 10),
          }),
        );
        setSafety({
          backupAt: metadata?.lastBackupAt ?? "",
          restoreAt: readRestoreCompleted(ownerKey),
          offlineReady: Boolean(navigator.serviceWorker?.controller || registration?.active),
        });
      } finally {
        if (active) setReconciliationLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [ownerKey, transactions]);

  // OVERVIEW-RHYTHM-001 r4 -- drop the kinds the hero already owns. When the
  // fund is simply on track this leaves an empty array, and the heading plus
  // the sentence list are both skipped below.
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
  const portfolioEmpty = isLedgerEmpty({ transactions, totalValue, totalQuantity });
  const parsedAmount = parseDecimal(whatIfAmount);
  const rawYears = Math.max(
    0,
    (Number(settings.endDate.slice(0, 4)) || new Date().getFullYear()) -
      new Date().getFullYear(),
  );
  const resolvedPriceSource = vwcePriceSource ?? (vwcePrice > 0 ? "auto_quote" : "missing");
  const whatIf = buildTodayCenterWhatIf({
    amount: parsedAmount,
    vwcePrice,
    priceSource: resolvedPriceSource,
    years: rawYears,
    annualReturn: settings.vwceReturn,
    inflation: settings.inflationRate,
  });
  const amount = whatIf.amount;
  const years = whatIf.years;
  const extraUnits = whatIf.extraUnits ?? 0;
  const futureReal = whatIf.futureReal;

  const safetyAssessment = buildTodayCenterSafety({
    backupAt: safety.backupAt,
    restoreAt: safety.restoreAt,
    offlineReady: safety.offlineReady,
    lastPrintedAt: settings.notfallmappe?.lastPrintedAt,
  });
  const isSafetyReady = (key: "backup" | "restore" | "offline" | "print") =>
    safetyAssessment.items.some((item) => item.key === key && item.ready);
  const backupAge = safetyAssessment.backupAgeDays;
  const backupReady = isSafetyReady("backup");
  const restoreReady = isSafetyReady("restore");
  const printedReady = isSafetyReady("print");
  const safetyItems: SafetyTraceDisplayItem[] = [
    {
      key: "backup",
      name: "Backup",
      ready: backupReady,
      label: backupReady
        ? `Backup ${backupAge === 0 ? "hôm nay" : `${backupAge} ngày trước`}`
        : safety.backupAt
          ? "Backup đã quá 30 ngày"
          : "Chưa có backup",
    },
    {
      key: "restore",
      name: "Khôi phục",
      ready: restoreReady,
      label: restoreReady ? "Đã thử khôi phục" : "Chưa thử khôi phục",
    },
    {
      key: "offline",
      name: "Offline",
      ready: isSafetyReady("offline"),
      label: isSafetyReady("offline") ? "PWA sẵn sàng offline" : "Chưa xác nhận PWA offline",
    },
    {
      key: "print",
      name: "Hồ sơ",
      ready: printedReady,
      label: printedReady ? "Hồ sơ khẩn cấp đã in" : "Chưa in hồ sơ khẩn cấp",
    },
  ];
  const safetyScore = safetyAssessment.score;
  const highestRisk = safetyItems.find((item) => !item.ready);
  const pulseChanged = Boolean(
    delta && (Math.abs(delta.value) > 0.005 || Math.abs(delta.quantity) > 0.000001),
  );

  // DEBT_3: the reconciliation states the statement date, its age, and the gap
  // in units and in money at the price printed on the statement. Read-only.
  const reconciliationCopy = reconciliation ? describeDepotReconciliation(reconciliation) : null;
  const reconciliationValue = !reconciliationLoaded
    ? "Đang kiểm tra"
    : (reconciliationCopy?.headline ?? "Chưa có sao kê");
  const reconciliationTone =
    reconciliation?.status === "has_gap"
      ? "warning"
      : reconciliation?.status === "all_match"
        ? "positive"
        : "neutral";
  const reconciliationGapMoney =
    reconciliation && reconciliation.totalMoneyGap != null &&
    Math.abs(reconciliation.totalMoneyGap) >= 0.005
      ? `${reconciliation.moneyGapComplete ? "≈" : "≥"} ${formatMoney(Math.abs(reconciliation.totalMoneyGap))} theo giá trên sao kê`
      : "";
  const reconciliationDetail =
    [reconciliationCopy?.dateLabel, reconciliationCopy?.detail, reconciliationGapMoney]
      .filter((part): part is string => Boolean(part))
      .join(" · ") || "Nhập PDF để tạo mốc đối chiếu.";

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

  const extraUnitsText = extraUnits.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
  const whatIfValue = whatIf.status === "ready"
    ? `+${extraUnitsText} VWCE`
    : whatIf.status === "missing_price"
      ? "Cần giá VWCE"
      : "Nhập khoản thử";
  const whatIfCardValue = portfolioEmpty && whatIf.status === "ready"
    ? `≈ ${extraUnitsText} VWCE`
    : whatIfValue;
  const whatIfCaption = whatIf.status === "ready"
    ? portfolioEmpty
      ? `Thử ${formatMoney(amount)} theo giá hiện tại · không phải số dư.`
      : `Thử ${formatMoney(amount)} · ${formatMoney(futureReal)} sức mua sau ${years} năm.`
    : whatIf.status === "missing_price"
      ? "Cần giá hợp lệ để quy đổi."
      : "Nhập khoản lớn hơn 0 để mô phỏng.";

  const pulseTraceModel = buildPulseTraceModel({
    valueComplete,
    totalValue,
    totalQuantity,
    delta,
  });
  const whatIfTraceModel = buildWhatIfTraceModel({
    result: whatIf,
    portfolioEmpty,
  });
  const safetyTraceModel = buildSafetyTraceModel({
    assessment: safetyAssessment,
    items: safetyItems,
  });

  function confirmRestore() {
    if (!window.confirm("Chỉ đánh dấu sau khi bạn đã thử nhập một bản backup và kiểm tra số liệu. Đã hoàn tất?")) return;
    const completedAt = new Date().toISOString();
    markRestoreCompleted(ownerKey, completedAt);
    setSafety((current) => ({ ...current, restoreAt: completedAt }));
  }

  return (
    <section
      className="today-center"
      {...(showNhipCopy
        ? { "aria-labelledby": "today-center-title" }
        : { "aria-label": "Nhịp Quỹ" })}
    >
      {/* OVERVIEW-MONO-001 r1 — the kicker "Một khối · điều đáng nói hôm nay"
          was a label about the block, not information from the ledger, and it
          sat above a heading that already says what the block is. Removed; the
          heading and the sentences below it stay exactly as they were.

          OVERVIEW-RHYTHM-001 r4 — the heading itself is now conditional. A
          standing section title with nothing under it but a delta button is
          furniture, and on the on-track screen the only thing it introduced
          was a sentence the hero had already said. When every insight is
          hero-owned, the title goes with them and the section keeps its name
          on aria-label instead, so the accessible name never disappears. */}
      {showNhipCopy ? (
        <header className="today-center-head">
          <h2 id="today-center-title">Nhịp Quỹ</h2>
        </header>
      ) : null}

      <div className="nhip-block">
        {/* Only the kinds the hero does not already state. An empty list is
            rendered as nothing at all — no placeholder sentence, because
            "nothing to report" is itself a line to read. */}
        {showNhipCopy ? (
          <ul className="nhip-list">
            {visibleInsights.map((insight) => (
              <li key={insight.kind} className={`nhip-item nhip-${insight.kind}`}>
                {insight.text}
              </li>
            ))}
          </ul>
        ) : null}

        {/* The delta is never a repeat of the hero: it is the change since the
            previous visit, which the hero does not report. It stays. */}
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

      {/* OVERVIEW-MONO-001 r1 — the "Trạng thái" card became three equal tiles.
          r2 put Khớp sao kê, An toàn and Mô phỏng into one card as three full
          width rows, each with a name, a figure and a sentence: a checklist.
          The three facts are the same, but a tile only shows the label and the
          figure, so the row of them reads at a glance. The sentence is not
          lost — it is the aria-label on every tile, and the two tiles that
          open a TraceSheet show the full breakdown there on tap.

          Every destination and handler is unchanged: the first tile is still
          the same <Link to="/transactions">, the other two still open exactly
          the same sheets. This is a container change, not a behaviour one.

          OVERVIEW-RHYTHM-001 r4 does not touch this grid. */}
      <section className="state-grid" aria-label="Trạng thái">
        <Link
          to="/transactions"
          className={`state-tile state-${reconciliationTone}`}
          aria-label={`Khớp sao kê: ${reconciliationValue}. ${reconciliationDetail} Mở giao dịch và đối chiếu PDF`}
        >
          <span className="state-name">Sao kê</span>
          <span className="state-value">{reconciliationValue}</span>
        </Link>
        <button
          type="button"
          className={`state-tile state-${safetyScore === 4 ? "positive" : "warning"}`}
          onClick={() => setSafetyOpen(true)}
          aria-label={`An toàn: ${safetyScore} trên 4. ${highestRisk?.label ?? "Bốn lớp bảo vệ đều sẵn sàng."}`}
        >
          <span className="state-name">An toàn</span>
          <span className="state-value">{safetyScore}/4</span>
        </button>
        <button
          type="button"
          className="state-tile state-neutral"
          onClick={() => setWhatIfOpen(true)}
          aria-label={`Mô phỏng: ${whatIfCardValue}. ${whatIfCaption}`}
        >
          <span className="state-name">Mô phỏng</span>
          <span className="state-value">{whatIfCardValue}</span>
        </button>
      </section>

      <TraceSheet
        open={traceOpen}
        onClose={() => setTraceOpen(false)}
        model={pulseTraceModel}
      />

      <TraceSheet
        open={whatIfOpen}
        onClose={() => setWhatIfOpen(false)}
        model={whatIfTraceModel}
      >
        <div className="today-sheet-tools">
          <div className="today-sheet-presets" role="group" aria-label="Khoản thử nhanh">
            {[50, 100, 250].map((preset) => (
              <button
                key={preset}
                type="button"
                className={amount === preset ? "active" : ""}
                onClick={() => setWhatIfAmount(String(preset))}
              >
                {preset} €
              </button>
            ))}
          </div>
          <label className="today-sheet-amount">
            <span>Khoản tùy chọn</span>
            <span><input inputMode="decimal" value={whatIfAmount} onChange={(event) => setWhatIfAmount(event.target.value)} /><b>€</b></span>
          </label>
        </div>
      </TraceSheet>

      <TraceSheet
        open={safetyOpen}
        onClose={() => setSafetyOpen(false)}
        model={safetyTraceModel}
      >
        {!restoreReady ? (
          <div className="today-sheet-tools">
            <button type="button" className="today-inline-button" onClick={confirmRestore}>
              Đánh dấu đã thử khôi phục
            </button>
          </div>
        ) : null}
      </TraceSheet>
    </section>
  );
}
