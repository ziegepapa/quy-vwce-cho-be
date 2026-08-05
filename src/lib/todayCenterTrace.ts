import type { PortfolioPulseDelta } from "./todayCenter";
import type {
  TodayCenterPortfolioProvenance,
  TodayCenterPriceSource,
} from "./todayCenterAdapter";
import type {
  TodayCenterSafetyAssessment,
  TodayCenterSafetyKey,
  TodayCenterWhatIfResult,
} from "./todayCenterEngine";
import type {
  TraceSheetModel,
  TraceSource,
  TraceValue,
} from "./traceModel";

function priceSource(source: TodayCenterPriceSource): TraceSource {
  if (source === "manual_quote") return "manual_quote";
  if (source === "auto_quote") return "auto_quote";
  if (source === "legacy_quote") return "legacy_quote";
  return "missing_quote";
}

export function priceSourceLabel(source: TodayCenterPriceSource): string {
  if (source === "manual_quote") return "Giá thủ công hiệu lực";
  if (source === "auto_quote") return "Giá tự động hiệu lực";
  if (source === "legacy_quote") return "Giá VWCE tương thích cũ";
  return "Chưa có giá";
}

export type PortfolioTraceInput = {
  totalValue: number;
  securities: number;
  cash: number;
  cashNegative: boolean;
  valueComplete: boolean;
  missingIsins: string[];
  vwcePrice: number;
  vwceAsOf?: string;
  provenance: TodayCenterPortfolioProvenance;
};

export function buildPortfolioTraceModel(input: PortfolioTraceInput): TraceSheetModel {
  const effectiveSource = input.provenance.vwcePrice;
  const quoteSource = priceSource(effectiveSource);
  return {
    id: "portfolio-total",
    title: "Tổng tài sản",
    primary: {
      kind: "money",
      value: input.totalValue,
      suffix: input.valueComplete ? undefined : " đã định giá",
    },
    explanation: "Tổng tài sản = chứng khoán có giá hợp lệ + số dư an toàn trong sổ local. Holdings được dựng bằng cách replay sổ giao dịch; giá thiếu không bị tính thành 0.",
    rows: [
      {
        id: "securities",
        label: "Chứng khoán",
        value: { kind: "money", value: input.securities },
        source: "portfolio_market_value",
        formula: "sum(position.quantity × effectiveQuote.price)",
      },
      {
        id: "cash",
        label: "An toàn",
        value: { kind: "money", value: input.cash },
        source: "transaction_ledger",
        tone: input.cashNegative ? "negative" : undefined,
        formula: "replay(cash transactions + security settlements)",
      },
      {
        id: "holdings-source",
        label: "Nguồn holdings",
        value: { kind: "text", value: input.provenance.holdings === "transactions_replay" ? "Replay sổ giao dịch" : input.provenance.holdings },
        source: "transaction_ledger",
        tone: "muted",
      },
      {
        id: "vwce-source",
        label: "Nguồn VWCE",
        value: { kind: "text", value: priceSourceLabel(effectiveSource) },
        source: quoteSource,
      },
      {
        id: "vwce-price",
        label: "Giá VWCE",
        value: { kind: "money", value: input.vwcePrice > 0 ? input.vwcePrice : null, fallback: "Chưa có" },
        source: quoteSource,
        tone: input.vwcePrice > 0 ? undefined : "warning",
      },
      {
        id: "vwce-as-of",
        label: "asOf",
        value: { kind: "text", value: input.vwceAsOf ?? (effectiveSource === "legacy_quote" ? "legacy" : "—") },
        source: quoteSource,
        tone: "muted",
      },
      {
        id: "completeness",
        label: "Độ đầy đủ",
        value: {
          kind: "text",
          value: input.valueComplete ? "Đủ giá" : `Thiếu ${input.missingIsins.length} mã`,
        },
        source: "portfolio_market_value",
        tone: input.valueComplete ? "positive" : "warning",
      },
    ],
    links: [
      { label: "Xem giao dịch", to: "/transactions" },
      { label: "Giá & tài sản", to: "/settings?tab=prices" },
    ],
  };
}

export type PulseTraceInput = {
  valueComplete: boolean;
  totalValue: number;
  totalQuantity: number;
  delta: PortfolioPulseDelta | null;
};

export function buildPulseTraceModel(input: PulseTraceInput): TraceSheetModel {
  const primary: TraceValue = !input.valueComplete
    ? { kind: "text", value: "Đang chờ đủ giá" }
    : input.delta
      ? { kind: "money", value: input.delta.value, signed: true }
      : { kind: "text", value: "Mốc đầu tiên" };
  return {
    id: "portfolio-pulse",
    eyebrow: "Nhịp Quỹ · nguồn dữ liệu",
    title: "Đổi gì?",
    primary,
    explanation: input.delta
      ? "Delta dùng hai lần mở app có danh mục đầy đủ gần nhất. Refresh lỗi, rerender hoặc thiếu giá không tạo mốc giả."
      : "Đây là mốc danh mục đầy đủ đầu tiên. Lần mở app tiếp theo sẽ tạo delta để đối chiếu.",
    rows: [
      {
        id: "current-value",
        label: "Hiện tại",
        value: { kind: "money", value: input.totalValue },
        source: "portfolio_market_value",
      },
      {
        id: "previous-value",
        label: "Mốc trước",
        value: {
          kind: "money",
          value: input.delta ? input.totalValue - input.delta.value : null,
          fallback: "Chưa có",
        },
        source: "pulse_local_storage",
        tone: "muted",
      },
      {
        id: "quantity",
        label: "Số lượng",
        value: { kind: "quantity", value: input.totalQuantity, maximumFractionDigits: 6, unit: "đơn vị" },
        source: "transaction_ledger",
      },
      {
        id: "since",
        label: "Mốc so sánh",
        value: {
          kind: "datetime",
          value: input.delta?.since ?? null,
          fallback: "Lần mở app tiếp theo",
        },
        source: "pulse_local_storage",
        tone: "muted",
      },
    ],
    links: [
      { label: "Xem giao dịch", to: "/transactions" },
      { label: "Kiểm tra giá", to: "/settings?tab=prices" },
    ],
  };
}

export type WhatIfTraceInput = {
  result: TodayCenterWhatIfResult;
  portfolioEmpty: boolean;
  priceSource: TodayCenterPriceSource;
};

function whatIfPrimary(input: WhatIfTraceInput): TraceValue {
  if (input.result.status === "missing_price") return { kind: "text", value: "Cần giá VWCE" };
  if (input.result.status === "empty_amount") return { kind: "text", value: "Nhập khoản thử" };
  return {
    kind: "quantity",
    value: input.result.extraUnits,
    maximumFractionDigits: 4,
    unit: "VWCE",
    signed: !input.portfolioEmpty,
    approximate: input.portfolioEmpty,
  };
}

export function buildWhatIfTraceModel(input: WhatIfTraceInput): TraceSheetModel {
  const result = input.result;
  const source = priceSource(input.priceSource);
  const buyValue = whatIfPrimary(input);
  return {
    id: "what-if",
    eyebrow: "Nhịp Quỹ · mô phỏng",
    title: "Nếu thêm…?",
    primary: buyValue,
    explanation: input.portfolioEmpty
      ? "Mô phỏng độc lập trước giao dịch đầu tiên, dùng cùng engine với màn Mô phỏng và đã tính TER. Kết quả không phải tài sản hiện có, không ghi vào sổ local."
      : "Ước tính dùng cùng engine với màn Mô phỏng, gồm TER và lạm phát. Đây không phải giao dịch thật.",
    rows: [
      {
        id: "status",
        label: "Trạng thái",
        value: { kind: "text", value: input.portfolioEmpty ? "Mô phỏng · chưa ghi sổ" : "Ước tính · chưa tạo giao dịch" },
        source: "simulation_engine",
        tone: "muted",
      },
      {
        id: "amount",
        label: "Khoản thử",
        value: { kind: "money", value: result.amount },
        source: "user_input",
      },
      {
        id: "vwce-price",
        label: "Giá VWCE",
        value: { kind: "money", value: result.vwcePrice, fallback: "Chưa có" },
        source,
        tone: result.vwcePrice ? undefined : "warning",
      },
      {
        id: "price-source",
        label: "Nguồn giá",
        value: { kind: "text", value: priceSourceLabel(input.priceSource) },
        source,
        tone: "muted",
      },
      {
        id: "extra-units",
        label: "Mua thêm",
        value: buyValue,
        source: "simulation_engine",
        formula: "amount / effective VWCE price",
      },
      {
        id: "future-real",
        label: `Sức mua sau ${result.years} năm`,
        value: { kind: "money", value: result.amount > 0 ? result.futureReal : null },
        source: "simulation_engine",
        formula: result.trace.formula,
      },
      {
        id: "annual-return",
        label: "Lợi suất giả định",
        value: { kind: "percent", value: result.annualReturn * 100 },
        source: "app_settings",
      },
      {
        id: "inflation",
        label: "Lạm phát",
        value: { kind: "percent", value: result.inflation * 100 },
        source: "app_settings",
      },
      {
        id: "ter",
        label: "TER",
        value: { kind: "percent", value: result.ter * 100 },
        source: "simulation_engine",
      },
      {
        id: "formula",
        label: "Mô hình",
        value: { kind: "text", value: "Simulation engine · projectEnd + purchasingPower" },
        source: "simulation_engine",
        tone: "muted",
        formula: result.trace.formula,
      },
    ],
    links: [
      { label: "Mô phỏng đầy đủ", to: "/simulation" },
      { label: "Kiểm tra giá", to: "/settings?tab=prices" },
    ],
  };
}

export type SafetyTraceDisplayItem = {
  key: TodayCenterSafetyKey;
  name: string;
  ready: boolean;
  label: string;
};

export type SafetyTraceInput = {
  assessment: TodayCenterSafetyAssessment;
  items: SafetyTraceDisplayItem[];
};

function safetySource(key: TodayCenterSafetyKey): TraceSource {
  if (key === "backup") return "app_metadata";
  if (key === "restore") return "restore_marker";
  if (key === "offline") return "service_worker";
  return "emergency_profile";
}

export function buildSafetyTraceModel(input: SafetyTraceInput): TraceSheetModel {
  return {
    id: "safety",
    eyebrow: "Nhịp Quỹ",
    title: "An toàn chưa?",
    primary: { kind: "text", value: `${input.assessment.score}/${input.assessment.total} ổn` },
    explanation: "Bốn lớp bảo vệ giúp sổ local vẫn có thể sao lưu, khôi phục, dùng offline và bàn giao khi cần.",
    rows: input.items.map((item) => ({
      id: item.key,
      label: item.name,
      value: { kind: "text", value: item.label },
      source: safetySource(item.key),
      tone: item.ready ? "positive" : "warning",
    })),
    links: [
      { label: "Backup & dữ liệu", to: "/settings?tab=data" },
      { label: "Hồ sơ khẩn cấp", to: "/notfallmappe" },
    ],
  };
}
