import { describe, expect, it } from "vitest";
import type { TraceSheetModel } from "./traceModel";
import {
  buildAiTracePayload,
  parseAiTraceExplanationResponse,
} from "./aiTraceExplanation";

function traceModel(): TraceSheetModel {
  return {
    id: "portfolio-local-record-id",
    title: "  Tổng\n tài sản  ",
    primary: { kind: "money", value: 1_234.5 },
    explanation: "Giải thích chuẩn\u0000 không phụ thuộc AI.",
    rows: Array.from({ length: 14 }, (_, index) => ({
      id: `row-secret-${index}`,
      label: `Dòng ${index + 1}`,
      value: { kind: "quantity" as const, value: index + 1, unit: "VWCE" },
      source: "transaction_ledger" as const,
      formula: index === 0 ? " ledger.sum()\n + quote " : undefined,
    })),
    links: [{ label: "Giao dịch", to: "/transactions/private-local-route" }],
  };
}

describe("buildAiTracePayload", () => {
  it("sends a bounded allow-listed trace without local IDs or links", () => {
    const payload = buildAiTracePayload(traceModel());
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({ schemaVersion: 1, locale: "vi-VN" });
    expect(payload.trace.title).toBe("Tổng tài sản");
    expect(payload.trace.primary).toContain("1.234");
    expect(payload.trace.rows).toHaveLength(12);
    expect(payload.trace.rows[0].source).toBe("Sổ giao dịch local");
    expect(payload.trace.rows[0].formula).toBe("ledger.sum() + quote");
    expect(serialized).not.toContain("portfolio-local-record-id");
    expect(serialized).not.toContain("row-secret-");
    expect(serialized).not.toContain("/transactions/private-local-route");
    expect(serialized).not.toContain("\u0000");
  });
});

describe("parseAiTraceExplanationResponse", () => {
  it("normalizes and bounds provider output", () => {
    expect(parseAiTraceExplanationResponse({ explanation: "  Đây là\n giải thích. " }))
      .toBe("Đây là giải thích.");
    expect(parseAiTraceExplanationResponse({ explanation: "a".repeat(1_500) }))
      .toHaveLength(1_200);
  });

  it("rejects missing or empty provider output", () => {
    expect(() => parseAiTraceExplanationResponse({})).toThrow(/hợp lệ/);
    expect(() => parseAiTraceExplanationResponse({ explanation: "   " })).toThrow(/hợp lệ/);
  });
});
