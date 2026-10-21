import { describe, expect, it } from "vitest";
import { buildSimulationStartValue } from "./portfolioStart";
import { VALL_ISIN, VWCE_ISIN, type Quote, type Transaction } from "../types";

const NOW = "2026-10-21T12:00:00.000Z";
const DATE = "2026-10-21";

function tx(id: string, isin: string, quantity: number, amount = 100): Transaction {
  return {
    id, date: DATE, type: "buy_security", amount, quantity, instrumentIsin: isin,
    notes: "", createdAt: NOW, updatedAt: NOW,
  };
}

function quote(id: string, isin: string, price: number): Quote {
  return {
    id, instrumentIsin: isin, currency: "EUR", price, asOf: DATE, source: "auto",
    createdAt: NOW, updatedAt: NOW,
  };
}

describe("buildSimulationStartValue", () => {
  it("values every held instrument rather than VWCE only", () => {
    const result = buildSimulationStartValue({
      transactions: [tx("vwce", VWCE_ISIN, 2), tx("vall", VALL_ISIN, 3)],
      quotes: [quote("q-vwce", VWCE_ISIN, 100), quote("q-vall", VALL_ISIN, 50)],
      nowDate: DATE,
    });
    expect(result.balance).toBe(350);
    expect(result.missingIsins).toEqual([]);
    expect(result.valuationStatus).toBe("fresh");
  });

  it("does not silently treat an unpriced holding as worth zero", () => {
    const result = buildSimulationStartValue({
      transactions: [tx("vwce", VWCE_ISIN, 2), tx("vall", VALL_ISIN, 3)],
      quotes: [quote("q-vwce", VWCE_ISIN, 100)],
      nowDate: DATE,
    });
    expect(result.balance).toBe(200);
    expect(result.missingIsins).toEqual([VALL_ISIN]);
    expect(result.valuationStatus).toBe("missing");
  });

  it("counts positive cash but never subtracts a negative bookkeeping balance from assets", () => {
    const cashIn: Transaction = {
      id: "cash", date: DATE, type: "cash_in", amount: 50, notes: "",
      createdAt: NOW, updatedAt: NOW,
    };
    const positive = buildSimulationStartValue({
      transactions: [tx("vwce", VWCE_ISIN, 1), cashIn],
      quotes: [quote("q-vwce", VWCE_ISIN, 100)],
      nowDate: DATE,
    });
    expect(positive.balance).toBe(150);
  });
});
