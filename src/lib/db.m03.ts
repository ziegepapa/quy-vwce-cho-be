import type { AppSettings, Instrument, Quote } from "./types";
import { VWCE_ISIN } from "./types";
import { nowIso } from "./defaults";
import { isValidIsin, normalizeIsin, quoteId } from "./instrument";
import { enqueueOutbox, settingsGuardBaseVersion } from "./sync/outbox";
import { db } from "./db.m01a";
export async function applyResolvedEffective(
  isin: string,
  currency: string,
  effective: Quote | null,
  opts: { syncSettings?: boolean; t: string },
): Promise<void> {
  const qid = quoteId(isin, currency);
  if (effective) {
    await db.quotes.put(effective);
  } else {
    await db.quotes.delete(qid);
  }
  if (isin === VWCE_ISIN) {
    // AN TOAN DU LIEU (dang xuat -> dang nhap lai): KHONG seed settings tu
    // defaultSettings() o day. Ngay sau khi dang nhap lai, IndexedDB vua bi
    // clearAllData() xoa sach va ban pull tu Supabase CHUA chay, nen "settings"
    // chua ton tai cuc bo. Neu mirror gia tao mot settings mac dinh (notfallmappe
    // rong) roi enqueue upsert, runSync (push TRUOC pull) se ghi de hang that
    // tren Supabase va xoa mat Ho so khan cap. Chi mirror gia khi "settings" da
    // ton tai; neu chua co thi bo qua -- gia van da duoc luu vao bang quotes o tren.
    const current = await db.settings.get("settings");
    if (!current) return;
    const rawVer = (current as AppSettings & { version?: number }).version;
    const prevVer = typeof rawVer === "number" ? rawVer : 0;
    const price = effective?.price;
    const asOf = effective?.asOf;
    const economicsChanged =
      effective != null &&
      (current.latestVwcePrice !== price || current.latestPriceDate !== asOf);
    if (economicsChanged && price != null && asOf) {
      // AN TOAN DU LIEU: `version` la con so danh cho dong bo lac quan, chi duoc
      // TANG khi thuc su enqueue len server. Mirror gia CUC BO (syncSettings:false,
      // tu feed tu dong) chi cap nhat gia de UI hien thi, KHONG duoc day version
      // len -- neu khong version cuc bo se "troi" vuot server, khien push co guard
      // sau do dung expectedRemoteVersion khong ton tai tren server va bi ket.
      const willSync = opts.syncSettings !== false;
      const ver = willSync ? prevVer + 1 : prevVer;
      const settingsNext = {
        ...current,
        id: "settings",
        latestVwcePrice: price,
        latestPriceDate: asOf,
        updatedAt: opts.t,
        version: ver,
      };
      await db.settings.put(settingsNext as AppSettings);
      if (willSync) {
        // Version-guard: settings da tung dong bo (prevVer > 0) phai push theo
        // duong conditional update de KHONG ghi de ban moi hon tren server (giu
        // Ho so khan cap). Push dau tien (prevVer === 0) van la upsert khong dieu kien.
        const expectedRemoteVersion = await settingsGuardBaseVersion(prevVer);
        await enqueueOutbox(
          "settings",
          "settings",
          "upsert",
          settingsNext,
          ver,
          expectedRemoteVersion !== undefined ? { expectedRemoteVersion } : undefined,
        );
      }
    }
  }
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
  void opts;
}
