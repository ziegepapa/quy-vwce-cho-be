import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { applyResolvedEffective, db, saveSettings } from "./db";
import { VWCE_ISIN } from "./types";
import type { AppSettings, Quote } from "./types";
import { defaultSettings, nowIso } from "./defaults";
import { quoteId } from "./instrument";

/**
 * Fallback AN-TOAN-NOTFALLMAPPE -- version-guard cho ban ghi "settings".
 *
 * Push "settings" phai mang expectedRemoteVersion khi ban ghi da tung dong bo,
 * de mot ban CUC BO cu KHONG ghi de (upsert vo dieu kien) len ban moi hon tren
 * server va xoa mat Ho so khan cap (notfallmappe). Push dau tien (chua tung len
 * server) van la upsert khong dieu kien de nguoi dung moi dong bo duoc lan dau.
 *
 * Kem theo: mirror gia CUC BO (syncSettings:false, tu feed tu dong) KHONG duoc
 * tang version -- neu khong version cuc bo se "troi" vuot server va lam guard sai.
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

// db.outbox.toArray() tra ve union (Ordinary | Recovery); RecoveryOutboxItem
// khong co version/expectedRemoteVersion. Doc qua kieu ro rang nay (co op +
// payload bat buoc) de tranh loi weak-type TS2559 khi truy cap truc tiep.
type SettingsOutboxRow = {
  op: "upsert" | "delete" | "recover";
  version?: number;
  expectedRemoteVersion?: number;
  payload: unknown;
};

const settingsOutbox = () =>
  db.outbox.where("entityId").equals("settings").toArray() as Promise<
    SettingsOutboxRow[]
  >;

/** settings da tung pull/dong bo ve o mot version cu the. */
const syncedSettings = (version: number): AppSettings =>
  ({ ...defaultSettings(), version } as AppSettings);

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("settings version-guard -- saveSettings", () => {
  it("first sync of a fresh settings row is unconditional (insert-safe)", async () => {
    await db.settings.put(defaultSettings());

    await saveSettings({ planName: "Lan dau" });

    const pending = await settingsOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0].op).toBe("upsert");
    expect(pending[0].version).toBe(1);
    expect(pending[0].expectedRemoteVersion).toBeUndefined();
  });

  it("guards edits once the row has been synced/hydrated", async () => {
    await db.settings.put(syncedSettings(5));

    await saveSettings({ childName: "Be An" });

    const pending = await settingsOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0].version).toBe(6);
    expect(pending[0].expectedRemoteVersion).toBe(5);
  });

  it("coalesced offline edits keep the original synced base version", async () => {
    await db.settings.put(syncedSettings(5));

    await saveSettings({ childName: "Be An" });
    await saveSettings({ planName: "Doi ten" });

    const pending = await settingsOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0].version).toBe(7);
    // Base van la 5 (version tren server), khong phai 6 -> tranh conflict gia.
    expect(pending[0].expectedRemoteVersion).toBe(5);
    const payload = pending[0].payload as AppSettings;
    expect(payload.childName).toBe("Be An");
    expect(payload.planName).toBe("Doi ten");
  });

  it("an unsynced edit chain stays unconditional", async () => {
    await db.settings.put(defaultSettings());

    await saveSettings({ childName: "Be An" });
    await saveSettings({ planName: "Doi ten" });

    const pending = await settingsOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0].version).toBe(2);
    expect(pending[0].expectedRemoteVersion).toBeUndefined();
  });

  it("does not enqueue anything when sync is disabled", async () => {
    await db.settings.put(syncedSettings(5));

    await saveSettings({ childName: "Be An" }, { sync: false });

    expect(await settingsOutbox()).toHaveLength(0);
  });
});

describe("settings version-guard -- local price mirror must not drift the base", () => {
  it("keeps the auto feed silent and price mirrored (Fix A) with the guard in place", async () => {
    await db.settings.put(syncedSettings(5));

    await applyResolvedEffective(VWCE_ISIN, "EUR", vwceQuote(172.4, "2026-08-07"), {
      t: nowIso(),
      syncSettings: false,
    });

    expect((await db.settings.get("settings"))?.latestVwcePrice).toBe(172.4);
    expect(await settingsOutbox()).toHaveLength(0);
  });

  it("a local auto mirror must not advance the version, so the first sync stays unconditional", async () => {
    await db.settings.put(defaultSettings()); // chua tung dong bo (version 0)

    await applyResolvedEffective(VWCE_ISIN, "EUR", vwceQuote(170, "2026-08-07"), {
      t: nowIso(),
      syncSettings: false,
    });
    expect((await db.settings.get("settings"))?.latestVwcePrice).toBe(170);

    // Lan dong bo settings dau tien (vd nhap Ho so khan cap) phai la insert khong dieu kien.
    await saveSettings({ planName: "Sync dau tien" });

    const pending = await settingsOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0].version).toBe(1);
    expect(pending[0].expectedRemoteVersion).toBeUndefined();
  });

  it("keeps the synced base version even after a local auto mirror", async () => {
    await db.settings.put(syncedSettings(5));

    await applyResolvedEffective(VWCE_ISIN, "EUR", vwceQuote(170, "2026-08-07"), {
      t: nowIso(),
      syncSettings: false,
    });
    await saveSettings({ childName: "Be An" });

    const pending = await settingsOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0].version).toBe(6);
    expect(pending[0].expectedRemoteVersion).toBe(5);
  });
});

describe("settings version-guard -- manual price mirror (applyResolvedEffective)", () => {
  it("guards the VWCE manual price mirror once settings has been synced", async () => {
    await db.settings.put(syncedSettings(5));

    await applyResolvedEffective(VWCE_ISIN, "EUR", vwceQuote(171.25, "2026-08-07"), {
      t: nowIso(),
      syncSettings: true,
    });

    const pending = await settingsOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0].version).toBe(6);
    expect(pending[0].expectedRemoteVersion).toBe(5);
  });

  it("first manual mirror on a fresh row is unconditional", async () => {
    await db.settings.put(defaultSettings());

    await applyResolvedEffective(VWCE_ISIN, "EUR", vwceQuote(171.25, "2026-08-07"), {
      t: nowIso(),
      syncSettings: true,
    });

    const pending = await settingsOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0].version).toBe(1);
    expect(pending[0].expectedRemoteVersion).toBeUndefined();
  });
});
