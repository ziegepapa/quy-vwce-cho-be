import { describe, expect, it } from "vitest";
import {
  advancePortfolioPulse,
  portfolioPulseDelta,
  type PortfolioPulseSample,
} from "./todayCenter";

const sample = (
  capturedAt: string,
  totalValue: number,
  totalQuantity: number,
): PortfolioPulseSample => ({ capturedAt, totalValue, totalQuantity });

describe("portfolio pulse", () => {
  it("creates the first baseline without inventing a delta", () => {
    const state = advancePortfolioPulse(
      null,
      sample("2026-08-05T08:00:00.000Z", 1_000, 5),
    );
    expect(state.previous).toBeUndefined();
    expect(portfolioPulseDelta(state)).toBeNull();
  });

  it("deduplicates StrictMode-style rerenders inside one minute", () => {
    const first = advancePortfolioPulse(
      null,
      sample("2026-08-05T08:00:00.000Z", 1_000, 5),
    );
    const second = advancePortfolioPulse(
      first,
      sample("2026-08-05T08:00:10.000Z", 1_020, 5.1),
    );

    expect(second.previous).toBeUndefined();
    expect(second.current.capturedAt).toBe("2026-08-05T08:00:00.000Z");
    expect(second.current.totalValue).toBe(1_020);
  });

  it("compares a later visit with the prior meaningful sample", () => {
    const first = advancePortfolioPulse(
      null,
      sample("2026-08-05T08:00:00.000Z", 1_000, 5),
    );
    const strictModePass = advancePortfolioPulse(
      first,
      sample("2026-08-05T08:00:10.000Z", 1_020, 5.1),
    );
    const later = advancePortfolioPulse(
      strictModePass,
      sample("2026-08-05T08:05:00.000Z", 1_120, 5.6),
    );
    const delta = portfolioPulseDelta(later);

    expect(later.previous?.totalValue).toBe(1_020);
    expect(delta?.value).toBe(100);
    expect(delta?.quantity).toBeCloseTo(0.5);
    expect(delta?.valuePct).toBeCloseTo((100 / 1_020) * 100);
    expect(delta?.since).toBe("2026-08-05T08:00:00.000Z");
  });

  it("normalizes invalid numeric values instead of storing NaN", () => {
    const state = advancePortfolioPulse(
      null,
      sample("2026-08-05T08:00:00.000Z", Number.NaN, -3),
    );
    expect(state.current.totalValue).toBe(0);
    expect(state.current.totalQuantity).toBe(0);
  });
});
