/**
 * Yahoo Finance chart adapter — config-driven (no hardcoded symbol outside registry).
 */

import { dateStringInTz, hourInTz, roundPrice } from "../time.mjs";

export class YahooAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = "YahooAdapterError";
  }
}

/**
 * @param {{ timestamp: number, close: number }[]} bars
 * @param {Date} now
 * @param {{ timezone: string, closeHourLocal: number }} venue
 */
export function selectClosedBar(bars, now, venue) {
  const tz = venue.timezone || "Europe/Berlin";
  const closeHour = venue.closeHourLocal ?? 18;
  if (!bars.length) {
    throw new YahooAdapterError("No valid bars with positive close");
  }
  const today = dateStringInTz(now, tz);
  const hour = hourInTz(now, tz);
  const allowToday = hour >= closeHour;
  const sorted = [...bars].sort((a, b) => a.timestamp - b.timestamp);
  const withAsOf = sorted.map((b) => ({
    ...b,
    asOf: dateStringInTz(new Date(b.timestamp * 1000), tz),
  }));
  let candidates = allowToday
    ? withAsOf.filter((b) => b.asOf <= today)
    : withAsOf.filter((b) => b.asOf < today);
  if (!candidates.length) {
    throw new YahooAdapterError(
      allowToday
        ? "No closed bar on or before today"
        : `Before ${closeHour}:00 ${tz}: no bar strictly before today`,
    );
  }
  return candidates[candidates.length - 1];
}

function longNameMatches(longName, mustInclude) {
  if (!Array.isArray(mustInclude) || !mustInclude.length) return true;
  if (typeof longName !== "string") return false;
  const n = longName.toLowerCase();
  return mustInclude.every((tok) => n.includes(String(tok).toLowerCase()));
}

/**
 * @param {unknown} body
 * @param {Date} now
 * @param {object} instrument registry entry with primaryProvider + range policy
 */
export function parseYahooChart(body, now, instrument) {
  const p = instrument.primaryProvider;
  if (!p?.symbol) {
    throw new YahooAdapterError(`No primaryProvider.symbol for ${instrument.isin}`);
  }
  if (!body || typeof body !== "object") {
    throw new YahooAdapterError("Yahoo: body is not an object");
  }
  const chart = /** @type {any} */ (body).chart;
  if (!chart || typeof chart !== "object") {
    throw new YahooAdapterError("Yahoo: missing chart");
  }
  if (chart.error != null) {
    throw new YahooAdapterError(`Yahoo: chart.error = ${JSON.stringify(chart.error)}`);
  }
  const results = chart.result;
  if (!Array.isArray(results) || results.length !== 1) {
    throw new YahooAdapterError("Yahoo: expected exactly one result");
  }
  const result = results[0];
  const meta = result?.meta;
  if (!meta || typeof meta !== "object") {
    throw new YahooAdapterError("Yahoo: missing meta");
  }
  if (meta.symbol !== p.symbol) {
    throw new YahooAdapterError(`Yahoo: bad symbol ${meta.symbol} (want ${p.symbol})`);
  }
  const expectedCcy = p.expectedCurrency || instrument.currency;
  if (meta.currency !== expectedCcy) {
    throw new YahooAdapterError(`Yahoo: bad currency ${meta.currency}`);
  }
  const venues = p.expectedVenues || [];
  if (venues.length) {
    const venueOk =
      venues.includes(meta.fullExchangeName) || venues.includes(meta.exchangeName);
    if (!venueOk) {
      throw new YahooAdapterError(
        `Yahoo: bad venue fullExchangeName=${meta.fullExchangeName} exchangeName=${meta.exchangeName}`,
      );
    }
  }
  if (p.expectedInstrumentType && meta.instrumentType !== p.expectedInstrumentType) {
    throw new YahooAdapterError(`Yahoo: bad instrumentType ${meta.instrumentType}`);
  }
  if (!longNameMatches(meta.longName, p.longNameMustInclude)) {
    throw new YahooAdapterError(`Yahoo: longName not recognized: ${meta.longName}`);
  }

  const timestamps = result.timestamp;
  const closes = result.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
    throw new YahooAdapterError("Yahoo: missing timestamp/close arrays");
  }
  if (timestamps.length !== closes.length) {
    throw new YahooAdapterError("Yahoo: timestamp/close length mismatch");
  }

  /** @type {{ timestamp: number, close: number }[]} */
  const bars = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const c = closes[i];
    if (typeof ts !== "number" || !Number.isFinite(ts)) continue;
    if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) continue;
    bars.push({ timestamp: ts, close: c });
  }

  const selected = selectClosedBar(bars, now, {
    timezone: instrument.timezone,
    closeHourLocal: instrument.closeHourLocal,
  });
  if (selected.close < instrument.priceMin || selected.close > instrument.priceMax) {
    throw new YahooAdapterError(
      `Yahoo: close ${selected.close} outside ${instrument.priceMin}–${instrument.priceMax}`,
    );
  }

  const tz = instrument.timezone || "Europe/Berlin";
  const asOf = selected.asOf;
  const today = dateStringInTz(now, tz);
  if (asOf > today) {
    throw new YahooAdapterError(`Yahoo: asOf ${asOf} is in the future vs ${today}`);
  }
  const asOfMs = Date.parse(`${asOf}T12:00:00+00:00`);
  const ageDays = (now.getTime() - asOfMs) / (24 * 3600 * 1000);
  if (ageDays > instrument.maxAsOfAgeDays) {
    throw new YahooAdapterError(
      `Yahoo: asOf ${asOf} older than ${instrument.maxAsOfAgeDays} calendar days`,
    );
  }

  return {
    price: roundPrice(selected.close),
    asOf,
    meta: {
      symbol: meta.symbol,
      currency: meta.currency,
      venue: instrument.venue || meta.fullExchangeName || meta.exchangeName,
      longName: meta.longName,
    },
  };
}
