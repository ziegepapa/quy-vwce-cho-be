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
import { loadRegistry, quoteKey } from "./price/registry.mjs";
import {
  decideQuoteWrite,
  runMultiAssetUpdate,
  OrchestratorError,
} from "./price/orchestrator.mjs";
import { parseYahooChart, selectClosedBar } from "./price/providers/yahoo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const REGISTRY = path.join(REPO_ROOT, "scripts", "price-instruments.json");
const FIX_YAHOO = path.join(__dirname, "fixtures", "yahoo-vwce.json");
const FIX_ONVISTA = path.join(__dirname, "fixtures", "onvista-vwce.json");

function tmpWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotes-v2-"));
  return {
    dir,
    quotesPath: path.join(dir, "quotes.json"),
    legacyPath: path.join(dir, "vwce-price.json"),
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
    const { quotesPath, legacyPath } = tmpWorkspace();
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
      registryPath: REGISTRY,
      includeTestOnly: true,
      now: new Date("2026-08-03T17:00:00.000Z"),
      fetchedAt: new Date("2026-08-03T17:05:00.000Z"),
      bodiesByIsin: {
        IE00BK5BQT80: { yahooBody, onvistaBody },
        // test-only intentionally missing bodies → failure → keep prior
      },
    });

    assert.ok(result.quotesDoc);
    const map = new Map(
      result.quotesDoc.quotes.map((q) => [quoteKey(q.instrumentIsin, q.currency), q]),
    );
    assert.ok(map.has("IE00BK5BQT80|EUR"));
    assert.ok(map.has("FR0010315770|EUR"));
    assert.equal(map.get("FR0010315770|EUR").price, 50);
    assert.ok(result.errors.some((e) => e.isin === "FR0010315770"));
  });

  it("fixture VWCE resolve writes both quotes.json and legacy mirror", async () => {
    const { quotesPath, legacyPath } = tmpWorkspace();
    const yahooBody = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    const onvistaBody = JSON.parse(fs.readFileSync(FIX_ONVISTA, "utf8"));
    const result = await runMultiAssetUpdate({
      quotesPath,
      legacyPath,
      registryPath: REGISTRY,
      now: new Date("2026-08-03T17:00:00.000Z"),
      fetchedAt: new Date("2026-08-03T17:05:00.000Z"),
      bodiesByIsin: {
        IE00BK5BQT80: { yahooBody, onvistaBody },
      },
    });
    assert.equal(result.wrote, true);
    assert.equal(result.legacyWrote, true);
    const doc = JSON.parse(fs.readFileSync(quotesPath, "utf8"));
    assert.equal(doc.schemaVersion, 2);
    assert.equal(doc.quotes[0].instrumentIsin, "IE00BK5BQT80");
    const leg = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    assert.equal(leg.schemaVersion, 1);
    assert.equal(leg.isin, "IE00BK5BQT80");
    assert.equal(leg.ticker, "VWCE");
  });

  it("second write with same economics is no-op", async () => {
    const { quotesPath, legacyPath } = tmpWorkspace();
    const yahooBody = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    const onvistaBody = JSON.parse(fs.readFileSync(FIX_ONVISTA, "utf8"));
    const opts = {
      quotesPath,
      legacyPath,
      registryPath: REGISTRY,
      now: new Date("2026-08-03T17:00:00.000Z"),
      fetchedAt: new Date("2026-08-03T17:05:00.000Z"),
      bodiesByIsin: { IE00BK5BQT80: { yahooBody, onvistaBody } },
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
  it("test-only second ISIN is not live", () => {
    const reg = loadRegistry(REGISTRY, { includeTestOnly: true });
    assert.ok(reg.testOnlyInstruments.some((i) => i.isin === "FR0010315770"));
    assert.ok(!reg.liveEnabled.some((i) => i.isin === "FR0010315770"));
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
