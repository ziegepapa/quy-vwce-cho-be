import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatMoney } from "../lib/calc";
import { TraceSheet } from "./TraceSheet";
import { readMeta } from "../lib/db";
import {
  portfolioPulseDelta,
  readPortfolioPulse,
  readRestoreCompleted,
  recordPortfolioPulse,
  type PortfolioPulseDelta,
} from "../lib/todayCenter";
import {
  DEFAULT_TER,
  buildTodayCenterSafety,
  buildTodayCenterWhatIf,
  type TodayCenterSafetyKey,
} from "../lib/todayCenterEngine";
import type { TodayCenterPriceSource } from "../lib/todayCenterAdapter";
import {
  buildPulseTraceModel,
  buildSafetyTraceModel,
  buildWhatIfTraceModel,
} from "../lib/todayCenterTrace";
import "../styles/today-center.css";

const EURO = "EUR";

function signedMoney(value: number): string {
  if (Math.abs(value) < 0.005) return formatMoney(0, EURO);
  return `${value > 0 ? "+" : "−"}${formatMoney(Math.abs(value), EURO)}`;
}

function signedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  if (Math.abs(value) < 0.005) return "0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString("vi-VN", {
    maximumFractionDigits: 1,
  })}%`;
}

function dateLabel(iso: string): string {
  if (!iso) return "Chưa có";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Chưa có";
  return parsed.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isOfflineReady(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    || "serviceWorker" in navigator;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type PulseCardProps = {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  tone?: "positive" | "negative" | "warning" | "neutral";
  badge?: string;
  onClick: () => void;
};

function PulseCard({ title, value, subtitle, icon, tone = "neutral", badge, onClick }: PulseCardProps) {
  return (
    <button
      className={`today-pulse-card tone-${tone}`}
      type="button"
      onClick={onClick}
      aria-label={`${title}: ${value}. Mở chi tiết`}
    >
      <span className="today-pulse-icon" aria-hidden="true">{icon}</span>
      <span className="today-pulse-copy">
        <span className="today-pulse-title-row">
          <span className="today-pulse-title">{title}</span>
          {badge && <span className="today-pulse-badge">{badge}</span>}
        </span>
        <strong className="today-pulse-value">{value}</strong>
        <span className="today-pulse-subtitle">{subtitle}</span>
      </span>
    </button>
  );
}

export type TodayCenterProps = {
  ownerKey: string;
  totalValue: number;
  totalQuantity: number;
  valueComplete: boolean;
  vwcePrice: number;
  vwcePriceSource: TodayCenterPriceSource;
  years?: number;
  annualReturn?: number;
  inflation?: number;
  ter?: number;
  onRecordPulse?: () => void;
  focusControl?: ReactNode;
};

export function TodayCenter({
  ownerKey,
  totalValue,
  totalQuantity,
  valueComplete,
  vwcePrice,
  vwcePriceSource,
  years = 15,
  annualReturn = 0.07,
  inflation = 0.02,
  ter = DEFAULT_TER,
  onRecordPulse,
  focusControl,
}: TodayCenterProps) {
  const [activeSheet, setActiveSheet] = useState<"pulse" | "whatif" | "safety" | null>(null);
  const [pulse, setPulse] = useState<PortfolioPulseDelta | null>(null);
  const [whatIfAmount, setWhatIfAmount] = useState(100);
  const [lastBackupAt, setLastBackupAt] = useState("");
  const [restoreAt, setRestoreAt] = useState("");
  const [lastPrintedAt, setLastPrintedAt] = useState("");
  const [readinessLoaded, setReadinessLoaded] = useState(false);

  const portfolioEmpty = totalQuantity <= 0 && totalValue <= 0;

  useEffect(() => {
    if (!ownerKey || !valueComplete) {
      setPulse(null);
      return;
    }
    const next = recordPortfolioPulse(ownerKey, {
      capturedAt: new Date().toISOString(),
      totalValue,
      totalQuantity,
    });
    setPulse(portfolioPulseDelta(next));
  }, [ownerKey, totalValue, totalQuantity, valueComplete]);

  useEffect(() => {
    let cancelled = false;
    setReadinessLoaded(false);
    setRestoreAt(readRestoreCompleted(ownerKey));
    void Promise.all([
      readMeta("lastBackupAt"),
      readMeta("notfall.lastPrintedAt"),
    ]).then(([backup, printed]) => {
      if (cancelled) return;
      setLastBackupAt(typeof backup === "string" ? backup : "");
      setLastPrintedAt(typeof printed === "string" ? printed : "");
      setReadinessLoaded(true);
    }).catch(() => {
      if (!cancelled) setReadinessLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ownerKey]);

  const pulseTone = !valueComplete
    ? "warning"
    : !pulse || Math.abs(pulse.value) < 0.005
      ? "neutral"
      : pulse.value > 0
        ? "positive"
        : "negative";
  const pulseValue = !valueComplete
    ? "Đang chờ đủ giá"
    : pulse
      ? signedMoney(pulse.value)
      : "Mốc đầu tiên";
  const pulseSince = pulse
    ? `Từ ${dateLabel(pulse.since)}${pulse.valuePct === null ? "" : ` · ${signedPercent(pulse.valuePct)}`}`
    : valueComplete
      ? "Sẽ so với lần mở app tiếp theo"
      : "Không ghi mốc khi còn thiếu giá";

  const now = new Date().toISOString();
  const safety = useMemo(() => buildTodayCenterSafety({
    backupAt: lastBackupAt,
    restoreAt,
    offlineReady: isOfflineReady(),
    lastPrintedAt,
    now,
  }), [lastBackupAt, restoreAt, lastPrintedAt, now]);

  const safetyItems = useMemo(() => safety.items.map((item) => {
    const name = item.key === "backup"
      ? "Backup"
      : item.key === "restore"
        ? "Khôi phục"
        : item.key === "offline"
          ? "Offline"
          : "Hồ sơ";
    const label = item.key === "backup"
      ? item.ready
        ? `Backup ${safety.backupAgeDays ?? 0} ngày trước`
        : item.reason === "backup_stale"
          ? `Backup đã ${safety.backupAgeDays ?? "?"} ngày`
          : "Chưa có backup gần đây"
      : item.key === "restore"
        ? item.ready
          ? `Đã thử ${dateLabel(restoreAt)}`
          : "Chưa thử khôi phục"
        : item.key === "offline"
          ? item.ready
            ? "PWA sẵn sàng offline"
            : "Chưa xác nhận offline"
          : item.ready
            ? `Đã in ${dateLabel(lastPrintedAt)}`
            : "Chưa in hồ sơ khẩn cấp";
    return { ...item, name, label };
  }), [safety, restoreAt, lastPrintedAt]);

  const whatIf = buildTodayCenterWhatIf({
    amount: whatIfAmount,
    vwcePrice,
    priceSource: vwcePriceSource,
    years,
    annualReturn,
    inflation,
    ter,
  });
  const whatIfCardValue = whatIf.status === "missing_price"
    ? "Cần giá VWCE"
    : whatIf.status === "empty_amount"
      ? "Nhập khoản thử"
      : portfolioEmpty
        ? `≈ ${whatIf.extraUnits!.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} VWCE`
        : `+${whatIf.extraUnits!.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} VWCE`;
  const whatIfTone = whatIf.status === "missing_price" ? "warning" : "positive";

  const highestRiskName: Record<TodayCenterSafetyKey, string> = {
    backup: "backup",
    restore: "thử khôi phục",
    offline: "offline",
    print: "hồ sơ",
  };
  const safetySubtitle = !readinessLoaded
    ? "Đang kiểm tra trên thiết bị này"
    : safety.highestRisk
      ? `Ưu tiên: ${highestRiskName[safety.highestRisk]}`
      : "Các lớp bảo vệ đang ổn";

  const pulseTraceModel = buildPulseTraceModel({
    valueComplete,
    totalValue,
    totalQuantity,
    delta: pulse,
  });
  const whatIfTraceModel = buildWhatIfTraceModel({
    result: whatIf,
    portfolioEmpty,
    priceSource: vwcePriceSource,
  });
  const safetyTraceModel = buildSafetyTraceModel({
    assessment: safety,
    items: safetyItems,
  });

  const handleRecordPulse = () => {
    if (valueComplete) {
      const existing = readPortfolioPulse(ownerKey);
      setPulse(portfolioPulseDelta(existing));
    }
    onRecordPulse?.();
    setActiveSheet(null);
  };

  return (
    <section className="today-center" aria-labelledby="today-center-title">
      <div className="today-center-header">
        <div>
          <p className="eyebrow">Hôm nay</p>
          <h2 id="today-center-title">Nhịp Quỹ</h2>
          <p className="muted">Ba câu hỏi để hiểu quỹ trong vài giây.</p>
        </div>
        {focusControl}
      </div>

      <div className="today-pulse-grid">
        <PulseCard
          title="Đổi gì?"
          value={pulseValue}
          subtitle={pulseSince}
          icon="↗"
          tone={pulseTone}
          badge={!pulse && valueComplete ? "Mới" : undefined}
          onClick={() => setActiveSheet("pulse")}
        />
        <PulseCard
          title="Nếu thêm…?"
          value={whatIfCardValue}
          subtitle={portfolioEmpty
            ? "Mô phỏng độc lập · chưa ghi sổ"
            : whatIf.status === "ready"
              ? `${formatMoney(whatIf.amount, EURO)} · ước tính, chưa ghi sổ`
              : "Cần giá hiệu lực để mô phỏng"}
          icon="＋"
          tone={whatIfTone}
          badge={portfolioEmpty ? "Mô phỏng" : undefined}
          onClick={() => setActiveSheet("whatif")}
        />
        <PulseCard
          title="An toàn chưa?"
          value={readinessLoaded ? `${safety.score}/${safety.total} ổn` : "Đang kiểm tra"}
          subtitle={safetySubtitle}
          icon="✓"
          tone={!readinessLoaded ? "neutral" : safety.score === safety.total ? "positive" : "warning"}
          onClick={() => setActiveSheet("safety")}
        />
      </div>

      <TraceSheet
        open={activeSheet === "pulse"}
        onClose={() => setActiveSheet(null)}
        model={pulseTraceModel}
      >
        <button className="btn" type="button" onClick={handleRecordPulse}>
          Đánh dấu mốc hiện tại
        </button>
      </TraceSheet>

      <TraceSheet
        open={activeSheet === "whatif"}
        onClose={() => setActiveSheet(null)}
        model={whatIfTraceModel}
      >
        <button className="btn ghost" type="button" onClick={() => setActiveSheet(null)}>Đóng</button>
      </TraceSheet>

      {activeSheet === "whatif" && (
        <div className="today-whatif-popover" aria-label="Điều chỉnh khoản thử">
          <label htmlFor="today-whatif-amount">Khoản thử</label>
          <input
            id="today-whatif-amount"
            type="range"
            min="0"
            max="1000"
            step="25"
            value={clamp(whatIfAmount, 0, 1000)}
            onChange={(event) => setWhatIfAmount(Number(event.target.value))}
          />
          <strong>{formatMoney(whatIfAmount, EURO)}</strong>
        </div>
      )}

      <TraceSheet
        open={activeSheet === "safety"}
        onClose={() => setActiveSheet(null)}
        model={safetyTraceModel}
      >
        <Link className="btn" to="/settings?tab=data" onClick={() => setActiveSheet(null)}>
          Cập nhật an toàn
        </Link>
        <button className="btn ghost" type="button" onClick={() => setActiveSheet(null)}>Đóng</button>
      </TraceSheet>
    </section>
  );
}
