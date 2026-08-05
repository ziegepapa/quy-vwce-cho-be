import { describe, expect, it } from "vitest";
import { formatTraceValue } from "./traceModel";
import {
  buildPortfolioTraceModel,
  buildPulseTraceModel,
  buildSafetyTraceModel,
  buildWhatIfTraceModel,
} from "./todayCenterTrace";
import {
  buildTodayCenterSafety,
  buildTodayCenterWhatIf,
} from "./todayCenterEngine";

describe("formatTraceValue", () => {
  it("formats signed money without losing its semantic value", () => {
    const rendered = formatTraceValue({ kind: "money", value: 100, signed: true });
    expect(rendered).toContain("+");
    expect(rendered).toContain("100");
    expect(rendered).toContain("€");
  });

  it("formats approximate quantities and explicit fallbacks", () => {
    expect(formatTraceValue({ kind: "quantity", value: 0.594321, maximumFractionDigits: 4, unit: "VWCE", approximate: true })).toContain("≈ 0,5943 VWCE");
    expect(formatTraceValue({ kind: "datetime", value: "invalid", fallback: "Chưa có" })).toBe("Chưa có");
  });

  it("preserves a negative value when signed decoration is not requested", () => {
    expect(formatTraceValue({ kind: "percent", value: -2 })).toContain("-2%");
    expect(formatTraceValue({ kind: "quantity", value: -1, unit: "đơn vị" })).toContain("-1 đơn vị");
  });
});

describe("typed trace builders", () => {
  it("keeps missing portfolio prices explicit with provenance", () => {
    const trace = buildPortfolioTraceModel({
      totalValue: 100,
      securities: 0,
      cash: 100,
      cashNegative: false,
      valueComplete: false,
      missingIsins: ["IE00B4L5Y983"],
      vwcePrice: 0,
      provenance: {
        holdings: "transactions_replay",
        marketValue: "portfolio_market_value",
        vwcePrice: "missing",
      },
    });
    const price = trace.rows.find((row) => row.id === "vwce-price");
    const completeness = trace.rows.find((row) => row.id === "completeness");
    expect(price?.source).toBe("missing_quote");
    expect(price?.tone).toBe("warning");
    expect(completeness?.tone).toBe("warning");
    expect(trace.primary).toMatchObject({ kind: "money", suffix: " đã định giá" });
  });

  it("records legacy quote provenance instead of calling it auto", () => {
    const trace = buildPortfolioTraceModel({
      totalValue: 123,
      securities: 123,
      cash: 0,
      cashNegative: false,
      valueComplete: true,
      missingIsins: [],
      vwcePrice: 123,
      provenance: {
        holdings: "transactions_replay",
        marketValue: "portfolio_market_value",
        vwcePrice: "legacy_quote",
      },
    });
    expect(trace.rows.find((row) => row.id === "vwce-price")?.source).toBe("legacy_quote");
    expect(trace.rows.find((row) => row.id === "vwce-as-of")?.value).toEqual({ kind: "text", value: "legacy" });
  });

  it("builds a pulse trace from typed current and previous values", () => {
    const trace = buildPulseTraceModel({
      valueComplete: true,
      totalValue: 1_100,
      totalQuantity: 5.5,
      delta: { value: 100, valuePct: 10, quantity: 0.5, since: "2026-08-05T08:00:00.000Z" },
    });
    expect(trace.primary).toEqual({ kind: "money", value: 100, signed: true });
    expect(trace.rows.find((row) => row.id === "previous-value")?.value).toMatchObject({ value: 1_000 });
    expect(trace.rows.find((row) => row.id === "since")?.source).toBe("pulse_local_storage");
  });

  it("does not expose a stale Pulse delta while current prices are incomplete", () => {
    const trace = buildPulseTraceModel({
      valueComplete: false,
      totalValue: 700,
      totalQuantity: 5.5,
      delta: { value: 100, valuePct: 10, quantity: 0.5, since: "2026-08-05T08:00:00.000Z" },
    });
    expect(trace.primary).toEqual({ kind: "text", value: "Đang chờ đủ giá" });
    expect(trace.rows.find((row) => row.id === "previous-value")?.value).toMatchObject({ value: null, fallback: "Giữ nguyên" });
    expect(trace.rows.find((row) => row.id === "completeness")?.tone).toBe("warning");
  });

  it("exposes the canonical What-if formula, assumptions and quote source", () => {
    const result = buildTodayCenterWhatIf({
      amount: 250,
      vwcePrice: 125,
      priceSource: "manual_quote",
      years: 12,
      annualReturn: 0.07,
      inflation: 0.02,
    });
    const trace = buildWhatIfTraceModel({ result, portfolioEmpty: false });
    expect(trace.rows.find((row) => row.id === "vwce-price")?.source).toBe("manual_quote");
    expect(trace.rows.find((row) => row.id === "future-real")?.formula).toBe("simulation.projectEnd+purchasingPower");
    expect(trace.rows.find((row) => row.id === "ter")?.source).toBe("simulation_default");
    expect(trace.primary).toMatchObject({ kind: "quantity", value: 2, signed: true });
  });

  it("records an explicit TER separately from the engine default", () => {
    const result = buildTodayCenterWhatIf({
      amount: 250,
      vwcePrice: 125,
      priceSource: "auto_quote",
      years: 12,
      annualReturn: 0.07,
      inflation: 0.02,
      ter: 0.01,
    });
    const trace = buildWhatIfTraceModel({ result, portfolioEmpty: false });
    expect(trace.rows.find((row) => row.id === "ter")?.source).toBe("explicit_input");
  });

  it("does not fabricate units when the quote is missing", () => {
    const result = buildTodayCenterWhatIf({
      amount: 100,
      vwcePrice: 0,
      priceSource: "missing",
      years: 5,
      annualReturn: 0.05,
      inflation: 0.02,
    });
    const trace = buildWhatIfTraceModel({ result, portfolioEmpty: true });
    expect(trace.primary).toEqual({ kind: "text", value: "Cần giá VWCE" });
    expect(trace.rows.find((row) => row.id === "vwce-price")?.source).toBe("missing_quote");
  });

  it("maps each safety layer to its real source", () => {
    const assessment = buildTodayCenterSafety({
      backupAt: "2026-08-01T08:00:00.000Z",
      restoreAt: "",
      offlineReady: true,
      lastPrintedAt: "",
      now: "2026-08-05T08:00:00.000Z",
    });
    const trace = buildSafetyTraceModel({
      assessment,
      items: [
        { key: "backup", name: "Backup", ready: true, label: "Backup 4 ngày trước" },
        { key: "restore", name: "Khôi phục", ready: false, label: "Chưa thử khôi phục" },
        { key: "offline", name: "Offline", ready: true, label: "PWA sẵn sàng offline" },
        { key: "print", name: "Hồ sơ", ready: false, label: "Chưa in hồ sơ khẩn cấp" },
      ],
    });
    expect(trace.rows.find((row) => row.id === "backup")?.source).toBe("app_metadata");
    expect(trace.rows.find((row) => row.id === "restore")?.source).toBe("restore_marker");
    expect(trace.rows.find((row) => row.id === "offline")?.source).toBe("service_worker");
    expect(trace.rows.find((row) => row.id === "print")?.source).toBe("emergency_profile");
  });
});
