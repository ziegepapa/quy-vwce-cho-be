import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  getSettings,
  putAutoCandidateAndResolve,
  saveManualQuoteForIsin,
} from "./db";
import { VWCE_ISIN } from "./types";
import { defaultSettings } from "./defaults";

/**
 * Regression NFM-AUTO-FEED-NO-SETTINGS-SYNC (di kem Fix A).
 *
 * Feed gia tu dong (ingestQuotesFeed -> putAutoCandidateAndResolve) chay MOI lan
 * mo app. Truoc day no goi applyResolvedEffective(syncSettings: true) nen moi lan
 * gia doi lai enqueue mot ban "settings" vao outbox. Hau qua:
 *  - outbox luon con item ngay sau khi mo app -> KHONG the dang xuat.
 *  - push (khong dieu kien, truoc pull) ghi de hang settings that tren Supabase
 *    -> xoa mat Ho so khan cap (notfallmappe).
 * Ban va: feed tu dong dung syncSettings:false. Gia van duoc mirror CUC BO
 * (latestVwcePrice / latestPriceDate) de UI hien thi va van nam trong bang quotes;
 * chi hanh dong nhap gia THU CONG cua nguoi dung moi dong bo settings len server.
 */

/** Valid non-VWCE ISIN (Amundi MSCI World). */
const OTHER_ISIN = "FR0010315770";
/** Fixed clock so staleness/future-date guards never depend on today. */
const NOW_DATE = "2026-08-08";

async function settingsOutbox() {
  return db.outbox.where("entityId").equals("settings").toArray();
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

describe("auto price feed must not enqueue a settings sync (Fix A)", () => {
  it("mirrors latestVwcePrice locally but creates no settings outbox item", async () => {
    // Warm up the one-time quote-foundation migration with a non-VWCE ISIN (which
    // never touches the settings mirror), then clear the outbox so the assertion
    // isolates exactly what the VWCE auto feed enqueues.
    await putAutoCandidateAndResolve(
      { instrumentIsin: OTHER_ISIN, price: 20, asOf: "2026-08-07" },
      { nowDate: NOW_DATE },
    );
    await db.outbox.clear();

    await putAutoCandidateAndResolve(
      { instrumentIsin: VWCE_ISIN, price: 172.4, asOf: "2026-08-07", provider: "yahoo" },
      { nowDate: NOW_DATE },
    );

    const s = await getSettings();
    expect(s.latestVwcePrice).toBe(172.4);
    expect(s.latestPriceDate).toBe("2026-08-07");
    expect(await settingsOutbox()).toHaveLength(0);
  });

  it("still syncs settings when the user saves a manual quote", async () => {
    await saveManualQuoteForIsin(
      { instrumentIsin: VWCE_ISIN, price: 168.9, asOf: "2026-08-06" },
      { nowDate: NOW_DATE },
    );

    const s = await getSettings();
    expect(s.latestVwcePrice).toBe(168.9);
    expect(s.latestPriceDate).toBe("2026-08-06");
    expect(await settingsOutbox()).toHaveLength(1);
  });
});
