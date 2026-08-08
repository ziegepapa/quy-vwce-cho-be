import { describe, expect, it } from "vitest";
import { canRemoveFromPriceList } from "./priceListRemoval";
import { VWCE_ISIN } from "./types";

/** Valid non-VWCE ISIN (Amundi MSCI World — checksum verified). */
const OTHER_ISIN = "FR0010315770";

describe("canRemoveFromPriceList", () => {
  it("never removes VWCE, even with no transactions at all", () => {
    const check = canRemoveFromPriceList({ isin: VWCE_ISIN, transactions: [] });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("vwce");
  });

  it("allows an ISIN nothing points at", () => {
    const check = canRemoveFromPriceList({
      isin: OTHER_ISIN,
      transactions: [{ type: "cash_in" }, { type: "fee" }, { type: "safe_interest" }],
    });
    expect(check.ok).toBe(true);
  });

  it("refuses while a security transaction still uses the ISIN", () => {
    const check = canRemoveFromPriceList({
      isin: OTHER_ISIN,
      transactions: [{ type: "buy_security", instrumentIsin: OTHER_ISIN }],
    });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toBe("has-transactions");
      expect(check.message).toContain("1 giao dịch");
    }
  });

  it("counts a legacy buy_vwce row against VWCE, not against another ISIN", () => {
    expect(
      canRemoveFromPriceList({ isin: OTHER_ISIN, transactions: [{ type: "buy_vwce" }] }).ok,
    ).toBe(true);
    expect(
      canRemoveFromPriceList({ isin: VWCE_ISIN, transactions: [{ type: "buy_vwce" }] }).ok,
    ).toBe(false);
  });

  it("normalizes the ISIN before comparing", () => {
    const check = canRemoveFromPriceList({
      isin: " fr0010315770 ",
      transactions: [{ type: "sell_security", instrumentIsin: OTHER_ISIN }],
    });
    expect(check.ok).toBe(false);
  });

  it("ignores a security row that never got an ISIN", () => {
    expect(
      canRemoveFromPriceList({
        isin: OTHER_ISIN,
        transactions: [{ type: "buy_security" }],
      }).ok,
    ).toBe(true);
  });
});
