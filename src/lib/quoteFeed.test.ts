import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, getQuoteForIsin } from "./db";
import { putAutoCandidateAndResolve } from "./db.m06";
import { defaultSettings } from "./defaults";
import { candidateId } from "./instrument";
import { ingestQuotesFeed, validateQuoteFeed, type QuoteFeedFetch } from "./quoteFeed";
import { VWCE_ISIN, VALL_ISIN } from "./types";

const OTHER_ISIN = "FR0010315770";
const NOW = new Date("2026-08-04T21:00:00.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    instrumentIsin: VWCE_ISIN,
    currency: "EUR",
    venue: "XETRA",
    price: 167.54,
    asOf: "2026-08-04",
    fetchedAt: "2026-08-04T20:09:02.987Z",
    source: "auto",
    provider: "yahoo_finance_chart",
    providerUrl: "https://finance.yahoo.com/quote/VWCE.DE",
    crossCheckedWith: "onvista",
    crossCheckDifferencePct: 0,
    ...overrides,
  };
}

function envelope(quotes: unknown[]) {
  return {
    schemaVersion: 2,
    generatedAt: "2026-08-04T20:09:03.853Z",
    quotes,
  };
}

function jsonFetch(payload: unknown, status = 200): QuoteFeedFetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

describe("quote feed envelope validation", () => {
  it("rejects duplicate normalized ISIN+currency before writes", async () => {
    const payload = envelope([row(), row({ currency: "eur", price: 170 })]);
    expect(() => validateQuoteFeed(payload, { now: NOW })).toThrow(/duplicate quote key/);

    const result = await ingestQuotesFeed({ fetchImpl: jsonFetch(payload), now: NOW, online: true });
    expect(result.status).toBe("error");
    expect(await db.quoteCandidates.count()).toBe(0);
  });

  it("rejects malformed or future generatedAt as a whole file", async () => {
    const payload = { ...envelope([row()]), generatedAt: "2099-01-01T00:00:00.000Z" };
    const result = await ingestQuotesFeed({ fetchImpl: jsonFetch(payload), now: NOW, online: true });
    expect(result.status).toBe("error");
    expect(await db.quoteCandidates.count()).toBe(0);
  });

  it("skips an invalid row but keeps valid independent keys", async () => {
    const payload = envelope([
      row(),
      row({ instrumentIsin: "IE00BK5BQT81", price: 22 }),
      row({ instrumentIsin: OTHER_ISIN, venue: "PARIS", price: 42 }),
    ]);
    const result = await ingestQuotesFeed({ fetchImpl: jsonFetch(payload), now: NOW, online: true });
    expect(result.status).toBe("partial");
    expect(result.updated).toBe(2);
    expect(result.skipped).toHaveLength(1);
    expect((await getQuoteForIsin(VWCE_ISIN))?.price).toBe(167.54);
    expect((await getQuoteForIsin(OTHER_ISIN))?.price).toBe(42);
  });

  it("rejects non-EUR quotes for both configured ETFs, retaining existing EUR quotes", async () => {
    await ingestQuotesFeed({ fetchImpl: jsonFetch(envelope([
      row(), row({ instrumentIsin: VALL_ISIN, price: 4.25 }),
    ])), now: NOW, online: true });
    const result = await ingestQuotesFeed({ fetchImpl: jsonFetch(envelope([
      row({ currency: "USD", price: 199 }),
      row({ instrumentIsin: VALL_ISIN, currency: "GBP", price: 3.5 }),
    ])), now: NOW, online: true });
    expect(result).toMatchObject({ status: "partial", updated: 0, acceptedRows: 0 });
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every(issue => issue.reason.includes("EUR"))).toBe(true);
    expect(await db.quoteCandidates.get(candidateId(VWCE_ISIN, "USD", "auto"))).toBeUndefined();
    expect(await db.quoteCandidates.get(candidateId(VALL_ISIN, "GBP", "auto"))).toBeUndefined();
    expect((await getQuoteForIsin(VWCE_ISIN))?.price).toBe(167.54);
    expect((await getQuoteForIsin(VALL_ISIN))?.price).toBe(4.25);
  });

  it("preserves support for unrelated instruments quoted in other currencies", () => {
    const result = validateQuoteFeed(envelope([row({
      instrumentIsin: OTHER_ISIN, currency: "USD", venue: "OTHER",
    })]), { now: NOW });
    expect(result.skipped).toHaveLength(0);
    expect(result.rows[0]?.currency).toBe("USD");
  });

  it("rejects a future incoming row without changing its prior candidate", async () => {
    await ingestQuotesFeed({
      fetchImpl: jsonFetch(envelope([row({ price: 160 })])),
      now: NOW,
      online: true,
    });
    const payload = envelope([row({ price: 999, asOf: "2026-08-05" })]);
    const result = await ingestQuotesFeed({ fetchImpl: jsonFetch(payload), now: NOW, online: true });
    expect(result.skipped).toHaveLength(1);
    const stored = await db.quoteCandidates.get(candidateId(VWCE_ISIN, "EUR", "auto"));
    expect(stored?.price).toBe(160);
  });
});

describe("quote feed ingestion", () => {
  it("retains a newer stored session when a cached older feed arrives", async () => {
    await ingestQuotesFeed({ fetchImpl: jsonFetch(envelope([row()])), now: NOW, online: true });
    const result = await ingestQuotesFeed({ fetchImpl: jsonFetch(envelope([row({ asOf: "2026-08-03", price: 99 })])), now: NOW, online: true });
    expect(result.status).toBe("partial");
    expect(result.updated).toBe(0);
    expect((await getQuoteForIsin(VWCE_ISIN))?.price).toBe(167.54);
  });

  it("rejects an older fetch from the same session even with a timezone offset", async () => {
    await ingestQuotesFeed({ fetchImpl: jsonFetch(envelope([row()])), now: NOW, online: true });
    const key = candidateId(VWCE_ISIN, "EUR", "auto");
    const before = await db.quoteCandidates.get(key);
    const result = await ingestQuotesFeed({
      fetchImpl: jsonFetch(envelope([row({ price: 99, fetchedAt: "2026-08-04T22:08:00+02:00" })])),
      now: NOW, online: true,
    });
    expect(result).toMatchObject({ status: "partial", updated: 0 });
    expect(await db.quoteCandidates.get(key)).toEqual(before);
    expect((await getQuoteForIsin(VWCE_ISIN))?.price).toBe(167.54);
  });

  it("enforces the feed guard within the database writer and accepts a newer correction", async () => {
    await ingestQuotesFeed({ fetchImpl: jsonFetch(envelope([row()])), now: NOW, online: true });
    const input = { instrumentIsin: VWCE_ISIN, currency: "EUR", venue: "XETRA", asOf: "2026-08-04", price: 168, provider: "yahoo_finance_chart" };
    await expect(putAutoCandidateAndResolve({ ...input, fetchedAt: "2026-08-04T20:00:00Z" },
      { nowDate: "2026-08-04", rejectOlderFeed: true })).rejects.toThrow(/older quote feed/);
    expect((await getQuoteForIsin(VWCE_ISIN))?.price).toBe(167.54);
    await putAutoCandidateAndResolve({ ...input, fetchedAt: "2026-08-04T20:30:00Z" },
      { nowDate: "2026-08-04", rejectOlderFeed: true });
    expect((await getQuoteForIsin(VWCE_ISIN))?.price).toBe(168);
  });

  it("rejects timestamps without an explicit timezone", () => {
    expect(validateQuoteFeed(envelope([row({ fetchedAt: "2026-08-04T20:09:02" })]), { now: NOW }).skipped).toHaveLength(1);
  });
  it("writes a valid auto candidate and effective quote", async () => {
    const result = await ingestQuotesFeed({
      fetchImpl: jsonFetch(envelope([row()])),
      now: NOW,
      online: true,
    });
    expect(result).toMatchObject({ status: "ok", updated: 1, unchanged: 0 });
    const candidate = await db.quoteCandidates.get(candidateId(VWCE_ISIN, "EUR", "auto"));
    expect(candidate?.price).toBe(167.54);
    expect(candidate?.provider).toBe("yahoo_finance_chart");
    expect((await getQuoteForIsin(VWCE_ISIN))?.source).toBe("auto");
  });

  it("is a semantic no-op when only fetchedAt/generatedAt change", async () => {
    await ingestQuotesFeed({
      fetchImpl: jsonFetch(envelope([row()])),
      now: NOW,
      online: true,
    });
    const first = await db.quoteCandidates.get(candidateId(VWCE_ISIN, "EUR", "auto"));
    const payload = {
      ...envelope([row({ fetchedAt: "2026-08-04T20:59:00.000Z" })]),
      generatedAt: "2026-08-04T20:59:01.000Z",
    };
    const result = await ingestQuotesFeed({ fetchImpl: jsonFetch(payload), now: NOW, online: true });
    const second = await db.quoteCandidates.get(candidateId(VWCE_ISIN, "EUR", "auto"));
    expect(result).toMatchObject({ status: "ok", updated: 0, unchanged: 1 });
    expect(second?.fetchedAt).toBe(first?.fetchedAt);
    expect(second?.updatedAt).toBe(first?.updatedAt);
  });

  it("uses one single-flight promise for concurrent startup/manual refresh", async () => {
    let release: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ) as QuoteFeedFetch;

    const first = ingestQuotesFeed({ fetchImpl, now: NOW, online: true });
    const second = ingestQuotesFeed({ fetchImpl, now: NOW, online: true });
    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    release?.(new Response(JSON.stringify(envelope([row()])), { status: 200 }));
    const [a, b] = await Promise.all([first, second]);
    expect(a.status).toBe("ok");
    expect(b.status).toBe("ok");
  });

  it("is an offline no-op and never calls fetch", async () => {
    const fetchImpl = jsonFetch(envelope([row()]));
    const result = await ingestQuotesFeed({ fetchImpl, now: NOW, online: false });
    expect(result.status).toBe("offline");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await db.quoteCandidates.count()).toBe(0);
  });

  it("keeps local data on HTTP failure", async () => {
    await ingestQuotesFeed({
      fetchImpl: jsonFetch(envelope([row({ price: 160 })])),
      now: NOW,
      online: true,
    });
    const result = await ingestQuotesFeed({
      fetchImpl: jsonFetch({ message: "missing" }, 404),
      now: NOW,
      online: true,
    });
    expect(result.status).toBe("error");
    expect((await getQuoteForIsin(VWCE_ISIN))?.price).toBe(160);
  });
});