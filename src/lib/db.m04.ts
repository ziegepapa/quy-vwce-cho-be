import type { Quote } from "./types";
import { quoteId } from "./instrument";
import { db } from "./db.m01a";
import { saveManualQuoteForIsin } from "./db.m05";
import { putAutoCandidateAndResolve } from "./db.m06";

export async function listQuotes(): Promise<Quote[]> {
  return db.quotes.toArray();
}

export async function upsertQuote(q: Quote, opts?: { sync?: boolean }): Promise<void> {
  void opts;
  if (q.source === "manual") {
    await saveManualQuoteForIsin({
      instrumentIsin: q.instrumentIsin,
      price: q.price,
      asOf: q.asOf,
      currency: q.currency,
      venue: q.venue,
    });
    return;
  }
  await putAutoCandidateAndResolve({
    instrumentIsin: q.instrumentIsin,
    currency: q.currency || "EUR",
    price: q.price,
    asOf: q.asOf,
    venue: q.venue,
    provider: q.provider,
    providerUrl: q.providerUrl,
    crossCheckedWith: q.crossCheckedWith,
    crossCheckDifferencePct: q.crossCheckDifferencePct,
    fetchedAt: q.fetchedAt,
  });
}

export async function getQuoteForIsin(
  isin: string,
  currency = "EUR",
): Promise<Quote | undefined> {
  return db.quotes.get(quoteId(isin, currency));
}
