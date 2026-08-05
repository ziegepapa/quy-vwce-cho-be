import { parseDecimal } from "./calc";
import { isValidAsOfDate, isValidIsin, normalizeIsin } from "./instrument";

export const MANUAL_QUOTE_DRAFT_KEY = "vwce.manual-quote-draft.v1";

export type ManualQuoteDraft = {
  isin: string;
  price: string;
  asOf: string;
};

export type ValidManualQuoteDraft = {
  instrumentIsin: string;
  price: number;
  asOf: string;
  fingerprint: string;
};

export type ManualQuoteDraftResult =
  | { ok: true; value: ValidManualQuoteDraft }
  | { ok: false; reason: "empty" | "isin" | "price" | "date" | "future"; message: string };

export function validateManualQuoteDraft(
  draft: ManualQuoteDraft,
  today = new Date().toISOString().slice(0, 10),
): ManualQuoteDraftResult {
  const isin = normalizeIsin(draft.isin);
  const rawPrice = draft.price.trim();
  const asOf = draft.asOf.trim();

  if (!rawPrice) {
    return { ok: false, reason: "empty", message: "Nhập giá để lưu thủ công." };
  }
  if (!isValidIsin(isin)) {
    return { ok: false, reason: "isin", message: "ISIN không hợp lệ (checksum)." };
  }

  const price = parseDecimal(rawPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: "price", message: "Giá phải lớn hơn 0." };
  }
  if (!isValidAsOfDate(asOf)) {
    return { ok: false, reason: "date", message: "Ngày giá không hợp lệ." };
  }
  if (asOf > today) {
    return { ok: false, reason: "future", message: "Ngày giá không thể ở tương lai." };
  }

  return {
    ok: true,
    value: {
      instrumentIsin: isin,
      price,
      asOf,
      fingerprint: `${isin}|${price}|${asOf}`,
    },
  };
}
