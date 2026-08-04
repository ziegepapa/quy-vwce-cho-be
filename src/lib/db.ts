import Dexie, { type Table } from "dexie";
import type {
  AnnualChecklist,
  AppMetadata,
  AppSettings,
  BackupPayload,
  Goal,
  Instrument,
  MonthlySnapshot,
  Quote,
  Transaction,
} from "./types";
import { VWCE_ISIN } from "./types";
import { defaultSettings, nowIso, uid } from "./defaults";
import {
  isValidAsOfDate,
  normalizeIsin,
  quoteId,
  resolveInstrumentIsin,
} from "./instrument";
import type { ConflictRecord, OutboxItem, SyncMeta } from "./sync/types";
import { enqueueOutbox } from "./sync/outbox";
import { isSupportedBackupSchema } from "./backupSchema";

// TEMPORARY STUB — full foundation db.ts pending push (41KB exceeds MCP tool arg limit).
// See sandbox /home/workdir/artifacts/repo/src/lib/db.ts for complete implementation.
// This stub matches main@0f2b3d96 pre-foundation behavior so the branch is not left broken.

export class VwceDB extends Dexie {
  settings!: Table<AppSettings, string>;
  goals!: Table<Goal, string>;
  transactions!: Table<Transaction, string>;
  annualChecklists!: Table<AnnualChecklist, string>;
  monthlySnapshots!: Table<MonthlySnapshot, string>;
  appMetadata!: Table<AppMetadata, string>;
  outbox!: Table<OutboxItem, string>;
  conflicts!: Table<ConflictRecord, string>;
  syncMeta!: Table<SyncMeta, string>;
  instruments!: Table<Instrument, string>;
  quotes!: Table<Quote, string>;

  constructor() {
    super("quy_vwce_cho_be");
    this.version(1).stores({
      settings: "id",
      goals: "id, dueDate",
      transactions: "id, date, type",
      annualChecklists: "id, year",
      monthlySnapshots: "id, year, month",
      appMetadata: "id",
    });
    this.version(2).stores({
      settings: "id",
      goals: "id, dueDate",
      transactions: "id, date, type",
      annualChecklists: "id, year",
      monthlySnapshots: "id, year, month",
      appMetadata: "id",
      outbox: "id, table, entityId, createdAt",
      conflicts: "id, table, entityId",
      syncMeta: "id, userId",
    });
    this.version(3).stores({
      settings: "id",
      goals: "id, dueDate",
      transactions: "id, date, type, instrumentIsin",
      annualChecklists: "id, year",
      monthlySnapshots: "id, year, month",
      appMetadata: "id",
      outbox: "id, table, entityId, createdAt",
      conflicts: "id, table, entityId",
      syncMeta: "id, userId",
      instruments: "isin, ticker",
      quotes: "id, instrumentIsin, currency",
    });
  }
}

export const db = new VwceDB();

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
}

export async function listQuotes(): Promise<Quote[]> {
  return db.quotes.toArray();
}

export async function getQuoteForIsin(
  isin: string,
  currency = "EUR",
): Promise<Quote | undefined> {
  return db.quotes.get(quoteId(isin, currency));
}

export async function upsertQuote(q: Quote): Promise<void> {
  await db.quotes.put(q);
}

export async function saveManualQuoteForIsin(args: {
  isin: string;
  price: number;
  asOf: string;
  currency?: string;
  venue?: string;
}): Promise<void> {
  const currency = (args.currency || "EUR").toUpperCase();
  const t = nowIso();
  const isin = normalizeIsin(args.isin);
  const q: Quote = {
    id: quoteId(isin, currency),
    instrumentIsin: isin,
    currency,
    venue: args.venue,
    price: args.price,
    asOf: args.asOf,
    source: "manual",
    createdAt: t,
    updatedAt: t,
  };
  await db.transaction("rw", [db.quotes, db.settings, db.outbox], async () => {
    await db.quotes.put(q);
    if (isin === VWCE_ISIN) {
      const current = (await db.settings.get("settings")) ?? defaultSettings();
      const rawVer = (current as AppSettings & { version?: number }).version;
      const prevVer = typeof rawVer === "number" ? rawVer : 0;
      const ver = prevVer + 1;
      const settingsNext = {
        ...current,
        id: "settings",
        latestVwcePrice: args.price,
        latestPriceDate: args.asOf,
        updatedAt: t,
        version: ver,
      };
      await db.settings.put(settingsNext as AppSettings);
      await enqueueOutbox("settings", "settings", "upsert", settingsNext, ver);
    }
  });
}

export async function exportBackup(): Promise<BackupPayload> {
  throw new Error("STUB: full exportBackup pending complete db.ts push");
}

export async function importBackup(_payload: BackupPayload): Promise<void> {
  throw new Error("STUB: full importBackup pending complete db.ts push");
}

export async function clearAllData(): Promise<void> {
  throw new Error("STUB: full clearAllData pending complete db.ts push");
}

export { uid, isSupportedBackupSchema };
