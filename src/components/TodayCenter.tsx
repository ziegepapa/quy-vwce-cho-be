import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/today-center.css";
import "../styles/pulse-polish.css";
import { useAuth } from "../lib/auth";
import { db } from "../lib/db";
import { formatMoney, parseDecimal } from "../lib/calc";
import { listDepotStatements } from "../lib/depotStatements";
import { listConflicts } from "../lib/sync/engine";
import { outboxCount } from "../lib/sync/outbox";
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
import { SYNC_STATUS_LABEL, type SyncStatus } from "../lib/sync/types";
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(navigator.onLine ? "syncing" : "offline");
  const [safety, setSafety] = useState<SafetySnapshot>({
    backupAt: "",
    restoreAt: "",
    offlineReady: false,
  });
  const [whatIfAmount, setWhatIfAmount] = useState(() =>
    String(Math.max(50, Math.round(settings.contributionY1 || 100))),
  );
  const [traceOpen, setTraceOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);

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
        const [statements, metadata, registration, pending, conflicts] = await Promise.all([
          listDepotStatements(),
          db.appMetadata.get("meta"),
          registrationPromise,
          outboxCount(),
          listConflicts(),
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
        if (!navigator.onLine) setSyncStatus("offline");
        else if (conflicts.length > 0) setSyncStatus("conflict");
        else if (pending > 0) setSyncStatus("syncing");
        else setSyncStatus("synced");
      } finally {
        if (active) setReconciliationLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [ownerKey, transactions]);

  useEffect(() => {
    const online = () => setSyncStatus("syncing");
    const offline = () => setSyncStatus("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

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
      ready: backupReady,
      label: backupReady
        ? `Backup ${backupAge === 0 ? "hôm nay" : `${backupAge} ngày trước`}`
        : safety.backupAt
          ? "Backup đã quá 30 ngày"
          : "Chưa có backup",
    },
    {
      key: "restore",
      ready: restoreReady,
      label: restoreReady ? "Đã thử khôi phục" : "Chưa thử khôi phục",
    },
    {
      key: "offline",
      ready: safety.offlineReady,
      label: safety.offlineReady ? "PWA sẵn sàng offline" : "Chưa xác nhận PWA offline",
    },
    {
      key: "print",
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
          <p>Nhịp đập danh mục của gia đình — gọn, thật và có thể kiểm chứng.</p>
        </div>
        <div className="today-head-actions">
          <span className={`today-sync-pill sync-${syncStatus}`}>{SYNC_STATUS_LABEL[syncStatus]}</span>
          <button type="button" className="today-show-all" onClick={() => setAllOpen(true)}>
            Xem đủ 4
          </button>
        </div>
      </header>

      <div className="today-grid">
        <article className={`today-card today-card-pulse${pulseChanged ? " is-new" : ""}`}>
          <header className="today-card-head">
            <span className="today-card-icon" aria-hidden>↗</span>
            <div>
              <h3>Đổi gì?</h3>
              <p>So với lần mở có dữ liệu gần nhất.</p>
            </div>
            {pulseChanged ? <span className="today-new-label">Mới</span> : null}
          </header>
          {!valueComplete ? (
            <div className="today-empty-state">
              <strong>Đang chờ đủ giá</strong>
              <span>Không ghi mốc thiếu dữ liệu.</span>
            </div>
          ) : delta ? (
            <button type="button" className="today-metric-trigger" onClick={() => setTraceOpen(true)}>
              <span className={`today-main-metric ${metricTone(delta.value)}`}>{signedMoney(delta.value)}</span>
              <span className="today-metric-caption">
                {delta.valuePct === null
                  ? "Mốc trước chưa có giá trị"
                  : `${delta.valuePct >= 0 ? "+" : ""}${delta.valuePct.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`}
                {Math.abs(delta.quantity) > 0.000001
                  ? ` · ${delta.quantity > 0 ? "+" : ""}${delta.quantity.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} đơn vị`
                  : " · số lượng không đổi"}
              </span>
            </button>
          ) : (
            <div className="today-empty-state">
              <strong>Đã tạo mốc đầu tiên</strong>
              <span>Lần mở có ý nghĩa tiếp theo sẽ hiện thay đổi.</span>
            </div>
          )}
        </article>

        <article className="today-card today-card-reconcile">
          <header className="today-card-head">
            <span className="today-card-icon" aria-hidden>≋</span>
            <div>
              <h3>Khớp chưa?</h3>
              <p>Sổ nội bộ đối chiếu sao kê mới nhất.</p>
            </div>
          </header>
          <p className={`today-main-metric ${reconciliation?.differences.length ? "warning" : reconciliation ? "positive" : "neutral"}`}>
            {reconciliationValue}
          </p>
          <p className="today-metric-caption">
            {reconciliation
              ? `Sao kê ${reconciliation.date}`
              : "Nhập PDF Trade Republic để tạo mốc."}
          </p>
        </article>

        <article className="today-card today-card-whatif">
          <header className="today-card-head">
            <span className="today-card-icon" aria-hidden>◎</span>
            <div>
              <h3>Nếu thêm…?</h3>
              <p>Thử một khoản và xem tới cuối kế hoạch.</p>
            </div>
          </header>
          <div className="today-presets" role="group" aria-label="Khoản thử nhanh">
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
          <p className="today-main-metric neutral">{whatIfValue}</p>
          <p className="today-metric-caption">
            {vwcePrice > 0 && amount > 0
              ? `${formatMoney(futureReal)} sức mua sau ${years} năm.`
              : "Cần giá hợp lệ để quy đổi."}
          </p>
        </article>

        <article className="today-card today-card-safety">
          <header className="today-card-head">
            <span className="today-card-icon" aria-hidden>✓</span>
            <div>
              <h3>An toàn chưa?</h3>
              <p>Backup, khôi phục, offline và đồng bộ.</p>
            </div>
          </header>
          <p className={`today-main-metric ${safetyScore === 4 ? "positive" : "warning"}`}>
            {safetyScore}/4 ổn
          </p>
          <p className="today-metric-caption">
            {highestRisk?.label ?? "Bốn lớp bảo vệ đều sẵn sàng."}
          </p>
        </article>
      </div>

      <div className="today-primary-actions" aria-label="Hành động nhanh">
        <Link to="/transactions">Đối chiếu PDF</Link>
        <Link to="/settings?tab=prices">Nhập giá tay</Link>
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
        open={allOpen}
        onClose={() => setAllOpen(false)}
        eyebrow="Nhịp Quỹ"
        title="Đủ bốn câu trả lời"
        value={`${safetyScore}/4 lớp an toàn`}
        explanation="Một ảnh chụp ngắn của danh mục hiện tại. Mỗi kết quả đều đến từ sổ local, feed giá hoặc sao kê thật."
        rows={[
          { label: "Đổi gì?", value: deltaValue, tone: delta && delta.value < 0 ? "negative" : undefined },
          { label: "Khớp chưa?", value: reconciliationValue, tone: reconciliation?.differences.length ? "warning" : undefined },
          { label: "Nếu thêm…?", value: whatIfValue },
          { label: "An toàn chưa?", value: `${safetyScore}/4 ổn`, tone: safetyScore < 4 ? "warning" : "positive" },
        ]}
        links={[
          { label: "Giao dịch & PDF", to: "/transactions" },
          { label: "Mô phỏng đầy đủ", to: "/simulation" },
          { label: "Backup & dữ liệu", to: "/settings?tab=data" },
          { label: "Hồ sơ khẩn cấp", to: "/notfallmappe" },
        ]}
      >
        <div className="today-sheet-tools">
          <label className="today-sheet-amount">
            <span>Khoản what-if tùy chọn</span>
            <span><input inputMode="decimal" value={whatIfAmount} onChange={(event) => setWhatIfAmount(event.target.value)} /><b>€</b></span>
          </label>
          <div className="today-safety-detail" aria-label="Chi tiết an toàn dữ liệu">
            {safetyItems.map((item) => (
              <div key={item.key} className={item.ready ? "ready" : "pending"}>
                <span aria-hidden>{item.ready ? "✓" : "○"}</span>
                <p>{item.label}</p>
                {item.key === "restore" && !item.ready ? (
                  <button type="button" className="today-inline-button" onClick={confirmRestore}>Đã thử</button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </TraceSheet>
    </section>
  );
}
