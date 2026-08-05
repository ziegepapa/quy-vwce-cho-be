import { formatMoney } from "./calc";

export type TraceTone = "positive" | "negative" | "warning" | "muted";

export type TraceSource =
  | "transaction_ledger"
  | "portfolio_market_value"
  | "manual_quote"
  | "auto_quote"
  | "legacy_quote"
  | "missing_quote"
  | "pulse_local_storage"
  | "restore_marker"
  | "simulation_engine"
  | "app_settings"
  | "user_input"
  | "explicit_input"
  | "simulation_default"
  | "app_metadata"
  | "service_worker"
  | "emergency_profile";

export type TraceTextValue = {
  kind: "text";
  value: string;
};

export type TraceMoneyValue = {
  kind: "money";
  value: number | null;
  currency?: string;
  signed?: boolean;
  approximate?: boolean;
  fallback?: string;
  suffix?: string;
};

export type TraceQuantityValue = {
  kind: "quantity";
  value: number | null;
  maximumFractionDigits?: number;
  unit?: string;
  signed?: boolean;
  approximate?: boolean;
  fallback?: string;
};

export type TracePercentValue = {
  kind: "percent";
  value: number | null;
  maximumFractionDigits?: number;
  signed?: boolean;
  fallback?: string;
};

export type TraceDateTimeValue = {
  kind: "datetime";
  value: string | null;
  fallback?: string;
};

export type TraceValue =
  | TraceTextValue
  | TraceMoneyValue
  | TraceQuantityValue
  | TracePercentValue
  | TraceDateTimeValue;

export type TraceRowModel = {
  id: string;
  label: string;
  value: TraceValue;
  source: TraceSource;
  tone?: TraceTone;
  formula?: string;
};

export type TraceLinkModel = {
  label: string;
  to: string;
};

export type TraceSheetModel = {
  id: string;
  eyebrow?: string;
  title: string;
  primary?: TraceValue;
  explanation: string;
  rows: TraceRowModel[];
  links?: TraceLinkModel[];
};

const SOURCE_LABELS: Record<TraceSource, string> = {
  transaction_ledger: "Sổ giao dịch local",
  portfolio_market_value: "Định giá danh mục",
  manual_quote: "Giá thủ công hiệu lực",
  auto_quote: "Giá tự động hiệu lực",
  legacy_quote: "Giá VWCE tương thích cũ",
  missing_quote: "Chưa có giá hiệu lực",
  pulse_local_storage: "Lịch sử Pulse trên thiết bị",
  restore_marker: "Dấu kiểm tra khôi phục trên thiết bị",
  simulation_engine: "Simulation engine",
  app_settings: "Cài đặt kế hoạch",
  user_input: "Dữ liệu người dùng nhập",
  explicit_input: "Tham số được truyền rõ ràng",
  simulation_default: "Mặc định của simulation engine",
  app_metadata: "Metadata backup local",
  service_worker: "Trạng thái PWA",
  emergency_profile: "Hồ sơ khẩn cấp",
};

export function traceSourceLabel(source: TraceSource): string {
  return SOURCE_LABELS[source];
}

function numericPrefix(value: number, signed = false, approximate = false): string {
  const approx = approximate ? "≈ " : "";
  if (!signed || value === 0) return approx;
  return `${approx}${value > 0 ? "+" : "−"}`;
}

export function formatTraceValue(value: TraceValue, locale = "vi-VN"): string {
  if (value.kind === "text") return value.value;

  if (value.kind === "datetime") {
    if (!value.value || !Number.isFinite(Date.parse(value.value))) return value.fallback ?? "—";
    return new Date(value.value).toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (value.value == null || !Number.isFinite(value.value)) {
    return value.fallback ?? "—";
  }

  if (value.kind === "money") {
    const rendered = formatMoney(value.signed ? Math.abs(value.value) : value.value, value.currency ?? "EUR");
    return `${numericPrefix(value.value, value.signed, value.approximate)}${rendered}${value.suffix ?? ""}`;
  }

  const displayValue = value.signed ? Math.abs(value.value) : value.value;
  const rendered = displayValue.toLocaleString(locale, {
    maximumFractionDigits: value.maximumFractionDigits ?? (value.kind === "percent" ? 2 : 6),
  });
  if (value.kind === "quantity") {
    const unit = value.unit ? ` ${value.unit}` : "";
    return `${numericPrefix(value.value, value.signed, value.approximate)}${rendered}${unit}`;
  }

  return `${numericPrefix(value.value, value.signed)}${rendered}%`;
}
