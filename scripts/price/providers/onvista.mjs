/**
 * onvista snapshot adapter — only for instruments with explicit verified mapping.
 */

import { dateStringInTz, roundPrice } from "../time.mjs";

export class OnvistaAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = "OnvistaAdapterError";
  }
}

/**
 * @param {unknown} body
 * @param {object} instrument with crossCheckProvider
 */
export function parseOnvistaSnapshot(body, instrument) {
  const cfg = instrument.crossCheckProvider;
  if (!cfg) {
    throw new OnvistaAdapterError(`No crossCheckProvider for ${instrument.isin}`);
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
  if (typeof datetimeLast !== "string") {
    throw new OnvistaAdapterError("onvista: missing datetimeLast");
  }
  const tz = instrument.timezone || "Europe/Berlin";
  return {
    isin,
    last: roundPrice(last),
    previousLast:
      typeof previousLast === "number" && Number.isFinite(previousLast) && previousLast > 0
        ? roundPrice(previousLast)
        : null,
    datetimeLast,
    datetimePreviousLast:
      typeof datetimePreviousLast === "string" ? datetimePreviousLast : null,
    lastAsOf: dateStringInTz(new Date(datetimeLast), tz),
    previousAsOf: datetimePreviousLast
      ? dateStringInTz(new Date(datetimePreviousLast), tz)
      : null,
  };
}

/**
 * Cross-check primary price vs onvista same-day (or previousLast alignment).
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
    );
  }
  if (onvistaPrice < instrument.priceMin || onvistaPrice > instrument.priceMax) {
    throw new OnvistaAdapterError(`Cross-check: onvista price ${onvistaPrice} out of range`);
  }
  const differencePct =
    Math.round(
      ((Math.abs(primary.price - onvistaPrice) / primary.price) * 100) * 10000,
    ) / 10000;
  const maxPct = instrument.crossCheckMaxPct ?? 2;
  if (differencePct > maxPct) {
    throw new OnvistaAdapterError(
      `Cross-check: difference ${differencePct}% > ${maxPct}% (primary=${primary.price}, onvista=${onvistaPrice})`,
    );
  }
  return { ok: true, onvistaPrice, differencePct };
}
