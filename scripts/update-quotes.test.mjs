/**
 * Multi-asset quote feed v2 tests — node:test.
 * Run: node --test scripts/update-quotes.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ContractError,
  validateQuoteRow,
  validateQuotesDocument,
  readExistingQuotes,
  sameQuoteEconomics,
  sameDocumentEconomics,
  legacyV1ToQuoteRow,
  quoteRowToLegacyV1,
  writeJsonAtomic,
} from "./price/contract.mjs";
import { isValidIsin, normalizeIsin } from "./price/isin.mjs";
import { loadRegistry, quoteKey, RegistryError } from "./price/registry.mjs";
import {
  decideQuoteWrite,
  runMultiAssetUpdate,
  resolveInstrumentQuote,
  OrchestratorError,
  fetchJson,
} from "./price/orchestrator.mjs";
import { parseYahooChart, selectClosedBar } from "./price/providers/yahoo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const REGISTRY = path.join(REPO_ROOT, "scripts", "price-instruments.json");
const FIX_YAHOO = path.join(__dirname, "fixtures", "yahoo-vwce.json");
const FIX_ONVISTA = path.join(__dirname, "fixtures", "onvista-vwce.json");
const FIX_YAHOO_VGLA = path.join(__dirname, "fixtures", "yahoo-vgla.json");
const FIX_ONVISTA_VGLA = path.join(__dirname, "fixtures", "onvista-vgla.json");

function tmpWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-v2-"));
  return {
    dir,
    quotesPath: path.join(dir, "quotes.json"),
    legacyPath: path.join(dir, "vwce-price.json"),
    // History dir (per-ISIN <ISIN>.json files) — keeps tests hermetic so
    // runMultiAssetUpdate never writes into the real price-history dir.
    historyPath: dir,
  };
}

function vglaBodies() {
  return {
    yahooBody: JSON.parse(fs.readFileSync(FIX_YAHOO_VGLA, "utf8")),
    onvistaBody: JSON.parse(fs.readFileSync(FIX_ONVISTA_VGLA, "utf8")),
  };
}

function sampleRow(overrides = {}) {
  return {
    instrumentIsin: "IE00BK5BQT80",
    currency: "EUR",
    venue: "XETRA",
    price: 165.1,
    asOf: "2026-08-03",
    fetchedAt: new Date().toISOString(),
    source: "auto",
    provider: "yahoo_finance_chart",
    providerUrl: "https://finance.yahoo.com/quote/VWCE.DE",
    crossCheckedWith: "onvista",
    crossCheckDifferencePct: 0,
    ...overrides,
  };
}

describe("ISIN helpers", () => {
  it("accepts VWCE and Amundi checksums", () => {
    assert.equal(normalizeIsin("ie00bk5bqt80"), "IE00BK5BQT80");
    assert.equal(isValidIsin("IE00BK5BQT80"), true);
    assert.equal(isValidIsin("FR0010315770"), true);
    assert.equal(isValidIsin("IE00BK5BQT81"), false);
  });
});

describe("quotes.json contract schema 2", () => {
  it("accepts valid document", () => {
    const doc = validateQuotesDocument({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      quotes: [sampleRow()],
    });
    assert.equal(doc.quotes.length, 1);
  });

  it("rejects duplicate ISIN/currency", () => {
    assert.throws(
      () =>
        validateQuotesDocument({
          schemaVersion: 2,
          generatedAt: new Date().toISOString(),
          quotes: [sampleRow(), sampleRow({ price: 166 })],
        }),
      /Duplicate/,
    );
  });

  it("rejects bad checksum ISIN", () => {
    assert.throws(
      () => validateQuoteRow(sampleRow({ instrumentIsin: "IE00BK5BQT81" })),
      /checksum/,
    );
  });

  it("rejects invalid date, NaN, Infinity, zero, negative", () => {
    assert.throws(() => validateQuoteRow(sampleRow({ asOf: "not-a-date" })), /asOf/);
    assert.throws(() => validateQuoteRow(sampleRow({ price: NaN })), /price/);
    assert.throws(() => validateQuoteRow(sampleRow({ price: Infinity })), /price/);
    assert.throws(() => validateQuoteRow(sampleRow({ price: 0 })), /price/);
    assert.throws(() => validateQuoteRow(sampleRow({ price: -1 })), /price/);
  });

  it("rejects non-auto source", () => {
    assert.throws(() => validateQuoteRow(sampleRow({ source: "manual" })), /auto/);
  });

  it("deterministic ordering by ISIN then currency", () => {
    const doc = validateQuotesDocument({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      quotes: [
        sampleRow({ instrumentIsin: "FR0010315770", price: 50 }),
        sampleRow({ instrumentIsin: "IE00BK5BQT80", price: 165 }),
      ],
    });
    assert.equal(doc.quotes[0].instrumentIsin, "FR0010315770");
    assert.equal(doc.quotes[1].instrumentIsin, "IE00BK5BQT80");
  });

  it("malformed existing file fail closed", () => {
    const { quotesPath } = tmpWorkspace();
    fs.writeFileSync(quotesPath, "{broken", "utf8");
    assert.throws(() => readExistingQuotes(quotesPath), ContractError);
  });
});

describe("two ISIN independence", () => {
  it("two keys do not overwrite each other in document", () => {
    const doc = validateQuotesDocument({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      quotes: [
        sampleRow({ price: 100 }),
        sampleRow({ instrumentIsin: "FR0010315770", price: 50 }),
      ],
    });
    assert.equal(doc.quotes.length, 2);
    assert.equal(doc.quotes.find((q) => q.instrumentIsin === "IE00BK5BQT80").price, 100);
    assert.equal(doc.quotes.find((q) => q.instrumentIsin === "FR0010315770").price, 50);
  });
});

describe("per-instrument policies", () => {
  const inst = {
    isin: "IE00BK5BQT80",
    currency: "EUR",
    maxDayChangePct: 8,
    closeHourLocal: 18,
    timezone: "Europe/Berlin",
  };

  it("stale asOf regression blocked per ISIN", () => {
    const existing = sampleRow({ asOf: "2026-08-02", price: 100 });
    const next = sampleRow({ asOf: "2026-08-01", price: 99 });
    assert.throws(
      () => decideQuoteWrite(next, existing, inst, new Date("2026-08-03T18:00:00Z")),
      OrchestratorError,
    );
  });

  it("jump policy uses instrument maxDayChangePct", () => {
    const existing = sampleRow({ asOf: "2026-08-01", price: 100 });
    const next = sampleRow({ asOf: "2026-08-03", price: 120 });
    assert.throws(
      () => decideQuoteWrite(next, existing, inst, new Date("2026-08-03T18:00:00Z")),
      /jump/,
    );
  });

  it("independent range: other instrument allows different band", () => {
    const other = {
      isin: "FR0010315770",
      currency: "EUR",
      maxDayChangePct: 25,
      closeHourLocal: 18,
      timezone: "Europe/Berlin",
    };
    const existing = sampleRow({
      instrumentIsin: "FR0010315770",
      asOf: "2026-08-01",
      price: 100,
    });
    const next = sampleRow({
      instrumentIsin: "FR0010315770",
      asOf: "2026-08-03",
      price: 120,
    });
    const decided = decideQuoteWrite(next, existing, other, new Date("2026-08-03T18:00:00Z"));
    assert.equal(decided.price, 120);
  });

  it("semantic no-op does not change economics", () => {
    const a = sampleRow({ fetchedAt: "2026-08-03T10:00:00.000Z" });
    const b = sampleRow({ fetchedAt: "2026-08-03T12:00:00.000Z" });
    assert.equal(sameQuoteEconomics(a, b), true);
    assert.equal(
      sameDocumentEconomics(
        { schemaVersion: 2, generatedAt: "a", quotes: [a] },
        { schemaVersion: 2, generatedAt: "b", quotes: [b] },
      ),
      true,
    );
  });
});

describe("provider isolation in runMultiAssetUpdate", () => {
  it("one provider failure keeps prior quote and other assets", async () => {
    const { quotesPath, legacyPath, historyPath } = tmpWorkspace();
    const prior = {
      schemaVersion: 2,
      generatedAt: "2026-08-01T18:00:00.000Z",
      quotes: [
        sampleRow({ price: 160, asOf: "2026-08-01" }),
        sampleRow({
          instrumentIsin: "FR0010315770",
          price: 50,
          asOf: "2026-08-01",
          providerUrl: "https://example.test/x",
        }),
      ],
    };
    writeJsonAtomic(prior, quotesPath);

    const yahooBody = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    const onvistaBody = JSON.parse(fs.readFileSync(FIX_ONVISTA, "utf8"));

    const result = await runMultiAssetUpdate({
      quotesPath,
      legacyPath,
      historyPath,
      registryPath: REGISTRY,
      includeTestOnly: true,
      now: new Date("2026-08-03T17:00:00.000Z"),
      fetchedAt: new Date("2026-08-03T17:05:00.000Z"),
      bodiesByIsin: {
        IE00BK5BQT80: { yahooBody, onvistaBody },
        IE000VAHT5T0: vglaBodies(),
        // test-only intentionally missing bodies → failure → keep prior
      },
    });

    assert.ok(result.quotesDoc);
    const map = new Map(
      result.quotesDoc.quotes.map((q) => [quoteKey(q.instrumentIsin, q.currency), q]),
    );
    assert.ok(map.has("IE00BK5BQT80|EUR"));
    assert.ok(map.has("IE000VAHT5T0|EUR"));
    assert.ok(map.has("FR0010315770|EUR"));
    assert.equal(map.get("FR0010315770|EUR").price, 50);
    assert.ok(result.errors.some((e) => e.isin === "FR0010315770"));
  });

  it("fixture VWCE resolve writes both quotes.json and legacy mirror", async () => {
    const { quotesPath, legacyPath, historyPath } = tmpWorkspace();
    const yahooBody = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    const onvistaBody = JSON.parse(fs.readFileSync(FIX_ONVISTA, "utf8"));
    const result = await runMultiAssetUpdate({
      quotesPath,
      legacyPath,
      historyPath,
      registryPath: REGISTRY,
      now: new Date("2026-08-03T17:00:00.000Z"),
      fetchedAt: new Date("2026-08-03T17:05:00.000Z"),
      bodiesByIsin: {
        IE00BK5BQT80: { yahooBody, onvistaBody },
        IE000VAHT5T0: vglaBodies(),
      },
    });
    assert.equal(result.wrote, true);
    assert.equal(result.legacyWrote, true);
    const doc = JSON.parse(fs.readFileSync(quotesPath, "utf8"));
    assert.equal(doc.schemaVersion, 2);
    // Quotes sort by ISIN: VGLA (IE000VAHT5T0) sorts before VWCE (IE00BK5BQT80).
    const vwceRow = doc.quotes.find((q) => q.instrumentIsin === "IE00BK5BQT80");
    assert.ok(vwceRow);
    const leg = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    assert.equal(leg.schemaVersion, 1);
    assert.equal(leg.isin, "IE00BK5BQT80");
    assert.equal(leg.ticker, "VWCE");
  });

  it("second write with same economics is no-op", async () => {
    const { quotesPath, legacyPath, historyPath } = tmpWorkspace();
    const yahooBody = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    const onvistaBody = JSON.parse(fs.readFileSync(FIX_ONVISTA, "utf8"));
    const opts = {
      quotesPath,
      legacyPath,
      historyPath,
      registryPath: REGISTRY,
      now: new Date("2026-08-03T17:00:00.000Z"),
      fetchedAt: new Date("2026-08-03T17:05:00.000Z"),
      bodiesByIsin: {
        IE00BK5BQT80: { yahooBody, onvistaBody },
        IE000VAHT5T0: vglaBodies(),
      },
    };
    const first = await runMultiAssetUpdate(opts);
    assert.equal(first.wrote, true);
    const second = await runMultiAssetUpdate({
      ...opts,
      fetchedAt: new Date("2026-08-03T18:00:00.000Z"),
    });
    assert.equal(second.wrote, false);
    assert.match(second.reason || "", /No economic change|economic/i);
  });
});

describe("legacy compatibility", () => {
  it("v1 ↔ v2 round-trip preserves economics", () => {
    const q = sampleRow();
    const v1 = quoteRowToLegacyV1(q);
    assert.equal(v1.schemaVersion, 1);
    const back = legacyV1ToQuoteRow(v1);
    assert.equal(back.instrumentIsin, q.instrumentIsin);
    assert.equal(back.price, q.price);
    assert.equal(back.asOf, q.asOf);
  });
});

describe("registry", () => {
  it("live registry includes VWCE with explicit provider symbol", () => {
    const reg = loadRegistry(REGISTRY);
    const vwce = reg.liveEnabled.find((i) => i.isin === "IE00BK5BQT80");
    assert.ok(vwce);
    assert.equal(vwce.primaryProvider.symbol, "VWCE.DE");
  });
  it("live registry includes VGLA (VALL) with its own guards, not VWCE's", () => {
    const reg = loadRegistry(REGISTRY);
    const vgla = reg.liveEnabled.find((i) => i.isin === "IE000VAHT5T0");
    assert.ok(vgla, "VGLA must be a live registry instrument");
    assert.equal(vgla.ticker, "VGLA");
    assert.equal(vgla.primaryProvider.symbol, "VGLA.DE");
    assert.equal(
      vgla.primaryProvider.url,
      "https://query1.finance.yahoo.com/v8/finance/chart/VGLA.DE?interval=1d&range=10d",
    );
    assert.equal(
      vgla.crossCheckProvider.url,
      "https://api.onvista.de/api/v1/funds/ISIN:IE000VAHT5T0/snapshot",
    );
    // VGLA trades near 4.45 € — VWCE's 20–400 band would reject it outright.
    assert.equal(vgla.priceMin, 1);
    assert.equal(vgla.priceMax, 50);
    assert.deepEqual(vgla.primaryProvider.longNameMustInclude, [
      "vanguard",
      "ftse",
      "global",
      "all-cap",
    ]);
  });
  it("test-only second ISIN is not live", () => {
    const reg = loadRegistry(REGISTRY, { includeTestOnly: true });
    assert.ok(reg.testOnlyInstruments.some((i) => i.isin === "FR0010315770"));
    assert.ok(!reg.liveEnabled.some((i) => i.isin === "FR0010315770"));
  });
});

describe("VGLA (VALL) fixture", () => {
  it("parseYahooChart validates VGLA fixture at ~4.45 €", () => {
    const body = JSON.parse(fs.readFileSync(FIX_YAHOO_VGLA, "utf8"));
    const reg = loadRegistry(REGISTRY);
    const vgla = reg.liveEnabled.find((i) => i.isin === "IE000VAHT5T0");
    const y = parseYahooChart(body, new Date("2026-08-03T17:00:00Z"), vgla);
    assert.equal(y.asOf, "2026-08-03");
    assert.equal(y.price, 4.45);
  });

  it("VGLA resolves with Yahoo primary + onvista cross-check at diff 0", async () => {
    const yahooBody = JSON.parse(fs.readFileSync(FIX_YAHOO_VGLA, "utf8"));
    const onvistaBody = JSON.parse(fs.readFileSync(FIX_ONVISTA_VGLA, "utf8"));
    const reg = loadRegistry(REGISTRY);
    const vgla = reg.liveEnabled.find((i) => i.isin === "IE000VAHT5T0");
    const resolved = await resolveInstrumentQuote(vgla, {
      now: new Date("2026-08-03T17:00:00.000Z"),
      fetchedAt: new Date("2026-08-03T17:05:00.000Z"),
      yahooBody,
      onvistaBody,
    });
    assert.equal(resolved.provider, "yahoo_finance_chart");
    assert.equal(resolved.price, 4.45);
    assert.equal(resolved.asOf, "2026-08-03");
    assert.equal(resolved.crossCheckedWith, "onvista");
    assert.equal(resolved.crossCheckDifferencePct, 0);
    assert.equal(resolved.degraded, false);
  });

  it("VWCE guards would reject a 4.45 € close — VGLA needs its own band", () => {
    const body = JSON.parse(fs.readFileSync(FIX_YAHOO_VGLA, "utf8"));
    const reg = loadRegistry(REGISTRY);
    const vwce = reg.liveEnabled.find((i) => i.isin === "IE00BK5BQT80");
    // Same body, VWCE's 20–400 band: the 4.45 close is out of range.
    // (Symbol check runs first, so point the fixture at VWCE.DE for this.)
    const vwceBody = JSON.parse(JSON.stringify(body));
    vwceBody.chart.result[0].meta.symbol = "VWCE.DE";
    vwceBody.chart.result[0].meta.longName =
      "Vanguard FTSE All-World UCITS ETF USD Accumulation";
    assert.throws(
      () => parseYahooChart(vwceBody, new Date("2026-08-03T17:00:00Z"), vwce),
      /outside 20–400/,
    );
  });
});

describe("per-ISIN history (PRICE-HISTORY-PERSIST-001 r2)", () => {
  it("runMultiAssetUpdate writes one history file per instrument", async () => {
    const { quotesPath, legacyPath, historyPath } = tmpWorkspace();
    const yahooBody = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    const onvistaBody = JSON.parse(fs.readFileSync(FIX_ONVISTA, "utf8"));
    const result = await runMultiAssetUpdate({
      quotesPath,
      legacyPath,
      historyPath,
      registryPath: REGISTRY,
      now: new Date("2026-08-03T17:00:00.000Z"),
      fetchedAt: new Date("2026-08-03T17:05:00.000Z"),
      bodiesByIsin: {
        IE00BK5BQT80: { yahooBody, onvistaBody },
        IE000VAHT5T0: vglaBodies(),
      },
    });
    assert.equal(result.wrote, true);

    const vwceHist = JSON.parse(
      fs.readFileSync(path.join(historyPath, "IE00BK5BQT80.json"), "utf8"),
    );
    assert.equal(vwceHist.isin, "IE00BK5BQT80");
    assert.deepEqual(vwceHist.points, [
      { date: "2026-08-03", price: 164.36, source: "cron" },
    ]);

    const vglaHist = JSON.parse(
      fs.readFileSync(path.join(historyPath, "IE000VAHT5T0.json"), "utf8"),
    );
    assert.equal(vglaHist.isin, "IE000VAHT5T0");
    assert.deepEqual(vglaHist.points, [
      { date: "2026-08-03", price: 4.45, source: "cron" },
    ]);
  });

  it("legacy mirror still mirrors VWCE only, never VGLA", async () => {
    const { quotesPath, legacyPath, historyPath } = tmpWorkspace();
    const yahooBody = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    const onvistaBody = JSON.parse(fs.readFileSync(FIX_ONVISTA, "utf8"));
    await runMultiAssetUpdate({
      quotesPath,
      legacyPath,
      historyPath,
      registryPath: REGISTRY,
      now: new Date("2026-08-03T17:00:00.000Z"),
      fetchedAt: new Date("2026-08-03T17:05:00.000Z"),
      bodiesByIsin: {
        IE00BK5BQT80: { yahooBody, onvistaBody },
        IE000VAHT5T0: vglaBodies(),
      },
    });
    const leg = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    assert.equal(leg.isin, "IE00BK5BQT80");
    assert.equal(leg.ticker, "VWCE");
    assert.ok(leg.price > 160);
  });
});

describe("yahoo adapter uses registry config", () => {
  it("selectClosedBar after close picks today", () => {
    const bars = [
      { timestamp: Date.parse("2026-08-01T16:00:00Z") / 1000, close: 160 },
      { timestamp: Date.parse("2026-08-03T16:00:00Z") / 1000, close: 165 },
    ];
    const bar = selectClosedBar(bars, new Date("2026-08-03T17:00:00Z"), {
      timezone: "Europe/Berlin",
      closeHourLocal: 18,
    });
    assert.equal(bar.asOf, "2026-08-03");
  });

  it("parseYahooChart validates VWCE fixture", () => {
    const body = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    const reg = loadRegistry(REGISTRY);
    const vwce = reg.liveEnabled.find((i) => i.isin === "IE00BK5BQT80");
    const y = parseYahooChart(body, new Date("2026-08-03T17:00:00Z"), vwce);
    assert.equal(y.asOf, "2026-08-03");
    assert.ok(y.price > 160);
  });
});

describe("provider contract B1/B2 — cross-check + URL", () => {
  it("fixture VWCE Yahoo+onvista sets crossCheckedWith and finite differencePct", async () => {
    const yahooBody = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    const onvistaBody = JSON.parse(fs.readFileSync(FIX_ONVISTA, "utf8"));
    const reg = loadRegistry(REGISTRY);
    const vwce = reg.liveEnabled.find((i) => i.isin === "IE00BK5BQT80");
    assert.ok(vwce);
    assert.equal(vwce.crossCheckProvider?.id, "onvista");
    assert.ok(vwce.crossCheckProvider?.url);
    assert.ok(vwce.primaryProvider?.url);

    const resolved = await resolveInstrumentQuote(vwce, {
      now: new Date("2026-08-03T17:00:00.000Z"),
      fetchedAt: new Date("2026-08-03T17:05:00.000Z"),
      yahooBody,
      onvistaBody,
    });
    assert.equal(resolved.crossCheckedWith, "onvista");
    assert.equal(typeof resolved.crossCheckDifferencePct, "number");
    assert.ok(Number.isFinite(resolved.crossCheckDifferencePct));
    // Fixture economics: Yahoo ~164.36 vs onvista aligned ~164.34 → ~0.0122%
    assert.ok(resolved.crossCheckDifferencePct >= 0);
    assert.ok(resolved.crossCheckDifferencePct < 1);
    assert.equal(resolved.provider, "yahoo_finance_chart");
    assert.equal(
      resolved.providerUrl,
      "https://finance.yahoo.com/quote/VWCE.DE",
    );
  });

  it("fetch uses exact primary.url and crossCheck.url from registry", async () => {
    const yahooBody = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    const onvistaBody = JSON.parse(fs.readFileSync(FIX_ONVISTA, "utf8"));
    const reg = loadRegistry(REGISTRY);
    const vwce = reg.liveEnabled.find((i) => i.isin === "IE00BK5BQT80");
    const primaryUrl = vwce.primaryProvider.url;
    const crossUrl = vwce.crossCheckProvider.url;
    assert.match(primaryUrl, /finance\.yahoo\.com/);
    assert.match(crossUrl, /api\.onvista\.de\/api\/v1\/funds\//);

    const called = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      called.push(String(url));
      const u = String(url);
      if (u === primaryUrl) {
        return {
          status: 200,
          json: async () => yahooBody,
        };
      }
      if (u === crossUrl) {
        return {
          status: 200,
          json: async () => onvistaBody,
        };
      }
      throw new Error(`Unexpected fetch URL: ${u}`);
    };
    try {
      const resolved = await resolveInstrumentQuote(vwce, {
        now: new Date("2026-08-03T17:00:00.000Z"),
        fetchedAt: new Date("2026-08-03T17:05:00.000Z"),
        // no bodies → must hit fetch with registry URLs
      });
      assert.equal(resolved.crossCheckedWith, "onvista");
      assert.ok(Number.isFinite(resolved.crossCheckDifferencePct));
      assert.deepEqual(called, [primaryUrl, crossUrl]);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("unknown provider id rejected at registry boundary", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reg-bad-"));
    const badPath = path.join(dir, "bad.json");
    fs.writeFileSync(
      badPath,
      JSON.stringify({
        schemaVersion: 1,
        instruments: [
          {
            isin: "IE00BK5BQT80",
            currency: "EUR",
            live: true,
            enabled: true,
            primaryProvider: {
              id: "not_a_real_provider",
              symbol: "VWCE.DE",
              url: "https://example.test/chart",
            },
          },
        ],
      }),
      "utf8",
    );
    assert.throws(() => loadRegistry(badPath), /unsupported provider id/i);
  });

  it("live provider missing request url rejected at registry", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reg-nourl-"));
    const badPath = path.join(dir, "bad.json");
    fs.writeFileSync(
      badPath,
      JSON.stringify({
        schemaVersion: 1,
        instruments: [
          {
            isin: "IE00BK5BQT80",
            currency: "EUR",
            live: true,
            enabled: true,
            primaryProvider: {
              id: "yahoo_finance_chart",
              symbol: "VWCE.DE",
            },
          },
        ],
      }),
      "utf8",
    );
    assert.throws(() => loadRegistry(badPath), /missing required url|missing primaryProvider\.url/i);
  });

  it("runMultiAssetUpdate VWCE row carries crossCheckedWith onvista", async () => {
    const { quotesPath, legacyPath, historyPath } = tmpWorkspace();
    const yahooBody = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    const onvistaBody = JSON.parse(fs.readFileSync(FIX_ONVISTA, "utf8"));
    const result = await runMultiAssetUpdate({
      quotesPath,
      legacyPath,
      historyPath,
      registryPath: REGISTRY,
      now: new Date("2026-08-03T17:00:00.000Z"),
      fetchedAt: new Date("2026-08-03T17:05:00.000Z"),
      bodiesByIsin: {
        IE00BK5BQT80: { yahooBody, onvistaBody },
        IE000VAHT5T0: vglaBodies(),
      },
    });
    assert.equal(result.wrote, true);
    const row = result.quotesDoc.quotes.find(
      (q) => q.instrumentIsin === "IE00BK5BQT80",
    );
    assert.ok(row);
    assert.equal(row.crossCheckedWith, "onvista");
    assert.equal(typeof row.crossCheckDifferencePct, "number");
    assert.ok(Number.isFinite(row.crossCheckDifferencePct));
  });
});
