import type {
  AppMetadata, AppSettings, Instrument, Quote, Transaction, QuoteMigrationMeta,
} from "./types";
import { VWCE_ISIN } from "./types";
import { nowIso } from "./defaults";
import { isValidAsOfDate, isValidIsin, normalizeIsin, quoteId, resolveInstrumentIsin } from "./instrument";
import { db } from "./db.m01a";

export function migrateTransactionIsin(tx: Transaction): Transaction {
  if (
    tx.type !== "buy_vwce" &&
    tx.type !== "sell_vwce" &&
    tx.type !== "buy_security" &&
    tx.type !== "sell_security"
  ) {
    return tx;
  }
  const resolved = resolveInstrumentIsin(tx);
  if (!resolved) return tx;
  if (normalizeIsin(tx.instrumentIsin) === resolved) return tx;
  return { ...tx, instrumentIsin: resolved };
}

function defaultVwceInstrument(t: string): Instrument {
  return {
    isin: VWCE_ISIN,
    name: "Vanguard FTSE All-World UCITS ETF (USD) Accumulating",
    ticker: "VWCE",
    currency: "EUR",
    venue: "XETRA",
    providerSymbols: { yahoo: "VWCE.DE" },
    createdAt: t,
    updatedAt: t,
  };
}

export async function ensureMultiAssetMigrated(): Promise<void> {
  const t = nowIso();
  await db.transaction(
    "rw",
    [db.instruments, db.quotes, db.transactions, db.settings],
    async () => {
      const existingInst = await db.instruments.get(VWCE_ISIN);
      if (!existingInst) {
        await db.instruments.put(defaultVwceInstrument(t));
      }

      const allTx = await db.transactions.toArray();
      const patched: Transaction[] = [];
      for (const tx of allTx) {
        const next = migrateTransactionIsin(tx);
        if (next.instrumentIsin !== tx.instrumentIsin) patched.push(next);
      }
      if (patched.length) await db.transactions.bulkPut(patched);

      const settings = await db.settings.get("settings");
      if (settings) {
        const qid = quoteId(VWCE_ISIN, "EUR");
        const existingQ = await db.quotes.get(qid);
        const price = settings.latestVwcePrice;
        const asOf = settings.latestPriceDate;
        const canMigrate =
          !existingQ &&
          typeof price === "number" &&
          Number.isFinite(price) &&
          price > 0 &&
          isValidAsOfDate(asOf);
        if (canMigrate) {
          const q: Quote = {
            id: qid,
            instrumentIsin: VWCE_ISIN,
            currency: "EUR",
            venue: "XETRA",
            price,
            asOf: String(asOf).trim(),
            source: "manual",
            createdAt: t,
            updatedAt: t,
          };
          await db.quotes.put(q);
        }
      }
    },
  );
}

export async function runPendingMigrations(): Promise<void> {
  await ensureMultiAssetMigrated();
  const { ensureQuoteFoundationMigrated } = await import("./db.m02");
  await ensureQuoteFoundationMigrated();
}

export const QUOTE_MIGRATION_META_ID = "quoteMigration";

export async function isQuoteMigrationComplete(): Promise<boolean> {
  const meta = (await db.appMetadata.get(QUOTE_MIGRATION_META_ID)) as
    | QuoteMigrationMeta
    | undefined;
  return meta?.state === "complete";
}

export async function assertQuoteWritesUnlocked(): Promise<void> {
  const meta = (await db.appMetadata.get(QUOTE_MIGRATION_META_ID)) as
    | QuoteMigrationMeta
    | undefined;
  if (!meta || meta.state !== "complete") {
    throw new Error(
      `Quote writes locked until migration complete (state=${meta?.state ?? "absent"})`,
    );
  }
}

export function coerceQuoteSource(raw: unknown): "manual" | "auto" {
  if (raw === "auto") return "auto";
  return "manual";
}

export function validateQuoteRowForMigration(q: Quote): void {
  const isin = normalizeIsin(q.instrumentIsin);
  if (!isValidIsin(isin)) {
    throw new Error(`Migration: invalid ISIN on quote ${q.id}: ${q.instrumentIsin}`);
  }
  const currency = String(q.currency || "EUR").toUpperCase();
  if (!currency || currency.length < 3) {
    throw new Error(`Migration: invalid currency on quote ${q.id}`);
  }
  if (typeof q.price !== "number" || !Number.isFinite(q.price) || q.price <= 0) {
    throw new Error(`Migration: invalid price on quote ${q.id}: ${q.price}`);
  }
  if (!isValidAsOfDate(q.asOf)) {
    throw new Error(`Migration: invalid asOf on quote ${q.id}: ${q.asOf}`);
  }
}
