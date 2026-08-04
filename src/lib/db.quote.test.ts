import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  getQuoteForIsin,
  getSettings,
  importBackup,
  listInstruments,
  listQuotes,
  saveManualQuoteForIsin,
  saveSettings,
} from "./db";
import { VWCE_ISIN } from "./types";
import type { BackupPayload } from "./types";
import { defaultSettings } from "./defaults";
import { quoteId } from "./instrument";

/** Valid non-VWCE ISIN (Amundi MSCI World — checksum verified). */
const OTHER_ISIN = "FR0010315770";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

describe("saveManualQuoteForIsin — policy A orphan instrument", () => {
  it("creates minimal instrument for new ISIN and shows up in list", async () => {
    const { instrument, quote } = await saveManualQuoteForIsin({
      instrumentIsin: OTHER_ISIN,
      price: 42.5,
      asOf: "2026-08-01",
    });
    expect(instrument.isin).toBe(OTHER_ISIN);
    expect(instrument.name).toBe(OTHER_ISIN); // no ticker inference
    expect(instrument.ticker).toBeUndefined();
    expect(quote.instrumentIsin).toBe(OTHER_ISIN);
    expect(quote.price).toBe(42.5);

    const instruments = await listInstruments();
    const quotes = await listQuotes();
    expect(instruments.some((i) => i.isin === OTHER_ISIN)).toBe(true);
    expect(quotes.some((q) => q.instrumentIsin === OTHER_ISIN)).toBe(true);
  });

  it("two ISINs do not overwrite each other", async () => {
    await saveManualQuoteForIsin({
      instrumentIsin: VWCE_ISIN,
      price: 160,
      asOf: "2026-08-01",
    });
    await saveManualQuoteForIsin({
      instrumentIsin: OTHER_ISIN,
      price: 50,
      asOf: "2026-08-02",
    });
    const q1 = await getQuoteForIsin(VWCE_ISIN);
    const q2 = await getQuoteForIsin(OTHER_ISIN);
    expect(q1?.price).toBe(160);
    expect(q2?.price).toBe(50);
    expect(q1?.id).toBe(quoteId(VWCE_ISIN, "EUR"));
    expect(q2?.id).toBe(quoteId(OTHER_ISIN, "EUR"));
  });

  it("rejects invalid ISIN without writing", async () => {
    await expect(
      saveManualQuoteForIsin({
        instrumentIsin: "IE00BK5BQT81", // bad checksum
        price: 10,
        asOf: "2026-08-01",
      }),
    ).rejects.toThrow(/Invalid ISIN/);
    expect(await listInstruments()).toHaveLength(0);
    expect(await listQuotes()).toHaveLength(0);
  });
});

describe("saveManualQuoteForIsin — VWCE legacy atomic mirror", () => {
  it("updates quote and latestVwcePrice together", async () => {
    await saveManualQuoteForIsin({
      instrumentIsin: VWCE_ISIN,
      price: 164.28,
      asOf: "2026-08-03",
    });
    const q = await getQuoteForIsin(VWCE_ISIN);
    const s = await getSettings();
    expect(q?.price).toBe(164.28);
    expect(q?.asOf).toBe("2026-08-03");
    expect(s.latestVwcePrice).toBe(164.28);
    expect(s.latestPriceDate).toBe("2026-08-03");
  });

  it("non-VWCE does not touch latestVwcePrice", async () => {
    await saveSettings({ latestVwcePrice: 100, latestPriceDate: "2026-07-01" }, { sync: false });
    await saveManualQuoteForIsin({
      instrumentIsin: OTHER_ISIN,
      price: 55,
      asOf: "2026-08-03",
    });
    const s = await getSettings();
    expect(s.latestVwcePrice).toBe(100);
    expect(s.latestPriceDate).toBe("2026-07-01");
  });

  it("invalid asOf leaves settings and quotes unchanged", async () => {
    await saveSettings({ latestVwcePrice: 100, latestPriceDate: "2026-07-01" }, { sync: false });
    await expect(
      saveManualQuoteForIsin({
        instrumentIsin: VWCE_ISIN,
        price: 200,
        asOf: "2026-02-30",
      }),
    ).rejects.toThrow(/asOf/);
    const s = await getSettings();
    expect(s.latestVwcePrice).toBe(100);
    expect(s.latestPriceDate).toBe("2026-07-01");
    expect(await listQuotes()).toHaveLength(0);
  });

  it("rejects price 0 without changing quote or settings", async () => {
    await saveSettings({ latestVwcePrice: 100, latestPriceDate: "2026-07-01" }, { sync: false });
    await saveManualQuoteForIsin({
      instrumentIsin: VWCE_ISIN,
      price: 111,
      asOf: "2026-07-31",
    });
    await expect(
      saveManualQuoteForIsin({
        instrumentIsin: VWCE_ISIN,
        price: 0,
        asOf: "2026-08-03",
      }),
    ).rejects.toThrow(/price/);
    const s = await getSettings();
    const q = await getQuoteForIsin(VWCE_ISIN);
    expect(s.latestVwcePrice).toBe(111);
    expect(s.latestPriceDate).toBe("2026-07-31");
    expect(q?.price).toBe(111);
  });

});

describe("importBackup rollback", () => {
  it("schema 2 with bad quote rolls back — prior data remains", async () => {
    await saveSettings({ planName: "KeepMe", latestVwcePrice: 1 }, { sync: false });
    await saveManualQuoteForIsin({
      instrumentIsin: VWCE_ISIN,
      price: 111,
      asOf: "2026-07-31",
    });

    const bad: BackupPayload = {
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
          price: -5, // invalid
          asOf: "2026-08-01",
          source: "manual",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    await expect(importBackup(bad)).rejects.toThrow(/price/);

    const s = await getSettings();
    expect(s.planName).toBe("KeepMe");
    const q = await getQuoteForIsin(VWCE_ISIN);
    expect(q?.price).toBe(111);
  });
});
