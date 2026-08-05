import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/today-center.css";
import "../styles/pulse-polish.css";
import { useAuth } from "../lib/auth";
import { db } from "../lib/db";
import { formatMoney, parseDecimal } from "../lib/calc";
import { listDepotStatements } from "../lib/depotStatements";
import {
  reconcileDepotStatement,
  type DepotReconciliationRow,
} from "../lib/tr/depotStatement";
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
import type { AppSettings, Transaction } from "../lib/types";
import TraceSheet from "./TraceSheet";

type ReconciliationSummary = {
  date: string;
  rows: DepotReconciliationRow[];
  differences: DepotReconciliationRow[];
} | null;

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
};

type PulseIconName = "pulse" | "reconcile" | "whatif" | "safety";

function PulseIcon({ name }: { name: PulseIconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {name === "pulse" ? (
        <path d="M3 12h4l2.2-5 4.1 10 2.2-5H21" />
      ) : name === "reconcile" ? (
        <>
          <path d="M4 8h13" />
          <path d="m14 5 3 3-3 3" />
          <path d="M20 16H7" />
          <path d="m10 13-3 3 3 3" />
        </>
      ) : name === "whatif" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8M8 12h8" />
        </>
      ) : (
        <>
          <path d="M12 3 19 6v5.4c0 4.2-2.8 8-7 9.6-4.2-1.6-7-5.4-7-9.6V6l7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      )}
    </svg>
  );
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function signedMoney(value: number): string {
  if (Math.abs(value) < 0.005) return formatMoney(0);
  return `${value > 0 ? "+" : "−"}${formatMoney(Math.abs(value))}`;
}

function metricTone(value: number): "positive" | "negative" | "neutral" {
  if (value > 0.005) return "positive";
  if (value < -0.005) return "negative";
  return "neutral";
}

function priceSourceLabel(source: TodayCenterPriceSource): string {
  if (source === "manual_quote") return "Giá thủ công hiệu lực";
  if (source === "auto_quote") return "Giá tự động hiệu lực";
  if (source === "legacy_quote") return "Giá VWCE tương thích cũ";
  return "Chưa có giá";
}

export default function TodayCenter({
  totalValue,
  totalQuantity,
  valueComplete,
  vwcePrice,
  vwcePriceSource,
  settings,
  transactions,
}: Props) {
  const auth = useAuth();
  const ownerKey = auth.user?.id ?? "local";
  const [pulse, setPulse] = useState<PortfolioPulseState | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationSummary>(null);
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
        if (latest) {
          const rows = reconcileDepotStatement(latest, transactions);
          setReconciliation({
            date: latest.date,
            rows,
            differences: rows.filter((row) => row.status !== "match"),
          });
        } else {
          setReconciliation(null);
        }
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

  const delta = useMemo(() => portfolioPulseDelta(pulse), [pulse]);
  const portfolioEmpty =
    transactions.length === 0 &&
    Math.abs(totalValue) < 0.005 &&
    Math.abs(totalQuantity) < 0.000001;
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
  const safetyItems = [
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

  const reconciliationValue = !reconciliationLoaded
    ? "Đang kiểm tra"
    : !reconciliation
      ? "Chưa có sao kê"
      : reconciliation.differences.length === 0
        ? `${reconciliation.rows.length}/${reconciliation.rows.length} khớp`
        : `${reconciliation.differences.length} cần xem`;

  const deltaValue = !valueComplete
    ? "Đang chờ đủ giá"
    : delta
      ? signedMoney(delta.value)
      : "Mốc đầu tiên";

  const extraUnitsText = extraUnits.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
  const whatIfValue = whatIf.status === "ready"
    ? `+${extraUnitsText} VWCE`
    : whatIf.status === "missing_price"
      ? "Cần giá VWCE"
      : "Nhập khoản thử";
  const whatIfCardValue = portfolioEmpty && whatIf.status === "ready"
    ? `≈ ${extraUnitsText} VWCE`
    : whatIfValue;
  const terLabel = `${(whatIf.ter * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%/năm`;

  function confirmRestore() {
    if (!window.confirm("Chỉ đánh dấu sau khi bạn đã thử nhập một bản backup và kiểm tra số liệu. Đã hoàn tất?")) return;
    const completedAt = new Date().toISOString();
    markRestoreCompleted(ownerKey, completedAt);
    setSafety((current) => ({ ...current, restoreAt: completedAt }));
  }

  return (
    <section className="today-center" aria-labelledby="today-center-title">
      <header className="today-center-head">
        <div>
          <p className="today-kicker">Một lần mở · bốn câu trả lời</p>
          <h2 id="today-center-title">Nhịp Quỹ</h2>
        </div>
      </header>

      <div className="today-grid">
        <article className={`today-card today-card-pulse${pulseChanged ? " is-new" : ""}`}>
          <header className="today-card-head">
            <span className="today-card-icon"><PulseIcon name="pulse" /></span>
            <h3>Đổi gì?</h3>
            {pulseChanged ? <span className="today-new-label">Mới</span> : null}
          </header>
          <button
            type="button"
            className="today-card-detail"
            onClick={() => setTraceOpen(true)}
            aria-label={`Đổi gì: ${deltaValue}. Xem nguồn dữ liệu`}
          >
            {!valueComplete ? (
              <span className="today-empty-state">
                <strong>Đang chờ đủ giá</strong>
                <span>Không ghi mốc thiếu dữ liệu.</span>
              </span>
            ) : delta ? (
              <>
                <span className={`today-main-metric ${metricTone(delta.value)}`}>{signedMoney(delta.value)}</span>
                <span className="today-metric-caption">
                  {delta.valuePct === null
                    ? "Mốc trước chưa có giá trị"
                    : `${delta.valuePct >= 0 ? "+" : ""}${delta.valuePct.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`}
                  {Math.abs(delta.quantity) > 0.000001
                    ? ` · ${delta.quantity > 0 ? "+" : ""}${delta.quantity.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} đơn vị`
                    : " · số lượng không đổi"}
                </span>
              </>
            ) : (
              <span className="today-empty-state">
                <strong>Đã tạo mốc đầu tiên</strong>
                <span>Lần mở tiếp theo sẽ hiện thay đổi.</span>
              </span>
            )}
            <span className="today-detail-hint">Xem nguồn</span>
          </button>
        </article>

        <Link
          to="/transactions"
          className="today-card today-card-reconcile today-card-link"
          aria-label={`${reconciliationValue}. Mở giao dịch và đối chiếu PDF`}
        >
          <header className="today-card-head">
            <span className="today-card-icon"><PulseIcon name="reconcile" /></span>
            <h3>Khớp chưa?</h3>
            <span className="today-card-chevron" aria-hidden>›</span>
          </header>
          <span className={`today-main-metric ${reconciliation?.differences.length ? "warning" : reconciliation ? "positive" : "neutral"}`}>
            {reconciliationValue}
          </span>
          <span className="today-metric-caption">
            {reconciliation
              ? `Sao kê ${reconciliation.date}`
              : "Nhập PDF để tạo mốc đối chiếu."}
          </span>
        </Link>

        <article className="today-card today-card-whatif">
          <header className="today-card-head">
            <span className="today-card-icon"><PulseIcon name="whatif" /></span>
            <h3>Nếu thêm…?</h3>
          </header>
          <button type="button" className="today-card-detail" onClick={() => setWhatIfOpen(true)}>
            <span className={`today-card-context${portfolioEmpty ? " is-simulation" : ""}`}>
              {portfolioEmpty ? "Mô phỏng · chưa ghi vào quỹ" : `Thử ${formatMoney(amount)}`}
            </span>
            <span className="today-main-metric neutral">{whatIfCardValue}</span>
            <span className="today-metric-caption">
              {whatIf.status === "ready"
                ? portfolioEmpty
                  ? `${formatMoney(amount)} giả định theo giá hiện tại · không phải số dư.`
                  : `${formatMoney(futureReal)} sức mua sau ${years} năm.`
                : whatIf.status === "missing_price"
                  ? "Cần giá hợp lệ để quy đổi."
                  : "Nhập khoản lớn hơn 0 để mô phỏng."}
            </span>
            <span className="today-detail-hint">Đổi khoản thử</span>
          </button>
        </article>

        <article className="today-card today-card-safety">
          <header className="today-card-head">
            <span className="today-card-icon"><PulseIcon name="safety" /></span>
            <h3>An toàn chưa?</h3>
          </header>
          <button type="button" className="today-card-detail" onClick={() => setSafetyOpen(true)}>
            <span className={`today-main-metric ${safetyScore === 4 ? "positive" : "warning"}`}>
              {safetyScore}/4 ổn
            </span>
            <span className="today-metric-caption">
              {highestRisk?.label ?? "Bốn lớp bảo vệ đều sẵn sàng."}
            </span>
            <span className="today-detail-hint">Xem bốn lớp</span>
          </button>
        </article>
      </div>

      <TraceSheet
        open={traceOpen}
        onClose={() => setTraceOpen(false)}
        eyebrow="Nhịp Quỹ · nguồn dữ liệu"
        title="Đổi gì?"
        value={deltaValue}
        explanation={delta
          ? "Delta dùng hai lần mở app có danh mục đầy đủ gần nhất. Refresh lỗi, rerender hoặc thiếu giá không tạo mốc giả."
          : "Đây là mốc danh mục đầy đủ đầu tiên. Lần mở app tiếp theo sẽ tạo delta để đối chiếu."}
        rows={[
          { label: "Hiện tại", value: formatMoney(totalValue) },
          {
            label: "Mốc trước",
            value: delta ? formatMoney(totalValue - delta.value) : "Chưa có",
            tone: "muted",
          },
          {
            label: "Số lượng",
            value: `${totalQuantity.toLocaleString("vi-VN", { maximumFractionDigits: 6 })} đơn vị`,
          },
          { label: "Mốc so sánh", value: delta ? dateLabel(delta.since) : "Lần mở app tiếp theo", tone: "muted" },
        ]}
        links={[
          { label: "Xem giao dịch", to: "/transactions" },
          { label: "Kiểm tra giá", to: "/settings?tab=prices" },
        ]}
      />

      <TraceSheet
        open={whatIfOpen}
        onClose={() => setWhatIfOpen(false)}
        eyebrow="Nhịp Quỹ · mô phỏng"
        title="Nếu thêm…?"
        value={whatIfCardValue}
        explanation={portfolioEmpty
          ? "Mô phỏng độc lập trước giao dịch đầu tiên, dùng cùng engine với màn Mô phỏng và đã tính TER. Kết quả không phải tài sản hiện có, không ghi vào sổ local."
          : "Ước tính dùng cùng engine với màn Mô phỏng, gồm TER và lạm phát. Đây không phải giao dịch thật."}
        rows={[
          { label: "Trạng thái", value: portfolioEmpty ? "Mô phỏng · chưa ghi sổ" : "Ước tính · chưa tạo giao dịch", tone: "muted" },
          { label: "Khoản thử", value: formatMoney(amount) },
          { label: "Giá VWCE", value: whatIf.vwcePrice ? formatMoney(whatIf.vwcePrice) : "Chưa có", tone: whatIf.vwcePrice ? undefined : "warning" },
          { label: "Nguồn giá", value: priceSourceLabel(whatIf.trace.vwcePrice.source as TodayCenterPriceSource), tone: "muted" },
          { label: "Mua thêm", value: whatIfCardValue },
          { label: `Sức mua sau ${years} năm`, value: amount > 0 ? formatMoney(futureReal) : "—" },
          { label: "Mô hình", value: `Simulation engine · TER ${terLabel}`, tone: "muted" },
        ]}
        links={[
          { label: "Mô phỏng đầy đủ", to: "/simulation" },
          { label: "Kiểm tra giá", to: "/settings?tab=prices" },
        ]}
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
        eyebrow="Nhịp Quỹ"
        title="An toàn chưa?"
        value={`${safetyScore}/4 ổn`}
        explanation="Bốn lớp bảo vệ giúp sổ local vẫn có thể sao lưu, khôi phục, dùng offline và bàn giao khi cần."
        rows={safetyItems.map((item) => ({
          label: item.name,
          value: item.label,
          tone: item.ready ? ("positive" as const) : ("warning" as const),
        }))}
        links={[
          { label: "Backup & dữ liệu", to: "/settings?tab=data" },
          { label: "Hồ sơ khẩn cấp", to: "/notfallmappe" },
        ]}
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
