import { describe, expect, it } from "vitest";
import {
  isValidIsin,
  isValidIsinChecksum,
  isValidIsinShape,
  isValidAsOfDate,
  normalizeIsin,
  quoteId,
  resolveInstrumentIsin,
} from "./instrument";
import { VWCE_ISIN } from "./types";

describe("ISIN checksum", () => {
  it("accepts VWCE", () => {
    expect(isValidIsinShape(VWCE_ISIN)).toBe(true);
    expect(isValidIsinChecksum(VWCE_ISIN)).toBe(true);
    expect(isValidIsin(VWCE_ISIN)).toBe(true);
  });

  it("rejects bad check digit", () => {
    const bad = VWCE_ISIN.slice(0, 11) + (VWCE_ISIN[11] === "0" ? "1" : "0");
    expect(isValidIsinShape(bad)).toBe(true);
    expect(isValidIsinChecksum(bad)).toBe(false);
  });

  it("normalizes case", () => {
    expect(normalizeIsin("ie00bk5bqt80")).toBe(VWCE_ISIN);
  });
});

describe("quoteId identity", () => {
  it("is ISIN + currency, not venue", () => {
    expect(quoteId(VWCE_ISIN, "EUR")).toBe(`quote_${VWCE_ISIN}_EUR`);
    expect(quoteId(VWCE_ISIN, "eur")).toBe(`quote_${VWCE_ISIN}_EUR`);
  });
});

describe("asOf date", () => {
  it("accepts calendar dates only", () => {
    expect(isValidAsOfDate("2026-07-31")).toBe(true);
    expect(isValidAsOfDate("2026-02-30")).toBe(false);
    expect(isValidAsOfDate("")).toBe(false);
    expect(isValidAsOfDate("2026-07-31T12:00:00Z")).toBe(false);
  });
});

describe("resolveInstrumentIsin", () => {
  it("legacy buy_vwce defaults to VWCE", () => {
    expect(resolveInstrumentIsin({ type: "buy_vwce" })).toBe(VWCE_ISIN);
  });
  it("buy_security without ISIN is empty", () => {
    expect(resolveInstrumentIsin({ type: "buy_security" })).toBe("");
  });
});
