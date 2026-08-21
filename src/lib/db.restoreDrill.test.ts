import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import { replayTransactions } from "./calc";
import { clearAllData, db, exportBackup, importBackup } from "./db";
import { defaultSettings } from "./defaults";
import { candidateId, preferenceId, quoteId } from "./instrument";
import type {
  AnnualChecklist,
  AppSettings,
  Goal,
  MonthlySnapshot,
  Quote,
  QuoteCandidate,
  QuoteSelectionPreference,
  Transaction,
} from "./types";
import { VWCE_ISIN } from "./types";

const T = "2026-08-21T12:00:00.000Z";
const D = "2026-08-21";

function byId<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}

function quoteEvidence(rows: Quote[]) {
  return byId(rows).map(({ id, instrumentIsin, currency, price, asOf, source, provider }) => ({
    id, instrumentIsin, currency, price, asOf, source, provider,
  }));
}

/** Restore may update local settings bookkeeping while resolving effective quotes. */
function settingsEvidence(rows: AppSettings[]) {
  return byId(rows).map((row) => {
    const { updatedAt: _updatedAt, version: _version, ...evidence } = row as AppSettings & { version?: number };
    return evidence;
  });
}

async function portableState() {
  const [settings, goals, transactions, annualChecklists, monthlySnapshots, instruments, quotes, quoteCandidates, quotePreferences] =
    await Promise.all([
      db.settings.toArray(),
      db.goals.toArray(),
      db.transactions.toArray(),
      db.annualChecklists.toArray(),
      db.monthlySnapshots.toArray(),
      db.instruments.toArray(),
      db.quotes.toArray(),
      db.quoteCandidates.toArray(),
      db.quotePreferences.toArray(),
    ]);
  const liveTransactions = transactions.filter((row) => !row.deletedAt);
  return {
    settings: settingsEvidence(settings),
    goals: byId(goals),
    transactions: byId(transactions),
    annualChecklists: byId(annualChecklists),
    monthlySnapshots: byId(monthlySnapshots),
    instruments: [...instruments].sort((a, b) => a.isin.localeCompare(b.isin)),
    quotes: quoteEvidence(quotes),
    quoteCandidates: byId(quoteCandidates),
    quotePreferences: byId(quotePreferences),
    replay: replayTransactions(liveTransactions),
  };
}

async function seedSyntheticVault(): Promise<void> {
  await db.settings.put({
    ...defaultSettings(),
    planName: "H3 synthetic restore drill",
    childName: "Synthetic child",
    trackInAppCash: true,
    latestVwcePrice: 110,
    latestPriceDate: "2026-08-20",
    createdAt: T,
    updatedAt: T,
  });

  const goals: Goal[] = [
    { id: "goal-live", name: "Synthetic future goal", dueDate: "2042-06-30", amount: 50000, mode: "purchasing_power", baseYear: 2026, inflationRate: 0.02, bufferPct: 0.1, urgency: "hard", protectedAmount: 200, notes: "fixture", createdAt: T, updatedAt: T },
    { id: "goal-tombstone", name: "Deleted synthetic goal", dueDate: "2035-06-30", amount: 1, mode: "nominal", baseYear: 2026, inflationRate: 0.02, bufferPct: 0.1, urgency: "flexible", protectedAmount: 0, notes: "fixture", createdAt: T, updatedAt: T, deletedAt: T },
  ];
  await db.goals.bulkPut(goals);

  const transactions: Transaction[] = [
    { id: "tx-cash-in", date: "2026-08-01", type: "cash_in", amount: 1000, notes: "synthetic contribution", createdAt: "2026-08-01T08:00:00.000Z", updatedAt: T, source: "manual" },
    { id: "tx-buy", date: "2026-08-02", type: "buy_vwce", amount: 400, unitPrice: 100, quantity: 4, fee: 2, tax: 0, instrumentIsin: VWCE_ISIN, notes: "synthetic buy", createdAt: "2026-08-02T08:00:00.000Z", updatedAt: T, source: "manual" },
    { id: "tx-sell", date: "2026-08-03", type: "sell_vwce", amount: 110, quantity: 1, fee: 1, tax: 2, instrumentIsin: VWCE_ISIN, notes: "synthetic sale", createdAt: "2026-08-03T08:00:00.000Z", updatedAt: T, source: "manual" },
    { id: "tx-fee", date: "2026-08-04", type: "fee", amount: 5, notes: "recorded fee", createdAt: "2026-08-04T08:00:00.000Z", updatedAt: T, source: "manual" },
    { id: "tx-tax", date: "2026-08-05", type: "tax", amount: 3, notes: "recorded tax", createdAt: "2026-08-05T08:00:00.000Z", updatedAt: T, source: "manual" },
    { id: "tx-cash-out", date: "2026-08-06", type: "cash_out", amount: 50, notes: "synthetic withdrawal", createdAt: "2026-08-06T08:00:00.000Z", updatedAt: T, source: "manual" },
    { id: "tx-adjust", date: "2026-08-07", type: "adjust", amount: -2, notes: "documented reconciliation", createdAt: "2026-08-07T08:00:00.000Z", updatedAt: T, source: "manual" },
    // Finite legacy evidence is intentionally preserved raw but H2-B replay-quarantined.
    { id: "tx-legacy-quarantined", date: "2026-08-08", type: "buy_vwce", amount: 100, unitPrice: 50, quantity: -2, instrumentIsin: VWCE_ISIN, notes: "legacy unsafe evidence", createdAt: "2026-08-08T08:00:00.000Z", updatedAt: T, source: "manual" },
    { id: "tx-tombstone", date: D, type: "cash_in", amount: 1, notes: "deleted evidence", createdAt: T, updatedAt: T, source: "manual", deletedAt: T },
  ];
  await db.transactions.bulkPut(transactions);

  const checklist: AnnualChecklist = { id: "checklist-2026", year: 2026, items: [{ key: "backup", label: "Synthetic backup reviewed", done: true }], createdAt: T, updatedAt: T };
  const snapshot: MonthlySnapshot = { id: "snapshot-2026-08", year: 2026, month: 8, vwceValue: 330, cashValue: 647, totalValue: 977, contributed: 1000, withdrawn: 50, createdAt: T, updatedAt: T };
  await db.annualChecklists.put(checklist);
  await db.monthlySnapshots.put(snapshot);
  await db.instruments.put({ isin: VWCE_ISIN, name: "Vanguard FTSE All-World UCITS ETF", ticker: "VWCE", currency: "EUR", createdAt: T, updatedAt: T });
  const candidate: QuoteCandidate = { id: candidateId(VWCE_ISIN, "EUR", "auto"), instrumentIsin: VWCE_ISIN, currency: "EUR", source: "auto", price: 110, asOf: "2026-08-20", provider: "synthetic", createdAt: T, updatedAt: T };
  const preference: QuoteSelectionPreference = { id: preferenceId(VWCE_ISIN, "EUR"), instrumentIsin: VWCE_ISIN, currency: "EUR", mode: "auto", createdAt: T, updatedAt: T };
  const quote: Quote = { id: quoteId(VWCE_ISIN, "EUR"), instrumentIsin: VWCE_ISIN, currency: "EUR", price: 110, asOf: "2026-08-20", source: "auto", provider: "synthetic", createdAt: T, updatedAt: T };
  await db.quoteCandidates.put(candidate);
  await db.quotePreferences.put(preference);
  await db.quotes.put(quote);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("H3 deterministic synthetic restore drill", () => {
  it("preserves all portable evidence and canonical replay across export, wipe, import and reopen", async () => {
    await seedSyntheticVault();
    const before = await portableState();
    const exported = await exportBackup();
    const serialised = JSON.parse(JSON.stringify(exported));

    expect(exported.metadata?.recordCounts).toMatchObject({
      transactions: 8,
      deletedTransactions: 1,
      goals: 1,
      deletedGoals: 1,
      instruments: 1,
      quotes: 1,
      quoteCandidates: 1,
      quotePreferences: 1,
    });
    expect(before.replay).toMatchObject({
      vwceQty: 3,
      vwceCostBasis: 298.5,
      totalContributed: 1000,
      totalWithdrawn: 50,
      totalSold: 110,
      totalFees: 8,
      totalTax: 5,
      cashBalance: 647,
    });

    await clearAllData();
    expect(await db.transactions.count()).toBe(0);
    expect(await db.goals.count()).toBe(0);

    await importBackup(serialised);
    db.close();
    await db.open();
    const after = await portableState();

    expect(after).toEqual(before);
    expect((await db.transactions.get("tx-legacy-quarantined"))?.quantity).toBe(-2);
    expect(after.replay).toMatchObject({
      vwceQty: 3,
      cashBalance: 647,
      totalSold: 110,
    });
    expect(await db.outbox.count()).toBe(0);
    expect(await db.conflicts.count()).toBe(0);
    expect(await db.syncMeta.count()).toBe(0);
  });
});
