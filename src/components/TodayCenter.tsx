import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/db";
import { formatMoney, parseDecimal } from "../lib/calc";
import { listDepotStatements } from "../lib/depotStatements";
import {
  reconcileDepotStatement,
  type DepotReconciliationRow,
} from "../lib/tr/depotStatement";
import {
  portfolioPulseDelta,
  readPortfolioPulse,
  readRestoreCompleted,
  recordPortfolioPulse,
  type PortfolioPulseState,
} from "../lib/todayCenter";
import type { AppSettings, Transaction } from "../lib/types";
import { SYNC_STATUS_LABEL, type SyncStatus } from "../lib/sync/types";

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
  ownerKey: string;
  totalValue: number;
  totalQuantity: number;
  valueComplete: boolean;
  vwcePrice: number;
  settings: AppSettings;
  transactions: Transaction[];
  syncStatus: SyncStatus;
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
  ownerKey,
  totalValue,
  totalQuantity,
  valueComplete,
  vwcePrice,
  settings,
  transactions,
  syncStatus,
}: Props) {
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
      setReconciliationLoaded(true);
      setSafety({
        backupAt: metadata?.lastBackupAt ?? "",
        restoreAt: readRestoreCompleted(ownerKey),
        offlineReady: Boolean(navigator.serviceWorker?.controller || registration?.active),
      });
    })();
    return () => {
      active = false;
    };
  }, [ownerKey, transactions]);

  const delta = useMemo(() => portfolioPulseDelta(pulse), [pulse]);
  const amount = Math.max(0, parseDecimal(whatIfAmount));
  const years = Math.max(
    0,
    Math.min(40, (Number(settings.endDate.slice(0, 4)) || new Date().getFullYear()) - new Date().getFullYear()),
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
      ready: backupReady,
      label: backupReady
        ? `Backup ${backupAge === 0 ? "hôm nay" : `${backupAge} ngày trước`}`
        : safety.backupAt
          ? "Backup đã quá 30 ngày"
          : "Chưa có backup",
    },
    { ready: restoreReady, label: restoreReady ? "Đã thử khôi phục" : "Chưa thử khôi phục" },
    { ready: safety.offlineReady, label: safety.offlineReady ? "PWA sẵn sàng offline" : "Chưa xác nhận PWA offline" },
    { ready: printedReady, label: printedReady ? "Hồ sơ khẩn cấp đã in" : "Chưa in hồ sơ khẩn cấp" },
  ];
  const safetyScore = safetyItems.filter((item) => item.ready).length;

  return (
    <section className="today-center" aria-labelledby="today-center-title">
      <header className="today-center-head">
        <div>
          <p className="today-kicker">Một lần mở · bốn câu trả lời</p>
          <h2 id="today-center-title">Trung tâm hôm nay</h2>
          <p>Biến động, đối chiếu, thử nhanh và độ an toàn — không cần tìm ở bốn màn hình.</p>
        </div>
        <span className="today-live-pill">
          <span aria-hidden />
          Live local
        </span>
      </header>

      <div className="today-grid">
        <article className="today-card today-card-pulse">
          <div className="today-card-head">
            <span className="today-card-icon" aria-hidden>↗</span>
            <div>
              <p className="today-card-eyebrow">A · Daily delta</p>
              <h3>Từ lần mở trước</h3>
            </div>
          </div>
          {!valueComplete ? (
            <div className="today-empty-state">
              <strong>Đang chờ đủ giá</strong>
              <span>Delta sẽ không ghi một mốc thiếu dữ liệu.</span>
              <Link to="/settings?tab=prices">Bổ sung giá →</Link>
            </div>
          ) : delta ? (
            <>
              <p className={`today-main-metric ${metricTone(delta.value)}`}>
                {signedMoney(delta.value)}
              </p>
              <p className="today-metric-caption">
                {delta.valuePct === null
                  ? "Mốc trước chưa có giá trị"
                  : `${delta.valuePct >= 0 ? "+" : ""}${delta.valuePct.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`}
                {Math.abs(delta.quantity) > 0.000001
                  ? ` · ${delta.quantity > 0 ? "+" : ""}${delta.quantity.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} đơn vị`
                  : " · số lượng không đổi"}
              </p>
              <p className="today-subtle">So với mốc {dateLabel(delta.since)}</p>
            </>
          ) : (
            <div className="today-empty-state">
              <strong>Đã tạo mốc đầu tiên</strong>
              <span>Lần mở có ý nghĩa tiếp theo sẽ hiện phần thay đổi.</span>
            </div>
          )}
        </article>

        <article className="today-card today-card-reconcile">
          <div className="today-card-head">
            <span className="today-card-icon" aria-hidden>≋</span>
            <div>
              <p className="today-card-eyebrow">B · Đối chiếu 30 giây</p>
              <h3>App so với Trade</h3>
            </div>
          </div>
          {!reconciliationLoaded ? (
            <p className="today-subtle">Đang kiểm tra mốc Depot gần nhất…</p>
          ) : reconciliation ? (
            <>
              <p className={`today-main-metric ${reconciliation.differences.length ? "warning" : "positive"}`}>
                {reconciliation.differences.length === 0
                  ? `${reconciliation.rows.length}/${reconciliation.rows.length} khớp`
                  : `${reconciliation.differences.length} cần xem`}
              </p>
              <p className="today-metric-caption">Sao kê ngày {reconciliation.date}</p>
              {reconciliation.differences.length > 0 ? (
                <ul className="today-mini-list">
                  {reconciliation.differences.slice(0, 2).map((row) => (
                    <li key={row.instrumentIsin}>
                      <span>{row.instrumentIsin.slice(0, 4)}…{row.instrumentIsin.slice(-4)}</span>
                      <strong>{row.difference > 0 ? "+" : ""}{row.difference.toLocaleString("vi-VN", { maximumFractionDigits: 6 })}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="today-subtle">Số lượng trong sổ đang khớp sao kê mới nhất.</p>
              )}
            </>
          ) : (
            <div className="today-empty-state">
              <strong>Chưa có sao kê Depot</strong>
              <span>Nhập PDF Trade Republic để tạo mốc đối chiếu.</span>
            </div>
          )}
          <Link className="today-card-link" to="/transactions">Mở đối chiếu →</Link>
        </article>

        <article className="today-card today-card-whatif">
          <div className="today-card-head">
            <span className="today-card-icon" aria-hidden>◎</span>
            <div>
              <p className="today-card-eyebrow">C · What-if một chạm</p>
              <h3>Nếu thêm hôm nay</h3>
            </div>
          </div>
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
          <label className="today-amount-input">
            <span>Số tiền</span>
            <input
              inputMode="decimal"
              value={whatIfAmount}
              onChange={(event) => setWhatIfAmount(event.target.value)}
            />
            <b>€</b>
          </label>
          {vwcePrice > 0 && amount > 0 ? (
            <>
              <p className="today-main-metric neutral">
                +{extraUnits.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} VWCE
              </p>
              <p className="today-metric-caption">
                Ước tính thành {formatMoney(futureReal)} theo sức mua hôm nay sau {years} năm.
              </p>
            </>
          ) : (
            <p className="today-subtle">Cần giá VWCE hợp lệ để quy đổi số đơn vị.</p>
          )}
          <Link className="today-card-link" to="/simulation">Mở mô phỏng đầy đủ →</Link>
        </article>

        <article className="today-card today-card-safety">
          <div className="today-card-head">
            <span className="today-card-icon" aria-hidden>✓</span>
            <div>
              <p className="today-card-eyebrow">D · Notfallmappe sống</p>
              <h3>An toàn {safetyScore}/4</h3>
            </div>
            <span className={`today-sync-pill sync-${syncStatus}`}>{SYNC_STATUS_LABEL[syncStatus]}</span>
          </div>
          <div className="today-safety-list">
            {safetyItems.map((item) => (
              <div key={item.label} className={item.ready ? "ready" : "pending"}>
                <span aria-hidden>{item.ready ? "✓" : "○"}</span>
                <p>{item.label}</p>
              </div>
            ))}
          </div>
          <div className="today-card-actions">
            <Link className="today-card-link" to="/settings?tab=data">Backup & khôi phục →</Link>
            <Link className="today-card-link secondary-link" to="/notfallmappe">Hồ sơ →</Link>
          </div>
        </article>
      </div>
    </section>
  );
}
