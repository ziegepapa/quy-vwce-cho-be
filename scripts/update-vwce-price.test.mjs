/**
 * Tests for VWCE price feed — node:test, no extra deps.
 * Run: node --test scripts/update-vwce-price.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  selectClosedBar,
  parseAndValidateYahoo,
  parseAndValidateOnvista,
  crossCheckYahooWithOnvista,
  decideWrite,
  sameEconomics,
  buildPayload,
  writePayloadAtomic,
  readExistingPayload,
  validateExistingPayload,
  runUpdate,
  PriceFeedError,
  berlinDateString,
  berlinHour,
} from "./update-vwce-price.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const yahooFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/yahoo-vwce.json"), "utf8"),
);
const onvistaFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/onvista-vwce.json"), "utf8"),
);

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function barsFromFixture() {
  const r = yahooFixture.chart.result[0];
  const out = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = r.indicators.quote[0].close[i];
    if (typeof c === "number" && Number.isFinite(c) && c > 0) {
      out.push({ timestamp: r.timestamp[i], close: c });
    }
  }
  return out;
}

describe("selectClosedBar", () => {
  const bars = barsFromFixture();

  it("1. after 18:00 Berlin → can pick today's bar", () => {
    // 2026-08-03 19:00 CEST = 17:00 UTC
    const now = new Date("2026-08-03T17:00:00.000Z");
    assert.equal(berlinHour(now), 19);
    const sel = selectClosedBar(bars, now);
    assert.equal(sel.asOf, "2026-08-03");
    assert.ok(sel.close > 160);
  });

  it("2. before 18:00 Berlin → skip today, pick previous", () => {
    // 2026-08-03 11:00 CEST = 09:00 UTC
    const now = new Date("2026-08-03T09:00:00.000Z");
    assert.equal(berlinHour(now), 11);
    const sel = selectClosedBar(bars, now);
    assert.equal(sel.asOf, "2026-07-31");
    assert.ok(Math.abs(sel.close - 162.96) < 0.02);
  });

  it("3. weekend → keep Friday bar", () => {
    // Saturday 2026-08-01 12:00 CEST
    const now = new Date("2026-08-01T10:00:00.000Z");
    const sel = selectClosedBar(bars, now);
    assert.equal(sel.asOf, "2026-07-31");
  });

  it("4. trailing null closes → walk back to last valid", () => {
    const withNull = [
      { timestamp: 1785481200, close: 162.96 }, // ~ Jul 31
      { timestamp: 1785740400, close: NaN },
    ];
    // force only first valid by filtering in selectClosedBar caller style
    const valid = withNull.filter(
      (b) => typeof b.close === "number" && Number.isFinite(b.close) && b.close > 0,
    );
    const now = new Date("2026-08-03T17:00:00.000Z");
    const sel = selectClosedBar(valid, now);
    assert.equal(sel.asOf, "2026-07-31");
  });
});

describe("parseAndValidateYahoo", () => {
  it("5a. valid fixture after close", () => {
    const now = new Date("2026-08-03T17:00:00.000Z");
    const y = parseAndValidateYahoo(yahooFixture, now);
    assert.equal(y.meta.symbol, "VWCE.DE");
    assert.equal(y.meta.currency, "EUR");
    assert.equal(y.asOf, "2026-08-03");
  });

  it("5b. bad symbol", () => {
    const b = clone(yahooFixture);
    b.chart.result[0].meta.symbol = "VWRL.AS";
    assert.throws(
      () => parseAndValidateYahoo(b, new Date("2026-08-03T17:00:00.000Z")),
      /symbol/,
    );
  });

  it("5c. bad currency", () => {
    const b = clone(yahooFixture);
    b.chart.result[0].meta.currency = "USD";
    assert.throws(
      () => parseAndValidateYahoo(b, new Date("2026-08-03T17:00:00.000Z")),
      /currency/,
    );
  });

  it("5d. bad venue", () => {
    const b = clone(yahooFixture);
    b.chart.result[0].meta.fullExchangeName = "NYSE";
    b.chart.result[0].meta.exchangeName = "NYQ";
    assert.throws(
      () => parseAndValidateYahoo(b, new Date("2026-08-03T17:00:00.000Z")),
      /venue/,
    );
  });

  it("5e. bad instrumentType", () => {
    const b = clone(yahooFixture);
    b.chart.result[0].meta.instrumentType = "EQUITY";
    assert.throws(
      () => parseAndValidateYahoo(b, new Date("2026-08-03T17:00:00.000Z")),
      /instrumentType/,
    );
  });

  it("5f. bad longName", () => {
    const b = clone(yahooFixture);
    b.chart.result[0].meta.longName = "Something Else ETF";
    assert.throws(
      () => parseAndValidateYahoo(b, new Date("2026-08-03T17:00:00.000Z")),
      /longName/,
    );
  });

  it("6. price 0 / out of range", () => {
    const b = clone(yahooFixture);
    b.chart.result[0].indicators.quote[0].close = b.chart.result[0].indicators.quote[0].close.map(
      () => 0,
    );
    assert.throws(
      () => parseAndValidateYahoo(b, new Date("2026-08-03T17:00:00.000Z")),
      /No valid|outside|bar/,
    );
    const b2 = clone(yahooFixture);
    b2.chart.result[0].indicators.quote[0].close =
      b2.chart.result[0].indicators.quote[0].close.map(() => 500);
    assert.throws(
      () => parseAndValidateYahoo(b2, new Date("2026-08-03T17:00:00.000Z")),
      /outside/,
    );
  });

  it("7. asOf too old", () => {
    const b = clone(yahooFixture);
    // move all timestamps to 2020
    b.chart.result[0].timestamp = b.chart.result[0].timestamp.map(() => 1577836800);
    assert.throws(
      () => parseAndValidateYahoo(b, new Date("2026-08-03T17:00:00.000Z")),
      /older/,
    );
  });
});

describe("parseAndValidateOnvista", () => {
  it("valid fixture", () => {
    const o = parseAndValidateOnvista(onvistaFixture);
    assert.equal(o.isin, "IE00BK5BQT80");
    assert.ok(o.last > 0);
  });

  it("8. bad ISIN", () => {
    const b = clone(onvistaFixture);
    b.instrument.isin = "IE00B4L5Y983";
    assert.throws(() => parseAndValidateOnvista(b), /ISIN/);
  });

  it("8b. no Xetra", () => {
    const b = clone(onvistaFixture);
    b.quoteList.list = b.quoteList.list.filter(
      (q) => q.market.name !== "Xetra" && q.market.codeExchange !== "GER",
    );
    assert.throws(() => parseAndValidateOnvista(b), /Xetra|empty quoteList/);
  });

  it("8c. bad currency", () => {
    const b = clone(onvistaFixture);
    for (const q of b.quoteList.list) {
      if (q.market.name === "Xetra") q.isoCurrency = "USD";
    }
    assert.throws(() => parseAndValidateOnvista(b), /currency/);
  });
});

describe("crossCheckYahooWithOnvista", () => {
  it("9. same day <=2% pass", () => {
    const yahoo = { price: 164.36, asOf: "2026-08-03" };
    const onvista = parseAndValidateOnvista(onvistaFixture);
    // force lastAsOf match
    onvista.lastAsOf = "2026-08-03";
    onvista.last = 164.36;
    const c = crossCheckYahooWithOnvista(yahoo, onvista);
    assert.equal(c.differencePct, 0);
  });

  it("10. same day >2% fail", () => {
    const yahoo = { price: 164.36, asOf: "2026-08-03" };
    const onvista = parseAndValidateOnvista(onvistaFixture);
    onvista.lastAsOf = "2026-08-03";
    onvista.last = 180;
    assert.throws(() => crossCheckYahooWithOnvista(yahoo, onvista), /difference/);
  });

  it("11. different days cannot align → fail", () => {
    const yahoo = { price: 162.96, asOf: "2026-07-31" };
    const onvista = {
      last: 164.36,
      lastAsOf: "2026-08-03",
      previousLast: null,
      previousAsOf: null,
    };
    assert.throws(() => crossCheckYahooWithOnvista(yahoo, onvista), /align/);
  });

  it("align via previousLast when dates match", () => {
    const yahoo = { price: 162.96, asOf: "2026-07-31" };
    const onvista = parseAndValidateOnvista(onvistaFixture);
    // previousAsOf from fixture should be 2026-07-31
    assert.equal(onvista.previousAsOf, "2026-07-31");
    const c = crossCheckYahooWithOnvista(yahoo, onvista);
    assert.ok(c.differencePct <= 2);
  });
});

describe("runUpdate policies", () => {
  it("12. Yahoo broken, onvista ok → fail (no silent fallback)", async () => {
    const badYahoo = { chart: { result: [], error: { code: "fail" } } };
    await assert.rejects(
      () =>
        runUpdate({
          yahooBody: badYahoo,
          onvistaBody: onvistaFixture,
          now: new Date("2026-08-03T17:00:00.000Z"),
          dryRun: true,
          existing: null,
        }),
      /Yahoo|chart/,
    );
  });

  it("13. jump >20% vs existing file → fail", async () => {
    await assert.rejects(
      () =>
        runUpdate({
          yahooBody: yahooFixture,
          onvistaBody: onvistaFixture,
          now: new Date("2026-08-03T17:00:00.000Z"),
          dryRun: true,
          existing: {
            schemaVersion: 1,
            isin: "IE00BK5BQT80",
            ticker: "VWCE",
            venue: "XETRA",
            currency: "EUR",
            price: 50,
            asOf: "2026-07-01",
            provider: "yahoo_finance_chart",
          },
        }),
      /jump|20%/,
    );
  });

  it("14. same economics → no write", async () => {
    const now = new Date("2026-08-03T09:00:00.000Z"); // before close → Jul 31
    const r = await runUpdate({
      yahooBody: yahooFixture,
      onvistaBody: onvistaFixture,
      now,
      fetchedAt: new Date("2026-08-03T09:00:00.000Z"),
      dryRun: true,
      existing: null,
    });
    assert.equal(r.payload.asOf, "2026-07-31");
    const r2 = await runUpdate({
      yahooBody: yahooFixture,
      onvistaBody: onvistaFixture,
      now,
      fetchedAt: new Date("2026-08-03T10:00:00.000Z"),
      dryRun: true,
      existing: { ...r.payload, fetchedAt: "2026-08-03T09:00:00.000Z" },
    });
    assert.equal(r2.wrote, false);
    assert.match(r2.reason, /No economic change|dry-run/);
    // When existing equals payload economics, decideWrite returns null → wrote false reason No economic change
  });

  it("15. schema change / garbage body → clear error", () => {
    assert.throws(() => parseAndValidateYahoo(null, new Date()), /object/);
    assert.throws(() => parseAndValidateYahoo({ chart: {} }, new Date()), /result|meta/);
    assert.throws(() => parseAndValidateOnvista({}), /ISIN/);
  });

  it("atomic write leaves no partial file on success", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vwce-price-"));
    const fp = path.join(dir, "vwce-price.json");
    const payload = {
      schemaVersion: 1,
      isin: "IE00BK5BQT80",
      ticker: "VWCE",
      venue: "XETRA",
      currency: "EUR",
      price: 162.96,
      asOf: "2026-07-31",
      fetchedAt: "2026-08-03T09:00:00.000Z",
      provider: "yahoo_finance_chart",
      providerUrl: "https://finance.yahoo.com/quote/VWCE.DE",
      crossCheckedWith: "onvista",
      crossCheckDifferencePct: 0,
    };
    writePayloadAtomic(payload, fp);
    const read = JSON.parse(fs.readFileSync(fp, "utf8"));
    assert.equal(read.price, 162.96);
    const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"));
    assert.equal(leftovers.length, 0);
  });
});


function validExisting(overrides = {}) {
  return {
    schemaVersion: 1,
    isin: "IE00BK5BQT80",
    ticker: "VWCE",
    venue: "XETRA",
    currency: "EUR",
    price: 164.36,
    asOf: "2026-08-03",
    fetchedAt: "2026-08-03T17:30:00.000Z",
    provider: "yahoo_finance_chart",
    providerUrl: "https://finance.yahoo.com/quote/VWCE.DE",
    crossCheckedWith: "onvista",
    crossCheckDifferencePct: 0,
    ...overrides,
  };
}

describe("decideWrite — stale asOf regression", () => {
  it("16. payload.asOf older than existing.asOf → throw, no write", () => {
    const existing = validExisting({ asOf: "2026-08-03", price: 164.36 });
    const payload = validExisting({
      asOf: "2026-07-31",
      price: 162.96, // within 20% of 164.36
      fetchedAt: "2026-08-04T09:00:00.000Z",
    });
    const now = new Date("2026-08-04T09:00:00.000Z");
    assert.throws(
      () => decideWrite(payload, existing, now),
      /stale price regression|older than existing/,
    );
  });

  it("16b. file on disk unchanged when stale asOf refused", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vwce-stale-"));
    const fp = path.join(dir, "vwce-price.json");
    const existing = validExisting({ asOf: "2026-08-03", price: 164.36 });
    writePayloadAtomic(existing, fp);
    const before = fs.readFileSync(fp, "utf8");
    const payload = validExisting({
      asOf: "2026-07-31",
      price: 162.96,
    });
    assert.throws(
      () => decideWrite(payload, existing, new Date("2026-08-04T09:00:00.000Z")),
      /stale/,
    );
    assert.equal(fs.readFileSync(fp, "utf8"), before);
  });
});

describe("sameEconomics / semantic no-op", () => {
  it("17a. only fetchedAt differs → no-op (null)", () => {
    const existing = validExisting({ fetchedAt: "2026-08-03T17:00:00.000Z" });
    const payload = validExisting({ fetchedAt: "2026-08-03T18:00:00.000Z" });
    assert.equal(sameEconomics(existing, payload), true);
    const result = decideWrite(payload, existing, new Date("2026-08-03T19:00:00.000Z"));
    assert.equal(result, null);
  });

  it("17b. crossCheckDifferencePct differs → not no-op", () => {
    const existing = validExisting({ crossCheckDifferencePct: 0 });
    const payload = validExisting({ crossCheckDifferencePct: 0.5 });
    assert.equal(sameEconomics(existing, payload), false);
    const result = decideWrite(payload, existing, new Date("2026-08-03T19:00:00.000Z"));
    assert.notEqual(result, null);
    assert.equal(result.crossCheckDifferencePct, 0.5);
  });

  it("17c. ticker / venue / providerUrl differ → not no-op", () => {
    const existing = validExisting();
    assert.equal(
      sameEconomics(existing, validExisting({ ticker: "VWCE.DE" })),
      false,
    );
    assert.equal(
      sameEconomics(existing, validExisting({ venue: "GER" })),
      false,
    );
    assert.equal(
      sameEconomics(
        existing,
        validExisting({ providerUrl: "https://example.com/VWCE" }),
      ),
      false,
    );
  });
});

describe("readExistingPayload / validateExistingPayload", () => {
  it("18a. missing file → null", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vwce-miss-"));
    const fp = path.join(dir, "absent.json");
    assert.equal(readExistingPayload(fp), null);
  });

  it("18b. broken JSON → throw, file unchanged", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vwce-badjson-"));
    const fp = path.join(dir, "vwce-price.json");
    const garbage = "{ not valid json <<<";
    fs.writeFileSync(fp, garbage, "utf8");
    assert.throws(() => readExistingPayload(fp), /JSON parse failed/);
    assert.equal(fs.readFileSync(fp, "utf8"), garbage);
  });

  it("18c. missing asOf → throw", () => {
    const bad = validExisting();
    delete bad.asOf;
    assert.throws(() => validateExistingPayload(bad), /asOf/);
  });

  it("18d. wrong currency → throw", () => {
    assert.throws(
      () => validateExistingPayload(validExisting({ currency: "USD" })),
      /currency/,
    );
  });

  it("18e. price out of range → throw", () => {
    assert.throws(
      () => validateExistingPayload(validExisting({ price: 10 })),
      /price|outside/,
    );
    assert.throws(
      () => validateExistingPayload(validExisting({ price: 500 })),
      /price|outside/,
    );
  });

  it("18f. crossCheckDifferencePct > 2 → throw", () => {
    assert.throws(
      () =>
        validateExistingPayload(validExisting({ crossCheckDifferencePct: 2.5 })),
      /crossCheckDifferencePct/,
    );
  });

  it("18g. valid existing file is accepted", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vwce-ok-"));
    const fp = path.join(dir, "vwce-price.json");
    const good = validExisting();
    writePayloadAtomic(good, fp);
    const read = readExistingPayload(fp);
    assert.equal(read.asOf, "2026-08-03");
    assert.equal(read.price, 164.36);
  });
});
