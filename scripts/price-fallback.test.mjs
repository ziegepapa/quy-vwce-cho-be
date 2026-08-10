/**
 * PRICE-FALLBACK-001 + PRICE-SOURCE-FRESHEST-001 provider behaviour.
 * Run: node --test scripts/price-fallback.test.mjs
 *
 * Covered branches:
 *   cross-check unreadable       -> keep the primary price, drop the stamp
 *   cross-check disagrees        -> refuse to write
 *   provider adapters            -> table driven, no hardcoded id checks
 *   primary down                 -> onvista becomes the recorded source
 *   primary stale but valid      -> the fresher closed onvista session wins
 *   before close                 -> neither source may promote today's quote
 *   every source down            -> keep the previous quote, no empty feed
 * Plus: the three decideQuoteWrite gates still apply to fallback quotes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeJsonAtomic } from "./price/contract.mjs";
import { loadRegistry } from "./price/registry.mjs";
import {
  decideQuoteWrite,
  getPrimaryAdapter,
  resolveInstrumentQuote,
  resolvePriceSourceChain,
  runMultiAssetUpdate,
  OrchestratorError,
} from "./price/orchestrator.mjs";
import { parseYahooChart } from "./price/providers/yahoo.mjs";
import { ONVISTA_MISMATCH } from "./price/providers/onvista.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const REGISTRY = path.join(REPO_ROOT, "scripts", "price-instruments.json");
const FIX_YAHOO = path.join(__dirname, "fixtures", "yahoo-vwce.json");

// 19:00 Europe/Berlin — the XETRA session is closed, so today is usable.
const AFTER_CLOSE = new Date("2026-08-03T17:00:00.000Z");
// 11:00 Europe/Berlin — mid session, today must not be used.
const PRE_CLOSE = new Date("2026-08-03T09:00:00.000Z");
const FETCHED_AT = new Date("2026-08-03T17:05:00.000Z");
const MONDAY_AFTER_CLOSE = new Date("2026-08-10T17:00:00.000Z");
const MONDAY_PRE_CLOSE = new Date("2026-08-10T14:30:00.000Z");

function vwce() {
  const reg = loadRegistry(REGISTRY);
  const inst = reg.liveEnabled.find((i) => i.isin === "IE00BK5BQT80");
  assert.ok(inst, "VWCE must be a live registry instrument");
  return inst;
}

function yahooFixture() {
  return JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
}

function yahooBodyForSession({ asOf, close }) {
  return {
    chart: {
      error: null,
      result: [
        {
          meta: {
            symbol: "VWCE.DE",
            currency: "EUR",
            fullExchangeName: "XETRA",
            exchangeName: "GER",
            instrumentType: "ETF",
            longName: "Vanguard FTSE All-World UCITS ETF USD Accumulating",
          },
          timestamp: [Date.parse(`${asOf}T16:30:00.000Z`) / 1000],
          indicators: { quote: [{ close: [close] }] },
        },
      ],
    },
  };
}

/** What the Yahoo adapter makes of the fixture, so tests never hardcode a price. */
function yahooExpected() {
  return parseYahooChart(yahooFixture(), AFTER_CLOSE, vwce());
}

/** Structurally valid onvista snapshot body. */
function onvistaBody({
  last,
  previousLast = null,
  datetimeLast = "2026-08-03T17:35:00+02:00",
  datetimePreviousLast =
    previousLast == null ? null : "2026-07-31T17:35:00+02:00",
}) {
  return {
    instrument: { isin: "IE00BK5BQT80" },
    quoteList: {
      list: [
        {
          market: { name: "Xetra", codeExchange: "GER" },
          isoCurrency: "EUR",
          last,
          previousLast,
          datetimeLast,
          datetimePreviousLast,
        },
      ],
    },
  };
}

const BROKEN_YAHOO = {
  chart: { error: { code: "Not Found", description: "No data found" } },
};
const BROKEN_ONVISTA = { instrument: { isin: "XX0000000000" } };

function tmpWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-fallback-"));
  return {
    quotesPath: path.join(dir, "quotes.json"),
    legacyPath: path.join(dir, "vwce-price.json"),
  };
}

function priorRow(price, asOf) {
  return {
    instrumentIsin: "IE00BK5BQT80",
    currency: "EUR",
    venue: "XETRA",
    price,
    asOf,
    fetchedAt: "2026-08-01T18:00:00.000Z",
    source: "auto",
    provider: "yahoo_finance_chart",
    providerUrl: "https://finance.yahoo.com/quote/VWCE.DE",
    crossCheckedWith: "onvista",
    crossCheckDifferencePct: 0,
  };
}

describe("FIX_2 — price sources come from an adapter table", () => {
  it("every supported provider id has an adapter, unknown ids have none", () => {
    assert.ok(getPrimaryAdapter("yahoo_finance_chart"));
    assert.ok(getPrimaryAdapter("onvista"));
    assert.equal(getPrimaryAdapter("not_a_real_provider"), null);
    assert.equal(getPrimaryAdapter(undefined), null);
  });

  it("VWCE chain is Yahoo first with onvista on standby", () => {
    const chain = resolvePriceSourceChain(vwce());
    assert.deepEqual(
      chain.map((c) => c.cfg.id),
      ["yahoo_finance_chart", "onvista"],
    );
    assert.equal(chain[0].role, "primary");
    assert.equal(chain[1].role, "fallback");
  });

  it("a provider without an adapter never joins the chain", () => {
    const chain = resolvePriceSourceChain({
      isin: "IE00BK5BQT80",
      primaryProvider: { id: "mystery_feed", url: "https://example.test/x" },
      crossCheckProvider: null,
    });
    assert.equal(chain.length, 0);
  });
});

describe("FIX_1 — an unreadable cross-check no longer kills the price", () => {
  it("keeps the primary price and drops the cross-check stamp", async () => {
    const expected = yahooExpected();
    const resolved = await resolveInstrumentQuote(vwce(), {
      now: AFTER_CLOSE,
      fetchedAt: FETCHED_AT,
      yahooBody: yahooFixture(),
      onvistaBody: BROKEN_ONVISTA,
    });
    assert.equal(resolved.provider, "yahoo_finance_chart");
    assert.equal(resolved.price, expected.price);
    assert.equal(resolved.asOf, expected.asOf);
    assert.equal(resolved.crossCheckedWith, undefined);
    assert.equal(resolved.crossCheckDifferencePct, undefined);
    assert.equal(resolved.degraded, true);
    assert.ok(resolved.warnings.some((w) => /cross-check/i.test(w)));
  });

  it("a genuine disagreement still refuses the quote", async () => {
    const expected = yahooExpected();
    await assert.rejects(
      () =>
        resolveInstrumentQuote(vwce(), {
          now: AFTER_CLOSE,
          fetchedAt: FETCHED_AT,
          yahooBody: yahooFixture(),
          onvistaBody: onvistaBody({ last: expected.price * 1.5 }),
        }),
      (e) => e.code === ONVISTA_MISMATCH,
    );
  });
});

describe("PRICE-SOURCE-FRESHEST-001 — newest closed session wins", () => {
  it("promotes onvista when Yahoo is valid but one closed session behind", async () => {
    const resolved = await resolveInstrumentQuote(vwce(), {
      now: MONDAY_AFTER_CLOSE,
      fetchedAt: new Date("2026-08-10T17:05:00.000Z"),
      yahooBody: yahooBodyForSession({ asOf: "2026-08-07", close: 168.38 }),
      onvistaBody: onvistaBody({
        last: 169.12,
        previousLast: 168.38,
        datetimeLast: "2026-08-10T18:05:00+02:00",
        datetimePreviousLast: "2026-08-07T17:35:00+02:00",
      }),
    });

    assert.equal(resolved.provider, "onvista");
    assert.equal(resolved.price, 169.12);
    assert.equal(resolved.asOf, "2026-08-10");
    assert.equal(resolved.crossCheckedWith, undefined);
    assert.equal(resolved.degraded, true);
    assert.ok(resolved.warnings.some((w) => /newer than yahoo/i.test(w)));
  });

  it("before close refuses today's onvista quote and keeps the shared Friday session", async () => {
    const resolved = await resolveInstrumentQuote(vwce(), {
      now: MONDAY_PRE_CLOSE,
      fetchedAt: new Date("2026-08-10T14:35:00.000Z"),
      yahooBody: yahooBodyForSession({ asOf: "2026-08-07", close: 168.38 }),
      onvistaBody: onvistaBody({
        last: 169.12,
        previousLast: 168.38,
        datetimeLast: "2026-08-10T16:20:00+02:00",
        datetimePreviousLast: "2026-08-07T17:35:00+02:00",
      }),
    });

    assert.equal(resolved.provider, "yahoo_finance_chart");
    assert.equal(resolved.price, 168.38);
    assert.equal(resolved.asOf, "2026-08-07");
    assert.equal(resolved.crossCheckedWith, "onvista");
    assert.equal(resolved.degraded, false);
  });
});

describe("FIX_3 — onvista takes over when Yahoo is down", () => {
  it("records onvista as the real source with a real url", async () => {
    const inst = vwce();
    const resolved = await resolveInstrumentQuote(inst, {
      now: AFTER_CLOSE,
      fetchedAt: FETCHED_AT,
      yahooBody: BROKEN_YAHOO,
      onvistaBody: onvistaBody({ last: 164.5 }),
    });
    assert.equal(resolved.provider, "onvista");
    assert.equal(resolved.price, 164.5);
    assert.equal(resolved.asOf, "2026-08-03");
    assert.equal(resolved.providerUrl, inst.crossCheckProvider.url);
    assert.ok(resolved.providerUrl.startsWith("https://"));
    assert.equal(resolved.venue, "XETRA");
    assert.equal(resolved.source, "auto");
    // A source may never validate itself.
    assert.equal(resolved.crossCheckedWith, undefined);
    assert.equal(resolved.degraded, true);
    assert.ok(resolved.warnings.some((w) => /yahoo/i.test(w)));
  });

  it("before the local close the fallback uses the previous session", async () => {
    const resolved = await resolveInstrumentQuote(vwce(), {
      now: PRE_CLOSE,
      fetchedAt: FETCHED_AT,
      yahooBody: BROKEN_YAHOO,
      onvistaBody: onvistaBody({ last: 164.5, previousLast: 163.2 }),
    });
    assert.equal(resolved.price, 163.2);
    assert.equal(resolved.asOf, "2026-07-31");
  });

  it("a fallback price outside the instrument band is refused", async () => {
    await assert.rejects(
      () =>
        resolveInstrumentQuote(vwce(), {
          now: AFTER_CLOSE,
          fetchedAt: FETCHED_AT,
          yahooBody: BROKEN_YAHOO,
          onvistaBody: onvistaBody({ last: 900 }),
        }),
      OrchestratorError,
    );
  });
});

describe("FIX_4 — every source down keeps the previous quote", () => {
  it("writes nothing, says why, and leaves the file untouched", async () => {
    const { quotesPath, legacyPath } = tmpWorkspace();
    writeJsonAtomic(
      {
        schemaVersion: 2,
        generatedAt: "2026-08-01T18:00:00.000Z",
        quotes: [priorRow(160, "2026-07-31")],
      },
      quotesPath,
    );

    const result = await runMultiAssetUpdate({
      quotesPath,
      legacyPath,
      registryPath: REGISTRY,
      now: AFTER_CLOSE,
      fetchedAt: FETCHED_AT,
      bodiesByIsin: {
        IE00BK5BQT80: { yahooBody: BROKEN_YAHOO, onvistaBody: BROKEN_ONVISTA },
      },
    });

    assert.equal(result.wrote, false);
    assert.equal(result.degraded, true);
    assert.match(result.reason, /All price sources failed/i);
    assert.equal(result.errors.length, 1);
    assert.equal(result.quotesDoc.quotes.length, 1);
    assert.equal(result.quotesDoc.quotes[0].price, 160);

    const onDisk = JSON.parse(fs.readFileSync(quotesPath, "utf8"));
    assert.equal(onDisk.quotes[0].price, 160);
    assert.equal(onDisk.quotes[0].asOf, "2026-07-31");
    assert.equal(fs.existsSync(legacyPath), false);
  });

  it("a healthy run still reports the ordinary quiet day differently", async () => {
    const { quotesPath, legacyPath } = tmpWorkspace();
    const opts = {
      quotesPath,
      legacyPath,
      registryPath: REGISTRY,
      now: AFTER_CLOSE,
      fetchedAt: FETCHED_AT,
      bodiesByIsin: {
        IE00BK5BQT80: {
          yahooBody: yahooFixture(),
          onvistaBody: BROKEN_ONVISTA,
        },
      },
    };
    const first = await runMultiAssetUpdate(opts);
    assert.equal(first.wrote, true);
    const second = await runMultiAssetUpdate(opts);
    assert.equal(second.wrote, false);
    assert.equal(second.degraded, false);
    assert.match(second.reason, /No economic change/i);
  });
});

describe("write gates still apply to a fallback quote", () => {
  const inst = {
    isin: "IE00BK5BQT80",
    currency: "EUR",
    maxDayChangePct: 20,
    closeHourLocal: 18,
    timezone: "Europe/Berlin",
  };
  const existing = priorRow(164.36, "2026-08-03");

  function fallbackRow(overrides) {
    return {
      ...existing,
      provider: "onvista",
      providerUrl: "https://api.onvista.de/api/v1/funds/ISIN:IE00BK5BQT80/snapshot",
      crossCheckedWith: undefined,
      crossCheckDifferencePct: undefined,
      ...overrides,
    };
  }

  it("switching source at the same price is an honest economic change", () => {
    const decided = decideQuoteWrite(fallbackRow({}), existing, inst, PRE_CLOSE);
    assert.ok(decided);
    assert.equal(decided.provider, "onvista");
    assert.equal(decided.price, 164.36);
  });

  it("gate 1 — an asOf regression is still refused", () => {
    assert.throws(
      () =>
        decideQuoteWrite(
          fallbackRow({ asOf: "2026-08-01", price: 164 }),
          existing,
          inst,
          AFTER_CLOSE,
        ),
      OrchestratorError,
    );
  });

  it("gate 2 — a jump beyond maxDayChangePct is still refused", () => {
    assert.throws(
      () =>
        decideQuoteWrite(
          fallbackRow({ asOf: "2026-08-04", price: 240 }),
          existing,
          inst,
          new Date("2026-08-04T17:00:00.000Z"),
        ),
      /jump/,
    );
  });

  it("gate 3 — a same-day pre-close move beyond 3% is still refused", () => {
    assert.throws(
      () => decideQuoteWrite(fallbackRow({ price: 175 }), existing, inst, PRE_CLOSE),
      /pre-close/,
    );
  });
});
