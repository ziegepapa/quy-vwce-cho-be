import type { Transaction, TxType } from "./types";

export type TransactionTone = "buy" | "sell" | "cash-in" | "cash-out" | "neutral";

export type TransactionPresentation = {
  label: string;
  amountPrefix: "" | "+" | "−";
  glyph: string;
  tone: TransactionTone;
};

const PRESENTATION: Record<TxType, TransactionPresentation> = {
  buy_vwce: { label: "Mua VWCE", amountPrefix: "", glyph: "↗", tone: "buy" },
  sell_vwce: { label: "Bán VWCE", amountPrefix: "", glyph: "↘", tone: "sell" },
  buy_security: { label: "Mua chứng khoán", amountPrefix: "", glyph: "↗", tone: "buy" },
  sell_security: { label: "Bán chứng khoán", amountPrefix: "", glyph: "↘", tone: "sell" },
  cash_in: { label: "Nạp tiền", amountPrefix: "+", glyph: "+", tone: "cash-in" },
  cash_out: { label: "Rút tiền", amountPrefix: "−", glyph: "−", tone: "cash-out" },
  tax: { label: "Thuế", amountPrefix: "−", glyph: "−", tone: "cash-out" },
  fee: { label: "Phí", amountPrefix: "−", glyph: "−", tone: "cash-out" },
  safe_interest: { label: "Lãi an toàn", amountPrefix: "+", glyph: "+", tone: "cash-in" },
  adjust: { label: "Điều chỉnh", amountPrefix: "", glyph: "≈", tone: "neutral" },
};

export function presentTransaction(type: TxType): TransactionPresentation {
  return PRESENTATION[type];
}

export function compareTransactionsNewestFirst(a: Transaction, b: Transaction): number {
  const dateOrder = b.date.localeCompare(a.date);
  if (dateOrder !== 0) return dateOrder;
  const aStamp = a.updatedAt || a.createdAt || "";
  const bStamp = b.updatedAt || b.createdAt || "";
  return bStamp.localeCompare(aStamp);
}

export function takeRecentTransactions(
  transactions: readonly Transaction[],
  limit = 3,
): Transaction[] {
  const safeLimit = Math.max(0, Math.floor(limit));
  return transactions
    .filter((transaction) => !transaction.deletedAt)
    .slice()
    .sort(compareTransactionsNewestFirst)
    .slice(0, safeLimit);
}
