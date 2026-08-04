import type { AppSettings, Instrument, Quote } from "./types";
import { VWCE_ISIN } from "./types";
import { defaultSettings, nowIso } from "./defaults";
import { isValidIsin, normalizeIsin, quoteId } from "./instrument";
import { enqueueOutbox } from "./sync/outbox";
import { db } from "./db.m01a";
export async function applyResolvedEffective(
  isin: string,
  currency: string,
  effective: Quote | null,
  opts: { syncSettings?: boolean; t: string },
): Promise<void> {
  const qid = quoteId(isin, currency);
  if (effective) {
    await db.quotes.put(effective);
  } else {
    await db.quotes.delete(qid);
  }
  if (isin === VWCE_ISIN) {
    const current = (await db.settings.get("settings")) ?? defaultSettings();
    const rawVer = (current as AppSettings & { version?: number }).version;
    const prevVer = typeof rawVer === "number" ? rawVer : 0;
    const price = effective?.price;
    const asOf = effective?.asOf;
    const economicsChanged =
      effective != null &&
      (current.latestVwcePrice !== price || current.latestPriceDate !== asOf);
    if (economicsChanged && price != null && asOf) {
      const ver = prevVer + 1;
      const settingsNext = {
        ...current,
        id: "settings",
        latestVwcePrice: price,
        latestPriceDate: asOf,
        updatedAt: opts.t,
        version: ver,
      };
      await db.settings.put(settingsNext as AppSettings);
      if (opts.syncSettings !== false) {
        await enqueueOutbox("settings", "settings", "upsert", settingsNext, ver);
      }
    }
  }
}

export async function listInstruments(): Promise<Instrument[]> {
  return db.instruments.toArray();
}

export async function upsertInstrument(
  inst: Instrument,
  opts?: { sync?: boolean },
): Promise<void> {
  const isin = normalizeIsin(inst.isin);
  if (!isValidIsin(isin)) {
    throw new Error(`Invalid ISIN: ${inst.isin}`);
  }
  const currency = String(inst.currency || "EUR").toUpperCase();
  const next: Instrument = {
    ...inst,
    isin,
    currency,
    ticker: inst.ticker ? String(inst.ticker).trim().toUpperCase() : inst.ticker,
    name: String(inst.name || "").trim() || isin,
    updatedAt: nowIso(),
    createdAt: inst.createdAt || nowIso(),
  };
  await db.instruments.put(next);
  void opts;
}
