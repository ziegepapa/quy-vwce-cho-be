import type { BackupPayload, Quote, QuoteCandidate, QuoteSelectionPreference } from "./types";
import { BACKUP_SCHEMA_VERSION } from "./types";
import { nowIso } from "./defaults";
import {
  candidateId,
  isValidAsOfDate,
  isValidIsin,
  normalizeIsin,
  preferenceId,
  quoteId,
  toDateOnly,
} from "./instrument";
import { db } from "./db.m01a";
import { isSupportedBackupSchema } from "./backupSchema";
import { ensureMultiAssetMigrated } from "./db.m01b";
import { ensureQuoteFoundationMigrated } from "./db.m02";
import { resolveEffective } from "./quoteResolve";
import { applyResolvedEffective } from "./db.m03";

export { clearAllData, clearUserBusinessData, getOrCreateChecklist, countLocalData } from "./db.m10";

const CLEAR_TABLES = [
  () => db.settings,
  () => db.goals,
  () => db.transactions,
  () => db.annualChecklists,
  () => db.monthlySnapshots,
  () => db.appMetadata,
  () => db.outbox,
  () => db.conflicts,
  () => db.syncMeta,
  () => db.instruments,
  () => db.quotes,
  () => db.quoteCandidates,
  () => db.quotePreferences,
] as const;

async function clearAllTables(): Promise<void> {
  await Promise.all(CLEAR_TABLES.map((getTable) => getTable().clear()));
}

function validateInstrument(inst: { isin: string; currency: string; name: string }): void {
  const isin = normalizeIsin(inst.isin);
  if (!isValidIsin(isin)) throw new Error(`Backup instrument has invalid ISIN: ${inst.isin}`);
  const currency = String(inst.currency || "EUR").toUpperCase();
  if (!currency || currency.length < 3) throw new Error(`Backup instrument has invalid currency: ${inst.currency}`);
  if (!String(inst.name || "").trim()) throw new Error("Backup instrument has invalid name");
}

function validateQuote(q: Quote): void {
  const isin = normalizeIsin(q.instrumentIsin);
  if (!isValidIsin(isin)) throw new Error(`Backup quote has invalid ISIN: ${q.instrumentIsin}`);
  const currency = String(q.currency || "EUR").toUpperCase();
  if (!currency || currency.length < 3) throw new Error(`Backup quote has invalid currency: ${q.currency}`);
  if (typeof q.price !== "number" || !Number.isFinite(q.price) || q.price <= 0) {
    throw new Error(`Backup quote has invalid price: ${q.price}`);
  }
  if (!isValidAsOfDate(q.asOf)) throw new Error(`Backup quote has invalid asOf: ${q.asOf}`);
  if (q.source !== "manual" && q.source !== "auto") throw new Error(`Backup quote has invalid source: ${q.source}`);
}

function validateCandidate(c: QuoteCandidate): void {
  const isin = normalizeIsin(c.instrumentIsin);
  if (!isValidIsin(isin)) throw new Error(`Backup quoteCandidate has invalid ISIN: ${c.instrumentIsin}`);
  const currency = String(c.currency || "EUR").toUpperCase();
  if (!currency || currency.length < 3) throw new Error(`Backup quoteCandidate has invalid currency: ${c.currency}`);
  if (typeof c.price !== "number" || !Number.isFinite(c.price) || c.price <= 0) {
    throw new Error(`Backup quoteCandidate has invalid price: ${c.price}`);
  }
  if (!isValidAsOfDate(c.asOf)) throw new Error(`Backup quoteCandidate has invalid asOf: ${c.asOf}`);
  if (c.source !== "manual" && c.source !== "auto") throw new Error(`Backup quoteCandidate has invalid source: ${c.source}`);
}

function validatePreference(p: QuoteSelectionPreference): void {
  const isin = normalizeIsin(p.instrumentIsin);
  if (!isValidIsin(isin)) throw new Error(`Backup quotePreference has invalid ISIN: ${p.instrumentIsin}`);
  const currency = String(p.currency || "EUR").toUpperCase();
  if (!currency || currency.length < 3) throw new Error(`Backup quotePreference has invalid currency: ${p.currency}`);
  if (p.mode !== "auto" && p.mode !== "manual") throw new Error(`Backup quotePreference has invalid mode: ${p.mode}`);
}

async function importLegacyOrV2(payload: BackupPayload): Promise<void> {
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
      db.syncMeta,
      db.instruments,
      db.quotes,
      db.quoteCandidates,
      db.quotePreferences,
    ],
    async () => {
      await clearAllTables();
      if (payload.settings?.length) await db.settings.bulkPut(payload.settings);
      if (payload.goals?.length) await db.goals.bulkPut(payload.goals);
      if (payload.transactions?.length) await db.transactions.bulkPut(payload.transactions);
      if (payload.annualChecklists?.length) await db.annualChecklists.bulkPut(payload.annualChecklists);
      if (payload.monthlySnapshots?.length) await db.monthlySnapshots.bulkPut(payload.monthlySnapshots);
      if (payload.schemaVersion === 2 && payload.instruments?.length) {
        for (const inst of payload.instruments) {
          validateInstrument(inst);
          await db.instruments.put({
            ...inst,
            isin: normalizeIsin(inst.isin),
            currency: String(inst.currency || "EUR").toUpperCase(),
          });
        }
      }
      if (payload.schemaVersion === 2 && payload.quotes?.length) {
        for (const q of payload.quotes) {
          validateQuote(q);
          const isin = normalizeIsin(q.instrumentIsin);
          const currency = String(q.currency || "EUR").toUpperCase();
          await db.quotes.put({ ...q, id: quoteId(isin, currency), instrumentIsin: isin, currency });
        }
      }
    },
  );

  if (payload.schemaVersion === 1) {
    await ensureMultiAssetMigrated();
  }
  await ensureQuoteFoundationMigrated();
}

async function importV3(payload: BackupPayload): Promise<void> {
  const t = nowIso();
  const autoByKey = new Map<string, QuoteCandidate>();
  const manualByKey = new Map<string, QuoteCandidate>();
  const prefByKey = new Map<string, QuoteSelectionPreference>();

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
      db.syncMeta,
      db.instruments,
      db.quotes,
      db.quoteCandidates,
      db.quotePreferences,
    ],
    async () => {
      await clearAllTables();
      if (payload.settings?.length) await db.settings.bulkPut(payload.settings);
      if (payload.goals?.length) await db.goals.bulkPut(payload.goals);
      if (payload.transactions?.length) await db.transactions.bulkPut(payload.transactions);
      if (payload.annualChecklists?.length) await db.annualChecklists.bulkPut(payload.annualChecklists);
      if (payload.monthlySnapshots?.length) await db.monthlySnapshots.bulkPut(payload.monthlySnapshots);
      if (payload.instruments?.length) {
        for (const inst of payload.instruments) {
          validateInstrument(inst);
          await db.instruments.put({
            ...inst,
            isin: normalizeIsin(inst.isin),
            currency: String(inst.currency || "EUR").toUpperCase(),
          });
        }
      }
      if (payload.quoteCandidates?.length) {
        for (const c of payload.quoteCandidates) {
          validateCandidate(c);
          const isin = normalizeIsin(c.instrumentIsin);
          const currency = String(c.currency || "EUR").toUpperCase();
          const next: QuoteCandidate = {
            ...c,
            id: candidateId(isin, currency, c.source),
            instrumentIsin: isin,
            currency,
            createdAt: c.createdAt || t,
            updatedAt: c.updatedAt || t,
          };
          await db.quoteCandidates.put(next);
          const key = `${isin}::${currency}`;
          if (c.source === "manual") manualByKey.set(key, next);
          else autoByKey.set(key, next);
        }
      }
      if (payload.quotePreferences?.length) {
        for (const p of payload.quotePreferences) {
          validatePreference(p);
          const isin = normalizeIsin(p.instrumentIsin);
          const currency = String(p.currency || "EUR").toUpperCase();
          const next: QuoteSelectionPreference = {
            ...p,
            id: preferenceId(isin, currency),
            instrumentIsin: isin,
            currency,
            createdAt: p.createdAt || t,
            updatedAt: p.updatedAt || t,
          };
          await db.quotePreferences.put(next);
          prefByKey.set(`${isin}::${currency}`, next);
        }
      }

      const keys = new Set<string>([...autoByKey.keys(), ...manualByKey.keys(), ...prefByKey.keys()]);
      for (const key of keys) {
        const [isin, currency] = key.split("::");
        const resolved = resolveEffective({
          mode: prefByKey.get(key)?.mode === "manual" ? "manual" : "auto",
          auto: autoByKey.get(key) ?? null,
          manual: manualByKey.get(key) ?? null,
          nowDate: toDateOnly(),
          existingEffective: null,
        });
        await applyResolvedEffective(isin, currency, resolved.effective, { t, syncSettings: false });
      }

      await db.appMetadata.put({
        id: "quoteMigration",
        state: "complete",
        updatedAt: t,
      } as unknown as { id: string; schemaVersion: number; lastBackupAt: string; createdAt: string; updatedAt: string });
    },
  );
}

export async function importBackup(payload: BackupPayload): Promise<void> {
  if (!payload || typeof payload !== "object") throw new Error("JSON không hợp lệ");
  if (!isSupportedBackupSchema(payload.schemaVersion)) {
    throw new Error(`schemaVersion không khớp (cần 1, 2 hoặc ${BACKUP_SCHEMA_VERSION})`);
  }
  if (payload.schemaVersion === 3) {
    await importV3(payload);
    return;
  }
  await importLegacyOrV2(payload);
}
