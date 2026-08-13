import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { applyResolvedEffective, db } from "./db";
import { VWCE_ISIN } from "./types";
import type { Quote } from "./types";
import { defaultSettings, nowIso } from "./defaults";
import { quoteId } from "./instrument";

/**
 * Regression NFM-PRICE-MIRROR-NO-SEED.
 *
 * Ngay sau khi dang xuat -> dang nhap lai, clearAllData() da xoa sach IndexedDB
 * (ke ca "settings") va ban pull tu Supabase CHUA chay. Khi do App khoi dong se
 * nap gia (ingestQuotesFeed -> applyResolvedEffective). Truoc day ham nay seed
 * settings tu defaultSettings() (notfallmappe RONG) roi enqueue upsert; vi runSync
 * push TRUOC khi pull nen ban rong ghi de hang that tren Supabase va xoa mat Ho so
 * khan cap. Ban va: chi mirror gia khi "settings" da ton tai cuc bo.
 */
const vwceQuote = (price: number, asOf: string): Quote => {
  const t = nowIso();
  return {
    id: quoteId(VWCE_ISIN, "EUR"),
    instrumentIsin: VWCE_ISIN,
    currency: "EUR",
    venue: "XETRA",
    price,
    asOf,
    source: "auto",
    createdAt: t,
    updatedAt: t,
  };
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("applyResolvedEffective — price mirror must not seed settings", () => {
  it("saves the quote but never creates settings or an outbox upsert when no settings row exists", async () => {
    await applyResolvedEffective(VWCE_ISIN, "EUR", vwceQuote(170.5, "2026-08-07"), {
      t: nowIso(),
      syncSettings: true,
    });

    // Gia van duoc luu vao bang quotes.
    expect((await db.quotes.get(quoteId(VWCE_ISIN, "EUR")))?.price).toBe(170.5);
    // KHONG tao settings mac dinh (notfallmappe rong).
    expect(await db.settings.get("settings")).toBeUndefined();
    // KHONG co outbox settings upsert (thu se ghi de Supabase khi push).
    expect(await db.outbox.where("entityId").equals("settings").toArray()).toHaveLength(0);
  });

  it("mirrors the price and enqueues once a settings row already exists", async () => {
    await db.settings.put(defaultSettings());

    await applyResolvedEffective(VWCE_ISIN, "EUR", vwceQuote(171.25, "2026-08-07"), {
      t: nowIso(),
      syncSettings: true,
    });

    const s = await db.settings.get("settings");
    expect(s?.latestVwcePrice).toBe(171.25);
    expect(s?.latestPriceDate).toBe("2026-08-07");
    expect(await db.outbox.where("entityId").equals("settings").toArray()).toHaveLength(1);
  });
});
