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

function dayAge(value: string): number | null {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
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

export default function TodayCenter({
  totalValue,
  totalQuantity,
  valueComplete,
  vwcePrice,
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
  const parsedAmount = parseDecimal(whatIfAmount);
  const amount = Number.isFinite(parsedAmount) ? Math.max(0, parsedAmount) : 0;
  const years = Math.max(
    0,
    Math.min(
      40,
      (Number(settings.endDate.slice(0, 4)) || new Date().getFullYear()) -
        new Date().getFullYear(),
    ),
  );
  const annualReturn = Math.max(-0.95, Math.min(0.5, settings.vwceReturn));
  const inflation = Math.max(0, Math.min(0.5, settings.inflationRate));
  const extraUnits = vwcePrice > 0 ? amount / vwcePrice : 0;
  const futureNominal = amount * Math.pow(1 + annualReturn, years);
  const futureReal = futureNominal / Math.pow(1 + inflation, years);

  const backupAge = dayAge(safety.backupAt);
  const backupReady = backupAge !== null && backupAge <= 30;
  const restoreReady = Boolean(safety.restoreAt);
  const printedReady = Boolean(settings.notfallmappe?.lastPrintedAt);
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
      ready: safety.offlineReady,
      label: safety.offlineReady ? "PWA sẵn sàng offline" : "Chưa xác nhận PWA offline",
    },
    {
      key: "print",
      name: "Hồ sơ",
      ready: printedReady,
      label: printedReady ? "Hồ sơ khẩn cấp đã in" : "Chưa in hồ sơ khẩn cấp",
    },
  ];
  const safetyScore = safetyItems.filter((item) => item.ready).length;
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

  const whatIfValue = vwcePrice > 0 && amount > 0
    ? `+${extraUnits.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} VWCE`
    : "Cần giá VWCE";

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
          {!valueComplete ? (
            <div className="today-empty-state">
              <strong>Đang chờ đủ giá</strong>
              <span>Không ghi mốc thiếu dữ liệu.</span>
            </div>
          ) : delta ? (
            <button type="button" className="today-card-detail" onClick={() => setTraceOpen(true)}>
              <span className={`today-main-metric ${metricTone(delta.value)}`}>{signedMoney(delta.value)}</span>
              <span className="today-metric-caption">
                {delta.valuePct === null
                  ? "Mốc trước chưa có giá trị"
                  : `${delta.valuePct >= 0 ? "+" : ""}${delta.valuePct.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`}
                {Math.abs(delta.quantity) > 0.000001
                  ? ` · ${delta.quantity > 0 ? "+" : ""}${delta.quantity.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} đơn vị`
                  : " · số lượng không đổi"}
              </span>
              <span className="today-detail-hint">Xem nguồn</span>
            </button>
          ) : (
            <div className="today-empty-state">
              <strong>Đã tạo mốc đầu tiên</strong>
              <span>Lần mở tiếp theo sẽ hiện thay đổi.</span>
            </div>
          )}
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
            <span className="today-card-context">Thử {formatMoney(amount)}</span>
            <span className="today-main-metric neutral">{whatIfValue}</span>
            <span className="today-metric-caption">
              {vwcePrice > 0 && amount > 0
                ? `${formatMoney(futureReal)} sức mua sau ${years} năm.`
                : "Cần giá hợp lệ để quy đổi."}
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
        title="Đổi gì?"
        value={deltaValue}
        explanation="Delta dùng hai mốc danh mục đầy đủ gần nhất. Refresh lỗi hoặc thiếu giá không tạo biến động giả."
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
          { label: "Mốc so sánh", value: delta ? dateLabel(delta.since) : "Lần mở tiếp theo", tone: "muted" },
        ]}
        links={[
          { label: "Xem giao dịch", to: "/transactions" },
          { label: "Kiểm tra giá", to: "/settings?tab=prices" },
        ]}
      />

      <TraceSheet
        open={whatIfOpen}
        onClose={() => setWhatIfOpen(false)}
        eyebrow="Nhịp Quỹ"
        title="Nếu thêm…?"
        value={whatIfValue}
        explanation="Ước tính quy đổi khoản thêm hôm nay theo giá VWCE hiện tại và sức mua cuối kế hoạch. Đây không phải giao dịch thật."
        rows={[
          { label: "Khoản thử", value: formatMoney(amount) },
          { label: "Giá VWCE", value: vwcePrice > 0 ? formatMoney(vwcePrice) : "Chưa có", tone: vwcePrice > 0 ? undefined : "warning" },
          { label: "Mua thêm", value: whatIfValue },
          { label: `Sức mua sau ${years} năm`, value: amount > 0 ? formatMoney(futureReal) : "—" },
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
