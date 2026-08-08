/**
 * QUOTE-MANUAL-UX-001 r1 — pure guard for taking an ISIN out of the price list.
 *
 * The price list is derived data: an instrument row, up to two quote candidates,
 * the chosen preference and the resolved effective quote. Removing all of that
 * throws away a cache, not history. It is only safe while no surviving
 * transaction still points at the ISIN, because the transactions are the history.
 *
 * No I/O, so the rule can be tested without a database.
 */
import { VWCE_ISIN } from "./types";
import { normalizeIsin, resolveInstrumentIsin } from "./instrument";

export type PriceListRemovalCheck =
  | { ok: true }
  | { ok: false; reason: "vwce" | "has-transactions"; message: string };

/** Only the two fields the rule reads, so callers can pass real transactions. */
export type RemovalTxInput = { type: string; instrumentIsin?: string };

/**
 * `transactions` must already exclude soft-deleted rows. `listTransactions()`
 * does exactly that, and it also fills in the ISIN that legacy buy_vwce and
 * sell_vwce rows leave empty. The same `resolveInstrumentIsin` runs here so such
 * a row still counts even if it was passed in raw.
 */
export function canRemoveFromPriceList(input: {
  isin: string;
  transactions: RemovalTxInput[];
}): PriceListRemovalCheck {
  const isin = normalizeIsin(input.isin);

  if (isin === VWCE_ISIN) {
    return {
      ok: false,
      reason: "vwce",
      message: "VWCE là quỹ chính của kế hoạch nên luôn ở trong danh sách giá.",
    };
  }

  const used = input.transactions.filter((tx) => resolveInstrumentIsin(tx) === isin).length;
  if (used > 0) {
    return {
      ok: false,
      reason: "has-transactions",
      message: `Còn ${used} giao dịch đang dùng mã này. Xóa giao dịch trước nếu muốn bỏ mã.`,
    };
  }

  return { ok: true };
}
