import { describe, expect, it } from "vitest";
import { validateManualQuoteDraft } from "./manualQuoteDraft";

const TODAY = "2026-08-05";

 describe("validateManualQuoteDraft", () => {
  it("normalizes an ISIN and accepts a German decimal", () => {
    const result = validateManualQuoteDraft(
      { isin: " ie00 bk5b qt80 ", price: "167,54", asOf: "2026-08-04" },
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        instrumentIsin: "IE00BK5BQT80",
        price: 167.54,
        asOf: "2026-08-04",
        fingerprint: "IE00BK5BQT80|167.54|2026-08-04",
      },
    });
  });

  it("keeps an empty draft without treating it as a saved quote", () => {
    expect(
      validateManualQuoteDraft(
        { isin: "IE00BK5BQT80", price: "", asOf: "2026-08-04" },
        TODAY,
      ),
    ).toMatchObject({ ok: false, reason: "empty" });
  });

  it("rejects invalid checksum, non-positive price and a future date", () => {
    expect(
      validateManualQuoteDraft(
        { isin: "IE00BK5BQT81", price: "10", asOf: "2026-08-04" },
        TODAY,
      ),
    ).toMatchObject({ ok: false, reason: "isin" });
    expect(
      validateManualQuoteDraft(
        { isin: "IE00BK5BQT80", price: "0", asOf: "2026-08-04" },
        TODAY,
      ),
    ).toMatchObject({ ok: false, reason: "price" });
    expect(
      validateManualQuoteDraft(
        { isin: "IE00BK5BQT80", price: "10", asOf: "2026-08-06" },
        TODAY,
      ),
    ).toMatchObject({ ok: false, reason: "future" });
  });
});
