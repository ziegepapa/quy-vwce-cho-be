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
import { SCHEMA_VERSION, VWCE_ISIN } from "./types";
import { defaultChecklist, defaultGoals, defaultSettings, nowIso, uid } from "./defaults";
import {
  isValidAsOfDate,
  isValidIsin,
  normalizeIsin,
  quoteId,
  resolveInstrumentIsin,
} from "./instrument";
import type { ConflictRecord, OutboxItem, SyncMeta } from "./sync/types";
import { enqueueOutbox } from "./sync/outbox";

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

/** Pure: fill instrumentIsin on legacy security rows (idempotent). */
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

/**
 * Atomic multi-asset migration (idempotent).
 * - Seeds VWCE instrument
 * - Patches legacy transactions with instrumentIsin
 * - Migrates settings.latestVwcePrice only when price > 0 AND asOf is a valid YYYY-MM-DD
 *
 * instruments/quotes are local-only until Supabase EntityTable supports them
 * (no outbox enqueue here).
 */
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
  // Local-only: EntityTable does not include instruments yet — never enqueue outbox.
  void opts;
}

export async function listQuotes(): Promise<Quote[]> {
  return db.quotes.toArray();
}

export async function upsertQuote(q: Quote, opts?: { sync?: boolean }): Promise<void> {
  const isin = normalizeIsin(q.instrumentIsin);
  if (!isValidIsin(isin)) {
    throw new Error(`Invalid quote ISIN: ${q.instrumentIsin}`);
  }
  const currency = String(q.currency || "EUR").toUpperCase();
  if (!currency || currency.length < 3) {
    throw new Error(`Invalid quote currency: ${q.currency}`);
  }
  if (typeof q.price !== "number" || !Number.isFinite(q.price) || q.price <= 0) {
    throw new Error(`Invalid quote price: ${q.price}`);
  }
  if (!isValidAsOfDate(q.asOf)) {
    throw new Error(`Invalid quote asOf (need YYYY-MM-DD): ${q.asOf}`);
  }
  if (q.source !== "manual" && q.source !== "auto") {
    throw new Error(`Invalid quote source: ${q.source}`);
  }
  const id = quoteId(isin, currency);
  // Reject mismatched id to avoid collisions / spoofed keys
  if (q.id && q.id !== id) {
    throw new Error(`Quote id mismatch: expected ${id}, got ${q.id}`);
  }
  const next: Quote = {
    ...q,
    id,
    instrumentIsin: isin,
    currency,
    price: q.price,
    asOf: String(q.asOf).trim(),
    source: q.source,
    updatedAt: nowIso(),
    createdAt: q.createdAt || nowIso(),
  };
  await db.quotes.put(next);
  // Local-only until sync EntityTable supports quotes
  void opts;
}

export async function getQuoteForIsin(
  isin: string,
  currency = "EUR",
): Promise<Quote | undefined> {
  return db.quotes.get(quoteId(isin, currency));
}

export type ManualQuoteInput = {
  instrumentIsin: string;
  price: number;
  asOf: string;
  currency?: string;
  venue?: string;
  /** Optional display name for newly created minimal instrument (defaults to ISIN). */
  name?: string;
};

/**
 * Policy A — single entry point for manual quotes:
 * 1. Validate ISIN/price/asOf.
 * 2. In one Dexie transaction: ensure minimal Instrument exists, put Quote,
 *    and if ISIN is VWCE also mirror latestVwcePrice/latestPriceDate.
 * 3. After commit, enqueue settings outbox for VWCE only (local quote/instrument never outbox).
 *
 * Fails closed: validation or transaction errors leave prior state intact (no empty catch).
 */
export async function saveManualQuoteForIsin(
  input: ManualQuoteInput,
  opts?: { syncSettings?: boolean },
): Promise<{ quote: Quote; instrument: Instrument }> {
  const isin = normalizeIsin(input.instrumentIsin);
  if (!isValidIsin(isin)) {
    throw new Error(`Invalid ISIN: ${input.instrumentIsin}`);
  }
  const currency = String(input.currency || "EUR").toUpperCase();
  if (!currency || currency.length < 3) {
    throw new Error(`Invalid quote currency: ${input.currency}`);
  }
  if (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price <= 0) {
    throw new Error(`Invalid quote price: ${input.price}`);
  }
  if (!isValidAsOfDate(input.asOf)) {
    throw new Error(`Invalid quote asOf (need YYYY-MM-DD): ${input.asOf}`);
  }

  const asOf = String(input.asOf).trim();
  const t = nowIso();
  const id = quoteId(isin, currency);
  let resultInstrument!: Instrument;
  let resultQuote!: Quote;
  let settingsNext: (AppSettings & { version?: number }) | null = null;

  await db.transaction(
    "rw",
    [db.instruments, db.quotes, db.settings],
    async () => {
      const existingInst = await db.instruments.get(isin);
      if (existingInst) {
        resultInstrument = existingInst;
      } else {
        // Minimal local instrument — no ticker inference from ISIN
        const name =
          String(input.name ?? "").trim() ||
          (isin === VWCE_ISIN
            ? "Vanguard FTSE All-World UCITS ETF (USD) Accumulating"
            : isin);
        resultInstrument = {
          isin,
          name,
          currency,
          venue: input.venue,
          createdAt: t,
          updatedAt: t,
        };
        if (isin === VWCE_ISIN) {
          resultInstrument = {
            ...resultInstrument,
            ticker: "VWCE",
            venue: input.venue || "XETRA",
            providerSymbols: { yahoo: "VWCE.DE" },
          };
        }
        await db.instruments.put(resultInstrument);
      }

      const existingQ = await db.quotes.get(id);
      resultQuote = {
        id,
        instrumentIsin: isin,
        currency,
        venue: input.venue ?? existingQ?.venue ?? resultInstrument.venue,
        price: input.price,
        asOf,
        source: "manual",
        createdAt: existingQ?.createdAt ?? t,
        updatedAt: t,
      };
      await db.quotes.put(resultQuote);

      // VWCE legacy mirror in the same transaction — quote is source of truth for price/asOf
      if (isin === VWCE_ISIN) {
        const current = (await db.settings.get("settings")) ?? defaultSettings();
        const base = current;
        const ver = ((base as AppSettings & { version?: number }).version ?? 0) + 1;
        settingsNext = {
          ...base,
          id: "settings",
          latestVwcePrice: input.price,
          latestPriceDate: asOf,
          updatedAt: t,
          version: ver,
        };
        await db.settings.put(settingsNext as AppSettings);
      }
    },
  );

  // Outbox only after local tables are consistent
  if (settingsNext && opts?.syncSettings !== false) {
    await enqueueOutbox("settings", "settings", "upsert", settingsNext, settingsNext.version ?? 1);
  }

  return { quote: resultQuote, instrument: resultInstrument };
}

export async function ensureInitialized(seedSample: boolean): Promise<void> {
  const existing = await db.settings.get("settings");
  if (existing?.onboardingDone) {
    await ensureMultiAssetMigrated();
    return;
  }
  const settings = defaultSettings();
  settings.onboardingDone = true;
  settings.disclaimerAccepted = true;
  await db.settings.put(settings);
  await db.appMetadata.put({
    id: "meta",
    schemaVersion: SCHEMA_VERSION,
    lastBackupAt: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  if (seedSample) {
    await db.goals.clear();
    await db.goals.bulkPut(defaultGoals());
  }
  await ensureMultiAssetMigrated();
}

export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get("settings")) ?? defaultSettings();
}

export async function saveSettings(
  partial: Partial<AppSettings>,
  opts?: { sync?: boolean },
): Promise<void> {
  const current = await getSettings();
  const ver = ((current as AppSettings & { version?: number }).version ?? 0) + 1;
  const next = { ...current, ...partial, id: "settings", updatedAt: nowIso(), version: ver };
  await db.settings.put(next as AppSettings);
  if (opts?.sync !== false) {
    await enqueueOutbox("settings", "settings", "upsert", next, ver);
  }
}

export async function listGoals(): Promise<Goal[]> {
  const all = await db.goals.orderBy("dueDate").toArray();
  return all.filter((g) => !(g as Goal & { deletedAt?: string }).deletedAt);
}

export async function listTransactions(): Promise<Transaction[]> {
  const all = await db.transactions.toArray();
  return all
    .filter((t) => !(t as Transaction & { deletedAt?: string }).deletedAt)
    .map(migrateTransactionIsin)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** C3 — tìm giao dịch theo externalRef, bỏ qua tombstone đã xóa. */
export async function findTransactionByExternalRef(
  externalRef: string,
): Promise<Transaction | undefined> {
  if (!externalRef) return undefined;
  const all = await db.transactions.toArray();
  return all.find(
    (t) =>
      !(t as Transaction & { deletedAt?: string }).deletedAt &&
      (t as Transaction & { externalRef?: string }).externalRef === externalRef,
  );
}

export async function upsertTransaction(
  tx: Transaction,
  opts?: { sync?: boolean },
): Promise<void> {
  // Fail closed: security txs need a resolvable ISIN with valid checksum before persist
  if (
    tx.type === "buy_security" ||
    tx.type === "sell_security" ||
    tx.type === "buy_vwce" ||
    tx.type === "sell_vwce"
  ) {
    const resolved = resolveInstrumentIsin(tx);
    if (!resolved) {
      throw new Error("Security transaction requires instrumentIsin");
    }
    if (!isValidIsin(resolved)) {
      throw new Error(`Security transaction has invalid ISIN checksum: ${resolved}`);
    }
    tx = { ...tx, instrumentIsin: resolved };
  }
  const ver = ((tx as Transaction & { version?: number }).version ?? 0) + 1;
  const { deletedAt: _drop, ...rest } = tx as Transaction & { deletedAt?: string; version?: number };
  const next = { ...rest, updatedAt: nowIso(), version: ver } as Transaction & { version: number };
  delete (next as { deletedAt?: string }).deletedAt;
  await db.transactions.put(next as Transaction);
  if (opts?.sync !== false) {
    await enqueueOutbox("transactions", next.id, "upsert", next, ver);
  }
}

export async function deleteTransaction(id: string, opts?: { sync?: boolean }): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) {
    if (opts?.sync !== false) {
      await enqueueOutbox("transactions", id, "delete", null, 1);
    }
    return;
  }
  const ver = ((existing as Transaction & { version?: number }).version ?? 0) + 1;
  const tombstone: Transaction & { version: number } = {
    ...existing,
    deletedAt: nowIso(),
    updatedAt: nowIso(),
    version: ver,
  };
  await db.transactions.put(tombstone as Transaction);
  if (opts?.sync !== false) {
    await enqueueOutbox("transactions", id, "delete", null, ver);
  }
}

export async function upsertGoal(g: Goal, opts?: { sync?: boolean }): Promise<void> {
  const ver = ((g as Goal & { version?: number }).version ?? 0) + 1;
  const { deletedAt: _drop, ...rest } = g as Goal & { deletedAt?: string; version?: number };
  const next = { ...rest, updatedAt: nowIso(), version: ver } as Goal & { version: number };
  delete (next as { deletedAt?: string }).deletedAt;
  await db.goals.put(next as Goal);
  if (opts?.sync !== false) {
    await enqueueOutbox("goals", next.id, "upsert", next, ver);
  }
}

export async function deleteGoal(id: string, opts?: { sync?: boolean }): Promise<void> {
  const existing = await db.goals.get(id);
  if (!existing) {
    if (opts?.sync !== false) {
      await enqueueOutbox("goals", id, "delete", null, 1);
    }
    return;
  }
  const ver = ((existing as Goal & { version?: number }).version ?? 0) + 1;
  const tombstone: Goal & { version: number } = {
    ...existing,
    deletedAt: nowIso(),
    updatedAt: nowIso(),
    version: ver,
  };
  await db.goals.put(tombstone as Goal);
  if (opts?.sync !== false) {
    await enqueueOutbox("goals", id, "delete", null, ver);
  }
}

export async function exportBackup(): Promise<BackupPayload> {
  const [settings, goalsRaw, transactionsRaw, annualChecklists, monthlySnapshots, instruments, quotes] =
    await Promise.all([
      db.settings.toArray(),
      db.goals.toArray(),
      db.transactions.toArray(),
      db.annualChecklists.toArray(),
      db.monthlySnapshots.toArray(),
      db.instruments.toArray(),
      db.quotes.toArray(),
    ]);
  const goals = goalsRaw.filter((g) => !(g as Goal & { deletedAt?: string }).deletedAt);
  const transactions = transactionsRaw
    .filter((t) => !(t as Transaction & { deletedAt?: string }).deletedAt)
    .map(migrateTransactionIsin);
  const payload: BackupPayload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    settings,
    goals,
    transactions,
    annualChecklists,
    monthlySnapshots,
    instruments,
    quotes,
  };
  const meta = await db.appMetadata.get("meta");
  await db.appMetadata.put({
    id: "meta",
    schemaVersion: SCHEMA_VERSION,
    lastBackupAt: payload.exportedAt,
    createdAt: meta?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  });
  return payload;
}

/**
 * Import backup. Accepts schema 1 (legacy) or 2 (multi-asset).
 * On failure the Dexie transaction rolls back; ensureMultiAssetMigrated runs after success only.
 */
export async function importBackup(payload: BackupPayload): Promise<void> {
  if (!payload || typeof payload !== "object") throw new Error("JSON không hợp lệ");
  if (payload.schemaVersion !== 1 && payload.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`schemaVersion không khớp (cần 1 hoặc ${SCHEMA_VERSION})`);
  }
  await db.transaction(
    "rw",
    [
      db.settings,
      db.goals,
      db.transactions,
      db.annualChecklists,
      db.monthlySnapshots,
      db.instruments,
      db.quotes,
    ],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.goals.clear(),
        db.transactions.clear(),
        db.annualChecklists.clear(),
        db.monthlySnapshots.clear(),
        db.instruments.clear(),
        db.quotes.clear(),
      ]);
      if (payload.settings?.length) await db.settings.bulkPut(payload.settings);
      if (payload.goals?.length) await db.goals.bulkPut(payload.goals);
      const txs = (payload.transactions ?? []).map(migrateTransactionIsin);
      if (txs.length) await db.transactions.bulkPut(txs);
      if (payload.annualChecklists?.length) await db.annualChecklists.bulkPut(payload.annualChecklists);
      if (payload.monthlySnapshots?.length) await db.monthlySnapshots.bulkPut(payload.monthlySnapshots);
      // schemaVersion 2: instruments/quotes must all be valid or the whole import rolls back
      if (payload.schemaVersion === SCHEMA_VERSION) {
        if (payload.instruments?.length) {
          for (const inst of payload.instruments) {
            const isin = normalizeIsin(inst.isin);
            if (!isValidIsin(isin)) {
              throw new Error(`Backup instrument has invalid ISIN: ${inst.isin}`);
            }
            await db.instruments.put({ ...inst, isin });
          }
        }
        if (payload.quotes?.length) {
          for (const q of payload.quotes) {
            const isin = normalizeIsin(q.instrumentIsin);
            if (!isValidIsin(isin)) {
              throw new Error(`Backup quote has invalid ISIN: ${q.instrumentIsin}`);
            }
            if (!isValidAsOfDate(q.asOf)) {
              throw new Error(`Backup quote has invalid asOf: ${q.asOf}`);
            }
            if (typeof q.price !== "number" || !(q.price > 0) || !Number.isFinite(q.price)) {
              throw new Error(`Backup quote has invalid price: ${q.price}`);
            }
            const currency = String(q.currency || "EUR").toUpperCase();
            if (!currency || currency.length < 3) {
              throw new Error(`Backup quote has invalid currency: ${q.currency}`);
            }
            if (q.source !== "manual" && q.source !== "auto") {
              throw new Error(`Backup quote has invalid source: ${q.source}`);
            }
            await db.quotes.put({
              ...q,
              id: quoteId(isin, currency),
              instrumentIsin: isin,
              currency,
            });
          }
        }
      } else if (payload.schemaVersion === 1) {
        // Legacy v1: ignore optional multi-asset arrays if present; migration seeds VWCE after commit
      }
    },
  );
  await ensureMultiAssetMigrated();
}

export async function clearAllData(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.settings,
      db.goals,
      db.transactions,
      db.annualChecklists,
      db.monthlySnapshots,
      db.appMetadata,
      db.outbox,
      db.conflicts,
      db.instruments,
      db.quotes,
    ],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.goals.clear(),
        db.transactions.clear(),
        db.annualChecklists.clear(),
        db.monthlySnapshots.clear(),
        db.appMetadata.clear(),
        db.outbox.clear(),
        db.conflicts.clear(),
        db.instruments.clear(),
        db.quotes.clear(),
      ]);
    },
  );
}

export async function clearUserBusinessData(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.settings,
      db.goals,
      db.transactions,
      db.annualChecklists,
      db.monthlySnapshots,
      db.outbox,
      db.conflicts,
      db.instruments,
      db.quotes,
    ],
    async () => {
      await Promise.all([
        db.settings.clear(),
        db.goals.clear(),
        db.transactions.clear(),
        db.annualChecklists.clear(),
        db.monthlySnapshots.clear(),
        db.outbox.clear(),
        db.conflicts.clear(),
        db.instruments.clear(),
        db.quotes.clear(),
      ]);
    },
  );
}

export async function getOrCreateChecklist(year: number): Promise<AnnualChecklist> {
  const id = `checklist_${year}`;
  const existing = await db.annualChecklists.get(id);
  if (existing) return existing;
  const c = defaultChecklist(year);
  await db.annualChecklists.put(c);
  await enqueueOutbox("annualChecklists", id, "upsert", c, 1);
  return c;
}

export async function countLocalData(): Promise<{
  settings: number;
  goals: number;
  transactions: number;
  annualChecklists: number;
  monthlySnapshots: number;
}> {
  const [settings, goalsRaw, transactionsRaw, annualChecklists, monthlySnapshots] = await Promise.all([
    db.settings.count(),
    db.goals.toArray(),
    db.transactions.toArray(),
    db.annualChecklists.count(),
    db.monthlySnapshots.count(),
  ]);
  const goals = goalsRaw.filter((g) => !(g as Goal & { deletedAt?: string }).deletedAt).length;
  const transactions = transactionsRaw.filter(
    (t) => !(t as Transaction & { deletedAt?: string }).deletedAt,
  ).length;
  return { settings, goals, transactions, annualChecklists, monthlySnapshots };
}

export { uid };
