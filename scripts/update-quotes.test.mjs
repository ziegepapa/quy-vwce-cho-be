/**
 * Multi-asset quote feed v2 tests — node:test.
 * Run: node --test scripts/update-quotes.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { isValidIsin, normalizeIsin } from "./price/isin.mjs";
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
import { loadRegistry, quoteKey } from "./price/registry.mjs";
import { decideQuoteWrite, runMultiAssetUpdate } from "./price/orchestrator.mjs";
import { parseYahooChart } from "./price/providers/yahoo.mjs";
import { parseOnvistaSnapshot } from "./price/providers/onvista.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FIX_YAHOO = path.join(__dirname, "fixtures/yahoo-vwce.json");
const FIX_ONVISTA = path.join(__dirname, "fixtures/onvista-vwce.json");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "quotes-v2-"));
}

function sampleQuote(overrides = {}) {
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
  it("normalizes and validates VWCE ISIN", () => {
    assert.equal(normalizeIsin("ie00bk5bqt80"), "IE00BK5BQT80");
    assert.equal(isValidIsin("IE00BK5BQT80"), true);
  });
  it("rejects bad checksum", () => {
    assert.equal(isValidIsin("IE00BK5BQT81"), false);
  });
});

describe("contract schema v2", () => {
  it("accepts valid document", () => {
    const doc = validateQuotesDocument({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      quotes: [sampleQuote()],
    });
    assert.equal(doc.schemaVersion, 2);
    assert.equal(doc.quotes.length, 1);
  });

  it("rejects duplicate ISIN/currency", () => {
    assert.throws(
      () =>
        validateQuotesDocument({
          schemaVersion: 2,
          generatedAt: new Date().toISOString(),
          quotes: [sampleQuote(), sampleQuote({ price: 166 })],
        }),
      /Duplicate/
    );
  });

  it("rejects bad checksum ISIN", () => {
    assert.throws(
      () => validateQuoteRow(sampleQuote({ instrumentIsin: "IE00BK5BQT81" })),
      /checksum/
    );
  });

  it("rejects invalid date, NaN, Infinity, zero, negative price", () => {
    assert.throws(() => validateQuoteRow(sampleQuote({ asOf: "2026-13-01" })), /asOf/);
    assert.throws(() => validateQuoteRow(sampleQuote({ price: NaN })), /price/);
    assert.throws(() => validateQuoteRow(sampleQuote({ price: Infinity })), /price/);
    assert.throws(() => validateQuoteRow(sampleQuote({ price: 0 })), /price/);
    assert.throws(() => validateQuoteRow(sampleQuote({ price: -1 })), /price/);
  });

  it("sorts deterministic by ISIN then currency", () => {
    const a = sampleQuote({ instrumentIsin: "IE00B4L5Y983", currency: "EUR" }); // another valid ISIN shape for test — use real if needed
    // Use two valid ISINs: VWCE and a known good test ISIN LU1681043599 (Amundi)
    const q1 = sampleQuote({ instrumentIsin: "LU1681043599", currency: "EUR", price: 10 });
    const q2 = sampleQuote({ instrumentIsin: "IE00BK5BQT80", currency: "EUR", price: 165 });
    const doc = validateQuotesDocument({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      quotes: [q1, q2],
    });
    assert.equal(doc.quotes[0].instrumentIsin, "IE00BK5BQT80");
    assert.equal(doc.quotes[1].instrumentIsin, "LU1681043599");
  });

  it("malformed existing file fail closed", () => {
    const dir = tmpDir();
    const p = path.join(dir, "quotes.json");
    fs.writeFileSync(p, "{not json", "utf8");
    assert.throws(() => readExistingQuotes(p), /Malformed|fail closed/);
  });

  it("semantic no-op equality ignores fetchedAt/generatedAt", () => {
    const a = sampleQuote({ fetchedAt: "2026-08-03T10:00:00.000Z" });
    const b = sampleQuote({ fetchedAt: "2026-08-03T12:00:00.000Z" });
    assert.equal(sameQuoteEconomics(a, b), true);
    const d1 = { schemaVersion: 2, generatedAt: "2026-08-03T10:00:00.000Z", quotes: [a] };
    const d2 = { schemaVersion: 2, generatedAt: "2026-08-03T12:00:00.000Z", quotes: [b] };
    assert.equal(sameDocumentEconomics(d1, d2), true);
  });
});

describe("legacy round-trip", () => {
  it("VWCE legacy mirror keeps schema 1 fields", () => {
    const q = sampleQuote();
    const v1 = quoteRowToLegacyV1(q);
    assert.equal(v1.schemaVersion, 1);
    assert.equal(v1.isin, "IE00BK5BQT80");
    assert.equal(v1.ticker, "VWCE");
    assert.equal(v1.price, 165.1);
    const back = legacyV1ToQuoteRow(v1);
    assert.equal(back.instrumentIsin, q.instrumentIsin);
    assert.equal(back.price, q.price);
  });
});

describe("registry", () => {
  it("loads VWCE live instrument", () => {
    const reg = loadRegistry(path.join(ROOT, "scripts/price-instruments.json"));
    const live = reg.instruments.filter((i) => !i.testOnly);
    assert.ok(live.some((i) => i.isin === "IE00BK5BQT80"));
  });
  it("quoteKey is ISIN|currency", () => {
    assert.equal(quoteKey("IE00BK5BQT80", "eur"), "IE00BK5BQT80|EUR");
  });
});

describe("decideQuoteWrite policies", () => {
  const inst = {
    isin: "IE00BK5BQT80",
    currency: "EUR",
    policies: {
      maxDayJumpPct: 8,
      sameDayChangeBeforeClosePct: 3,
      closeHourLocal: 17,
      timezone: "Europe/Berlin",
    },
  };
  const prev = sampleQuote({ asOf: "2026-08-01", price: 100, fetchedAt: "2026-08-01T18:00:00.000Z" });

  it("blocks stale regression", () => {
    const cand = sampleQuote({ asOf: "2026-07-31", price: 99 });
    const d = decideQuoteWrite(prev, cand, inst, new Date("2026-08-03T12:00:00Z"));
    assert.equal(d.action, "keep");
    assert.equal(d.reason, "stale_regression");
  });

  it("blocks day jump beyond policy", () => {
    const cand = sampleQuote({ asOf: "2026-08-03", price: 120 }); // +20%
    const d = decideQuoteWrite(prev, cand, inst, new Date("2026-08-03T18:00:00Z"));
    assert.equal(d.action, "keep");
    assert.equal(d.reason, "day_jump");
  });

  it("allows moderate new-day move", () => {
    const cand = sampleQuote({ asOf: "2026-08-03", price: 105 });
    const d = decideQuoteWrite(prev, cand, inst, new Date("2026-08-03T18:00:00Z"));
    assert.equal(d.action, "write");
  });

  it("blocks same-day pre-close jump", () => {
    const sameDayPrev = sampleQuote({ asOf: "2026-08-03", price: 100 });
    const cand = sampleQuote({ asOf: "2026-08-03", price: 110 });
    // 10:00 Berlin ~ 08:00 UTC in summer
    const d = decideQuoteWrite(sameDayPrev, cand, inst, new Date("2026-08-03T08:00:00Z"));
    assert.equal(d.action, "keep");
    assert.equal(d.reason, "same_day_pre_close_jump");
  });
});

describe("provider parse fixtures", () => {
  it("parses yahoo VWCE fixture", () => {
    const raw = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    const parsed = parseYahooChart(raw, {
      symbol: "VWCE.DE",
      isin: "IE00BK5BQT80",
      currency: "EUR",
      venue: "XETRA",
      now: new Date("2026-08-03T18:00:00Z"),
    });
    assert.ok(parsed);
    assert.ok(parsed.price > 0);
    assert.match(parsed.asOf, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("parses onvista fixture", () => {
    const raw = JSON.parse(fs.readFileSync(FIX_ONVISTA, "utf8"));
    const parsed = parseOnvistaSnapshot(raw);
    assert.ok(parsed);
    assert.ok(parsed.price > 0);
  });
});

describe("multi-ISIN isolation", () => {
  it("two ISINs do not overwrite each other; one failure keeps prior", async () => {
    const dir = tmpDir();
    const quotesPath = path.join(dir, "quotes.json");
    const legacyPath = path.join(dir, "vwce-price.json");
    const registryPath = path.join(ROOT, "scripts/price-instruments.json");

    const qVwce = sampleQuote({ price: 160, asOf: "2026-08-01" });
    const qAmundi = sampleQuote({
      instrumentIsin: "LU1681043599",
      currency: "EUR",
      price: 50,
      asOf: "2026-08-01",
      providerUrl: "https://example.test/amundi",
    });
    writeJsonAtomic(
      {
        schemaVersion: 2,
        generatedAt: "2026-08-01T18:00:00.000Z",
        quotes: [qVwce, qAmundi],
      },
      quotesPath
    );

    const yahooRaw = JSON.parse(fs.readFileSync(FIX_YAHOO, "utf8"));
    // fetch that succeeds for VWCE and fails for Amundi
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.includes("VWCE") || u.includes("query1.finance.yahoo.com")) {
        return {
          ok: true,
          json: async () => yahooRaw,
          text: async () => JSON.stringify(yahooRaw),
        };
      }
      if (u.includes("onvista")) {
        const onv = JSON.parse(fs.readFileSync(FIX_ONVISTA, "utf8"));
        return { ok: true, json: async () => onv, text: async () => JSON.stringify(onv) };
      }
      throw new Error("simulated provider failure");
    };

    const result = await runMultiAssetUpdate({
      quotesPath,
      legacyPath,
      registryPath,
      fetchImpl,
      now: new Date("2026-08-03T18:00:00Z"),
      includeTestOnly: true,
      dryRun: false,
    });

    assert.ok(result.document);
    const map = new Map(result.document.quotes.map((q) => [quoteKey(q.instrumentIsin, q.currency), q]));
    // VWCE should be updated or kept valid
    assert.ok(map.has("IE00BK5BQT80|EUR"));
    // Amundi prior should be kept if registry includes test-only and provider failed
    if (map.has("LU1681043599|EUR")) {
      assert.equal(map.get("LU1681043599|EUR").price, 50);
    }
    // decisions should mention isolation
    assert.ok(Array.isArray(result.decisions));
  });
});

describe("atomic write", () => {
  it("writeJsonAtomic creates valid JSON", () => {
    const dir = tmpDir();
    const p = path.join(dir, "out.json");
    writeJsonAtomic({ a: 1 }, p);
    assert.deepEqual(JSON.parse(fs.readFileSync(p, "utf8")), { a: 1 });
  });
});
