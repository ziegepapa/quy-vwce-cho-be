import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  advancePortfolioPulse,
  markRestoreCompleted,
  portfolioPulseDelta,
  readPortfolioPulse,
  readRestoreCompleted,
  recordPortfolioPulse,
  type PortfolioPulseSample,
} from "./todayCenter";

const sample = (
  capturedAt: string,
  totalValue: number,
  totalQuantity: number,
): PortfolioPulseSample => ({ capturedAt, totalValue, totalQuantity });

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("portfolio pulse", () => {
  it("creates the first baseline without inventing a delta", () => {
    const state = advancePortfolioPulse(
      null,
      sample("2026-08-05T08:00:00.000Z", 1_000, 5),
      "visit-a",
    );
    expect(state.version).toBe(2);
    expect(state.previous).toBeUndefined();
    expect(portfolioPulseDelta(state)).toBeNull();
  });

  it("keeps one baseline for a visit even when a rerender happens after a minute", () => {
    const first = advancePortfolioPulse(
      null,
      sample("2026-08-05T08:00:00.000Z", 1_000, 5),
      "visit-a",
    );
    const rerender = advancePortfolioPulse(
      first,
      sample("2026-08-05T08:05:00.000Z", 1_020, 5.1),
      "visit-a",
    );

    expect(rerender.previous).toBeUndefined();
    expect(rerender.current.capturedAt).toBe("2026-08-05T08:00:00.000Z");
    expect(rerender.current.totalValue).toBe(1_020);
  });

  it("recognizes a new visit even when it starts inside the former 60-second window", () => {
    const first = advancePortfolioPulse(
      null,
      sample("2026-08-05T08:00:00.000Z", 1_000, 5),
      "visit-a",
    );
    const nextVisit = advancePortfolioPulse(
      first,
      sample("2026-08-05T08:00:10.000Z", 1_100, 5.5),
      "visit-b",
    );
    const delta = portfolioPulseDelta(nextVisit);

    expect(nextVisit.previous?.visitId).toBe("visit-a");
    expect(delta?.value).toBe(100);
    expect(delta?.quantity).toBeCloseTo(0.5);
    expect(delta?.since).toBe("2026-08-05T08:00:00.000Z");
  });

  it("compares a later visit with the last complete visit", () => {
    const first = advancePortfolioPulse(
      null,
      sample("2026-08-05T08:00:00.000Z", 1_000, 5),
      "visit-a",
    );
    const sameVisit = advancePortfolioPulse(
      first,
      sample("2026-08-05T08:05:00.000Z", 1_020, 5.1),
      "visit-a",
    );
    const later = advancePortfolioPulse(
      sameVisit,
      sample("2026-08-06T08:00:00.000Z", 1_120, 5.6),
      "visit-b",
    );
    const delta = portfolioPulseDelta(later);

    expect(later.previous?.totalValue).toBe(1_020);
    expect(delta?.value).toBe(100);
    expect(delta?.valuePct).toBeCloseTo((100 / 1_020) * 100);
  });

  it("normalizes invalid numeric values instead of storing NaN", () => {
    const state = advancePortfolioPulse(
      null,
      sample("invalid-date", Number.NaN, -3),
      "visit-a",
    );
    expect(state.current.capturedAt).toBe(new Date(0).toISOString());
    expect(state.current.totalValue).toBe(0);
    expect(state.current.totalQuantity).toBe(0);
  });

  it("keeps pulse histories isolated by owner", () => {
    recordPortfolioPulse("owner-a", sample("2026-08-05T08:00:00.000Z", 100, 1), "a-1");
    recordPortfolioPulse("owner-b", sample("2026-08-05T08:00:00.000Z", 200, 2), "b-1");

    expect(readPortfolioPulse("owner-a")?.current.totalValue).toBe(100);
    expect(readPortfolioPulse("owner-b")?.current.totalValue).toBe(200);
  });

  it("migrates a valid version-1 baseline without losing the next delta", () => {
    localStorage.setItem(
      "vwce.today-center.pulse.v1:owner-a",
      JSON.stringify({
        version: 1,
        current: sample("2026-08-05T08:00:00.000Z", 100, 1),
      }),
    );

    const migrated = readPortfolioPulse("owner-a");
    expect(migrated?.version).toBe(2);
    const next = recordPortfolioPulse(
      "owner-a",
      sample("2026-08-06T08:00:00.000Z", 130, 1.25),
      "visit-new",
    );
    expect(portfolioPulseDelta(next)?.value).toBe(30);
  });

  it("ignores corrupt pulse and restore markers safely", () => {
    localStorage.setItem("vwce.today-center.pulse.v1:owner-a", "{broken");
    localStorage.setItem("vwce.today-center.restore.v1:owner-a", "not-a-date");
    expect(readPortfolioPulse("owner-a")).toBeNull();
    expect(readRestoreCompleted("owner-a")).toBe("");

    markRestoreCompleted("owner-a", "2026-08-05T08:00:00.000Z");
    expect(readRestoreCompleted("owner-a")).toBe("2026-08-05T08:00:00.000Z");
  });
});
