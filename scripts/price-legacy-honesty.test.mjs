/**
 * PRICE-LEGACY-MIRROR-HONESTY-001 — the schema 1 mirror must never claim a
 * cross-check that never happened.
 * Run: node --test scripts/price-legacy-honesty.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  legacyV1ToQuoteRow,
  quoteRowToLegacyV1,
  writeJsonAtomic,
} from "./price/contract.mjs";

/**
 * A VWCE row exactly as the orchestrator produces it when only onvista answered:
 * no crossCheckedWith and no crossCheckDifferencePct.
 */
function rowWithoutCrossCheck(overrides = {}) {
  return {
    instrumentIsin: "IE00BK5BQT80",
    currency: "EUR",
    venue: "XETRA",
    price: 169.62,
    asOf: "2026-08-13",
    fetchedAt: "2026-08-14T07:41:36.929Z",
    source: "auto",
    provider: "onvista",
    providerUrl: "https://api.onvista.de/api/v1/funds/ISIN:IE00BK5BQT80/snapshot",
    ...overrides,
  };
}

function writeAndReadMirror(row) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-honesty-"));
  const filePath = path.join(dir, "vwce-price.json");
  writeJsonAtomic(quoteRowToLegacyV1(row), filePath);
  const raw = fs.readFileSync(filePath, "utf8");
  return { raw, parsed: JSON.parse(raw) };
}

describe("legacy mirror cross-check honesty", () => {
  it("omits cross-check fields when no cross-check ran", () => {
    const v1 = quoteRowToLegacyV1(rowWithoutCrossCheck());
    assert.equal(v1.schemaVersion, 1);
    assert.equal(v1.crossCheckedWith, undefined);
    assert.equal(v1.crossCheckDifferencePct, undefined);
  });

  it("published mirror file carries no cross-check keys when none ran", () => {
    const { raw, parsed } = writeAndReadMirror(rowWithoutCrossCheck());
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.isin, "IE00BK5BQT80");
    assert.equal(parsed.price, 169.62);
    assert.equal(parsed.provider, "onvista");
    assert.equal(Object.hasOwn(parsed, "crossCheckDifferencePct"), false);
    assert.equal(Object.hasOwn(parsed, "crossCheckedWith"), false);
    assert.equal(raw.includes("crossCheck"), false);
  });

  it("preserves a genuine 0% delta from a real cross-check", () => {
    const { parsed } = writeAndReadMirror(
      rowWithoutCrossCheck({
        provider: "yahoo_finance_chart",
        providerUrl: "https://finance.yahoo.com/quote/VWCE.DE",
        crossCheckedWith: "onvista",
        crossCheckDifferencePct: 0,
      }),
    );
    assert.equal(parsed.crossCheckedWith, "onvista");
    assert.equal(parsed.crossCheckDifferencePct, 0);
  });

  it("drops non-numeric or non-finite cross-check values instead of publishing them", () => {
    for (const bad of [NaN, Infinity, -Infinity, "0", null]) {
      const v1 = quoteRowToLegacyV1(
        rowWithoutCrossCheck({
          crossCheckedWith: "onvista",
          crossCheckDifferencePct: bad,
        }),
      );
      assert.equal(v1.crossCheckDifferencePct, undefined);
    }
  });

  it("round-trip back to v2 does not invent a cross-check", () => {
    const v1 = quoteRowToLegacyV1(rowWithoutCrossCheck());
    const back = legacyV1ToQuoteRow(v1);
    assert.equal(back.instrumentIsin, "IE00BK5BQT80");
    assert.equal(back.price, 169.62);
    assert.equal(back.asOf, "2026-08-13");
    assert.equal(back.crossCheckedWith, undefined);
    assert.equal(back.crossCheckDifferencePct, undefined);
  });
});
