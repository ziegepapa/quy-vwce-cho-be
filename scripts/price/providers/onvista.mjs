/**
 * onvista snapshot adapter.
 *
 * Two roles:
 *   1. cross-check for the configured primary provider (original role)
 *   2. price source of last resort when the primary provider fails
 *      (PRICE-FALLBACK-001)
 *
 * Every error carries a `code` so the orchestrator can tell
 * "onvista could not be read" (degrade: keep the primary price, drop the
 * cross-check stamp) apart from "the two sources genuinely disagree"
 * (fail closed: keep the previous quote and write nothing).
 */

import { dateStringInTz, hourInTz, roundPrice } from "../time.mjs";

/** onvista could not be read or aligned. Safe to continue without it. */
export const ONVISTA_UNAVAILABLE = "unavailable";
/** onvista was read fine and contradicts the primary. Never write. */
export const ONVISTA_MISMATCH = "mismatch";

export class OnvistaAdapterError extends Error {
  constructor(message, code = ONVISTA_UNAVAILABLE) {
    super(message);
    this.name = "OnvistaAdapterError";
    this.code = code;
  }
}

/**
 * @param {unknown} body
 * @param {object} instrument
 * @param {object} [cfgOverride] provider config to validate against.
 *   Defaults to instrument.crossCheckProvider so existing callers are unchanged.
 */
export function parseOnvistaSnapshot(body, instrument, cfgOverride) {
  const cfg = cfgOverride || instrument.crossCheckProvider;
  if (!cfg) {
    throw new OnvistaAdapterError(`No onvista provider config for ${instrument.isin}`);
  }
  if (!body || typeof body !== "object") {
    throw new OnvistaAdapterError("onvista: body is not an object");
  }
  const b = /** @type {any} */ (body);
  const isin = b.instrument?.isin;
  const expectedIsin = cfg.expectedIsin || instrument.isin;
  if (isin !== expectedIsin) {
    throw new OnvistaAdapterError(`onvista: ISIN mismatch ${isin}`);
  }
  const list = b.quoteList?.list;
  if (!Array.isArray(list) || !list.length) {
    throw new OnvistaAdapterError("onvista: empty quoteList");
  }
  const names = cfg.expectedMarketNames || ["Xetra"];
  const codes = cfg.expectedExchangeCodes || ["GER", "_GER"];
  const xetra = list.find(
    (q) =>
      names.includes(q?.market?.name) ||
      codes.includes(q?.market?.codeExchange) ||
      codes.includes(q?.market?.codeMarket),
  );
  if (!xetra) {
    throw new OnvistaAdapterError("onvista: no matching market quote in quoteList");
  }
  const expectedCcy = cfg.expectedCurrency || instrument.currency;
  if (xetra.isoCurrency !== expectedCcy) {
    throw new OnvistaAdapterError(`onvista: currency ${xetra.isoCurrency}`);
  }
  const last = xetra.last;
  const previousLast = xetra.previousLast;
  if (typeof last !== "number" || !Number.isFinite(last) || last <= 0) {
    throw new OnvistaAdapterError(`onvista: bad last ${last}`);
  }
  const datetimeLast = xetra.datetimeLast;
  const datetimePreviousLast = xetra.datetimePreviousLast;
  if (typeof datetimeLast !== "string" || !Number.isFinite(Date.parse(datetimeLast))) {
    throw new OnvistaAdapterError(
      `onvista: missing or unparseable datetimeLast ${datetimeLast}`,
    );
  }
  const hasPrev =
    typeof datetimePreviousLast === "string" &&
    Number.isFinite(Date.parse(datetimePreviousLast));
  const tz = instrument.timezone || "Europe/Berlin";
  return {
    isin,
    last: roundPrice(last),
    previousLast:
      typeof previousLast === "number" && Number.isFinite(previousLast) && previousLast > 0
        ? roundPrice(previousLast)
        : null,
    datetimeLast,
    datetimePreviousLast: hasPrev ? datetimePreviousLast : null,
    lastAsOf: dateStringInTz(new Date(datetimeLast), tz),
    previousAsOf: hasPrev ? dateStringInTz(new Date(datetimePreviousLast), tz) : null,
  };
}

/**
 * Pick the newest onvista quote that belongs to a session that already closed.
 * Same rule as selectClosedBar in the Yahoo adapter: before the local close we
 * refuse today and fall back to the previous session.
 */
export function selectOnvistaClosedQuote(snapshot, now, instrument) {
  const tz = instrument.timezone || "Europe/Berlin";
  const closeHour = instrument.closeHourLocal ?? 18;
  const today = dateStringInTz(now, tz);
  const allowToday = hourInTz(now, tz) >= closeHour;

  const candidates = [];
  if (snapshot.lastAsOf) {
    candidates.push({ price: snapshot.last, asOf: snapshot.lastAsOf });
  }
  if (snapshot.previousAsOf && snapshot.previousLast != null) {
    candidates.push({ price: snapshot.previousLast, asOf: snapshot.previousAsOf });
  }
  const usable = candidates
    .filter((c) => (allowToday ? c.asOf <= today : c.asOf < today))
    .sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));
  if (!usable.length) {
    throw new OnvistaAdapterError(
      allowToday
        ? `onvista: no closed quote on or before ${today}`
        : `onvista: before ${closeHour}:00 ${tz} and no quote strictly before ${today}`,
    );
  }
  return usable[usable.length - 1];
}

/**
 * onvista as the price source. Only reached when the configured primary
 * provider failed, so it applies the same range and staleness guards.
 */
export function parseOnvistaAsPrimary(body, now, instrument) {
  const cfg =
    instrument.primaryProvider?.id === "onvista"
      ? instrument.primaryProvider
      : instrument.crossCheckProvider;
  const snapshot = parseOnvistaSnapshot(body, instrument, cfg);
  const closed = selectOnvistaClosedQuote(snapshot, now, instrument);

  const priceMin = instrument.priceMin ?? 1;
  const priceMax = instrument.priceMax ?? 1e6;
  if (closed.price < priceMin || closed.price > priceMax) {
    throw new OnvistaAdapterError(
      `onvista: price ${closed.price} outside ${priceMin}-${priceMax}`,
    );
  }

  const tz = instrument.timezone || "Europe/Berlin";
  const today = dateStringInTz(now, tz);
  if (closed.asOf > today) {
    throw new OnvistaAdapterError(`onvista: asOf ${closed.asOf} is in the future vs ${today}`);
  }
  const maxAgeDays = instrument.maxAsOfAgeDays ?? 7;
  const asOfMs = Date.parse(`${closed.asOf}T12:00:00+00:00`);
  const ageDays = (now.getTime() - asOfMs) / (24 * 3600 * 1000);
  if (ageDays > maxAgeDays) {
    throw new OnvistaAdapterError(
      `onvista: asOf ${closed.asOf} older than ${maxAgeDays} calendar days`,
    );
  }

  return {
    price: roundPrice(closed.price),
    asOf: closed.asOf,
    meta: {
      venue: instrument.venue,
      currency: instrument.currency,
      source: "onvista",
    },
  };
}

/**
 * Cross-check primary price vs onvista same-day (or previousLast alignment).
 * Alignment and range problems are `unavailable`; a real price disagreement is
 * `mismatch` and must stop the write.
 */
export function crossCheckWithOnvista(primary, onvista, instrument) {
  let onvistaPrice = null;
  if (onvista.lastAsOf === primary.asOf) {
    onvistaPrice = onvista.last;
  } else if (
    onvista.previousAsOf &&
    onvista.previousAsOf === primary.asOf &&
    onvista.previousLast != null
  ) {
    onvistaPrice = onvista.previousLast;
  } else {
    throw new OnvistaAdapterError(
      `Cross-check: cannot align dates (primary asOf=${primary.asOf}, onvista lastAsOf=${onvista.lastAsOf}, previousAsOf=${onvista.previousAsOf})`,
      ONVISTA_UNAVAILABLE,
    );
  }
  if (onvistaPrice < instrument.priceMin || onvistaPrice > instrument.priceMax) {
    throw new OnvistaAdapterError(
      `Cross-check: onvista price ${onvistaPrice} out of range`,
      ONVISTA_UNAVAILABLE,
    );
  }
  const differencePct =
    Math.round(
      ((Math.abs(primary.price - onvistaPrice) / primary.price) * 100) * 10000,
    ) / 10000;
  const maxPct = instrument.crossCheckMaxPct ?? 2;
  if (differencePct > maxPct) {
    throw new OnvistaAdapterError(
      `Cross-check: difference ${differencePct}% > ${maxPct}% (primary=${primary.price}, onvista=${onvistaPrice})`,
      ONVISTA_MISMATCH,
    );
  }
  return { ok: true, onvistaPrice, differencePct };
}
