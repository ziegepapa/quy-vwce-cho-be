import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  ensureQuoteFoundationMigrated,
  exportBackup,
  getQuoteForIsin,
  getSettings,
  importBackup,
  isQuoteMigrationComplete,
  putAutoCandidateAndResolve,
  saveManualQuoteForIsin,
  saveSettings,
  setQuotePreference,
} from "./db";
import { BACKUP_SCHEMA_VERSION, STALE_DAYS, VWCE_ISIN } from "./types";
import type { BackupPayload } from "./types";
import { defaultSettings } from "./defaults";
import { candidateId, preferenceId, quoteId } from "./instrument";
import { classifyCandidate, resolveEffective } from "./quoteResolve";

const OTHER_ISIN = "FR0010315770";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

describe("quote foundation migration (E1)", () => {
  it("empty DB migrates to complete and unlocks writes", async () => {
    await ensureQuoteFoundationMigrated();
    expect(await isQuoteMigrationComplete()).toBe(true);
    const { quote } = await saveManualQuoteForIsin({
      instrumentIsin: VWCE_ISIN,
      price: 100,
      asOf: "2026-08-01",
    });
    expect(quote.price).toBe(100);
    const cand = await db.quoteCandidates.get(candidateId(VWCE_ISIN, "EUR", "manual"));
    expect(cand?.price).toBe(100);
    const pref = await db.quotePreferences.get(preferenceId(VWCE_ISIN, "EUR"));
    expect(pref?.mode).toBe("manual");
  });

  it("seeds candidates and prefs from existing effective quotes", async () => {
    const t = "2026-01-01T00:00:00.000Z";
    await db.quotes.put({
      id: quoteId(VWCE_ISIN, "EUR"),
      instrumentIsin: VWCE_ISIN,
      currency: "EUR",
      price: 150,
      asOf: "2026-07-01",
      source: "manual",
      createdAt: t,
      updatedAt: t,
    });
    await ensureQuoteFoundationMigrated();
    expect(await isQuoteMigrationComplete()).toBe(true);
    const cand = await db.quoteCandidates.get(candidateId(VWCE_ISIN, "EUR", "manual"));
    expect(cand?.price).toBe(150);
    const pref = await db.quotePreferences.get(preferenceId(VWCE_ISIN, "EUR"));
    expect(pref?.mode).toBe("manual");
    const q = await getQuoteForIsin(VWCE_ISIN);
    expect(q?.price).toBe(150);
  });

  it("invalid quote during migration rolls back and sets failed", async () => {
    const t = "2026-01-01T00:00:00.000Z";
    await db.quotes.put({
      id: quoteId(VWCE_ISIN, "EUR"),
      instrumentIsin: VWCE_ISIN,
      currency: "EUR",
      price: -1,
      asOf: "2026-07-01",
      source: "manual",
      createdAt: t,
      updatedAt: t,
    });
    await expect(ensureQuoteFoundationMigrated()).rejects.toThrow(/price/);
    const meta = await db.appMetadata.get("quoteMigration");
    expect((meta as { state?: string } | undefined)?.state).toBe("failed");
    const q = await db.quotes.get(quoteId(VWCE_ISIN, "EUR"));
    expect(q?.price).toBe(-1);
    expect(await db.quoteCandidates.count()).toBe(0);
  });

  it("retry after failed is idempotent when data fixed", async () => {
    const t = "2026-01-01T00:00:00.000Z";
    await db.quotes.put({
      id: quoteId(VWCE_ISIN, "EUR"),
      instrumentIsin: VWCE_ISIN,
      currency: "EUR",
      price: -1,
      asOf: "2026-07-01",
      source: "manual",
      createdAt: t,
      updatedAt: t,
    });
    await expect(ensureQuoteFoundationMigrated()).rejects.toThrow(/price/);
    await db.quotes.put({
      id: quoteId(VWCE_ISIN, "EUR"),
      instrumentIsin: VWCE_ISIN,
      currency: "EUR",
      price: 120,
      asOf: "2026-07-01",
      source: "manual",
      createdAt: t,
      updatedAt: t,
    });
    await ensureQuoteFoundationMigrated();
    expect(await isQuoteMigrationComplete()).toBe(true);
    expect((await db.quoteCandidates.get(candidateId(VWCE_ISIN, "EUR", "manual")))?.price).toBe(120);
  });
});

describe("manual dual-write + preference (E3)", () => {
  it("manual save sets candidate, pref=manual, effective even if auto fresh exists", async () => {
    await putAutoCandidateAndResolve({
      instrumentIsin: VWCE_ISIN,
      currency: "EUR",
      price: 200,
      asOf: "2026-08-03",
    });
    expect((await getQuoteForIsin(VWCE_ISIN))?.source).toBe("auto");

    await saveManualQuoteForIsin({
      instrumentIsin: VWCE_ISIN,
      price: 111,
      asOf: "2026-08-01",
    });
    const q = await getQuoteForIsin(VWCE_ISIN);
    expect(q?.price).toBe(111);
    expect(q?.source).toBe("manual");
    expect((await db.quoteCandidates.get(candidateId(VWCE_ISIN, "EUR", "auto")))?.price).toBe(200);
    expect((await db.quoteCandidates.get(candidateId(VWCE_ISIN, "EUR", "manual")))?.price).toBe(111);
    expect((await db.quotePreferences.get(preferenceId(VWCE_ISIN, "EUR")))?.mode).toBe("manual");
  });

  it("switch preference to auto restores auto when fresh", async () => {
    await putAutoCandidateAndResolve({
      instrumentIsin: VWCE_ISIN,
      currency: "EUR",
      price: 200,
      asOf: "2026-08-03",
    });
    await saveManualQuoteForIsin({
      instrumentIsin: VWCE_ISIN,
      price: 111,
      asOf: "2026-08-01",
    });
    const effective = await setQuotePreference(VWCE_ISIN, "auto", { nowDate: "2026-08-04" });
    expect(effective?.price).toBe(200);
    expect(effective?.source).toBe("auto");
  });

  it("two ISIN isolation", async () => {
    await saveManualQuoteForIsin({ instrumentIsin: VWCE_ISIN, price: 160, asOf: "2026-08-01" });
    await saveManualQuoteForIsin({ instrumentIsin: OTHER_ISIN, price: 50, asOf: "2026-08-02" });
    expect((await getQuoteForIsin(VWCE_ISIN))?.price).toBe(160);
    expect((await getQuoteForIsin(OTHER_ISIN))?.price).toBe(50);
  });

  it("VWCE mirror updates settings atomically", async () => {
    await saveManualQuoteForIsin({
      instrumentIsin: VWCE_ISIN,
      price: 164.28,
      asOf: "2026-08-03",
    });
    const s = await getSettings();
    expect(s.latestVwcePrice).toBe(164.28);
    expect(s.latestPriceDate).toBe("2026-08-03");
  });
});

describe("resolver future stored + stale (E5)", () => {
  it("pure classify: future asOf is unusable", () => {
    expect(
      classifyCandidate(
        {
          id: "x",
          instrumentIsin: VWCE_ISIN,
          currency: "EUR",
          source: "auto",
          price: 1,
          asOf: "2099-01-01",
          createdAt: "",
          updatedAt: "",
        },
        "2026-08-04",
      ),
    ).toBe("unusable");
  });

  it("stored future auto ignored; manual wins; candidate not deleted", async () => {
    await putAutoCandidateAndResolve(
      {
        instrumentIsin: VWCE_ISIN,
        currency: "EUR",
        price: 999,
        asOf: "2099-01-01",
      },
      { nowDate: "2026-08-04" },
    );
    expect(await getQuoteForIsin(VWCE_ISIN)).toBeUndefined();
    expect(await db.quoteCandidates.get(candidateId(VWCE_ISIN, "EUR", "auto"))).toBeTruthy();

    await saveManualQuoteForIsin({
      instrumentIsin: VWCE_ISIN,
      price: 80,
      asOf: "2026-08-01",
    });
    expect((await getQuoteForIsin(VWCE_ISIN))?.price).toBe(80);
    expect(await db.quoteCandidates.get(candidateId(VWCE_ISIN, "EUR", "auto"))).toBeTruthy();
  });

  it("stale auto falls back to manual when pref=auto", () => {
    const r = resolveEffective({
      mode: "auto",
      auto: {
        id: "a",
        instrumentIsin: VWCE_ISIN,
        currency: "EUR",
        source: "auto",
        price: 200,
        asOf: "2026-01-01",
        createdAt: "",
        updatedAt: "",
      },
      manual: {
        id: "m",
        instrumentIsin: VWCE_ISIN,
        currency: "EUR",
        source: "manual",
        price: 100,
        asOf: "2026-07-01",
        createdAt: "",
        updatedAt: "",
      },
      nowDate: "2026-08-04",
    });
    expect(r.chosen?.source).toBe("manual");
    expect(r.effective?.price).toBe(100);
    expect(STALE_DAYS).toBe(7);
  });
});

describe("backup v3 authority (E6)", () => {
  it("export v3 includes candidates/prefs; import recomputes effective and ignores stale quotes field", async () => {
    await saveManualQuoteForIsin({
      instrumentIsin: VWCE_ISIN,
      price: 111,
      asOf: "2026-07-31",
    });
    const payload = await exportBackup();
    expect(payload.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(payload.quoteCandidates?.length).toBeGreaterThan(0);
    expect(payload.quotePreferences?.some((p) => p.mode === "manual")).toBe(true);

    payload.quotes = [
      {
        id: quoteId(VWCE_ISIN, "EUR"),
        instrumentIsin: VWCE_ISIN,
        currency: "EUR",
        price: 1,
        asOf: "2020-01-01",
        source: "auto",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
    ];

    await db.delete();
    await db.open();
    await importBackup(payload);
    const q = await getQuoteForIsin(VWCE_ISIN);
    expect(q?.price).toBe(111);
    expect(q?.source).toBe("manual");
  });

  it("import v2 derives candidates and preserves manual", async () => {
    const v2: BackupPayload = {
      schemaVersion: 2,
      exportedAt: "2026-08-03T00:00:00.000Z",
      settings: [defaultSettings()],
      goals: [],
      transactions: [],
      annualChecklists: [],
      monthlySnapshots: [],
      instruments: [
        {
          isin: VWCE_ISIN,
          name: "VWCE",
          currency: "EUR",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      quotes: [
        {
          id: quoteId(VWCE_ISIN, "EUR"),
          instrumentIsin: VWCE_ISIN,
          currency: "EUR",
          price: 155,
          asOf: "2026-07-15",
          source: "manual",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    await importBackup(v2);
    expect(await isQuoteMigrationComplete()).toBe(true);
    expect((await getQuoteForIsin(VWCE_ISIN))?.price).toBe(155);
    expect((await db.quoteCandidates.get(candidateId(VWCE_ISIN, "EUR", "manual")))?.price).toBe(155);
    expect((await db.quotePreferences.get(preferenceId(VWCE_ISIN, "EUR")))?.mode).toBe("manual");
  });

  it("invalid v3 candidate rolls back prior data", async () => {
    await saveSettings({ planName: "KeepMe" }, { sync: false });
    await saveManualQuoteForIsin({
      instrumentIsin: VWCE_ISIN,
      price: 111,
      asOf: "2026-07-31",
    });
    const bad: BackupPayload = {
      schemaVersion: 3,
      exportedAt: "2026-08-03T00:00:00.000Z",
      settings: [defaultSettings()],
      goals: [],
      transactions: [],
      annualChecklists: [],
      monthlySnapshots: [],
      quoteCandidates: [
        {
          id: "x",
          instrumentIsin: VWCE_ISIN,
          currency: "EUR",
          source: "manual",
          price: -5,
          asOf: "2026-08-01",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      quotePreferences: [],
    };
    await expect(importBackup(bad)).rejects.toThrow(/price/);
    const s = await getSettings();
    expect(s.planName).toBe("KeepMe");
    expect((await getQuoteForIsin(VWCE_ISIN))?.price).toBe(111);
  });
});
