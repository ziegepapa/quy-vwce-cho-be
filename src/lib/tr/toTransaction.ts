/**
 * V10-B3 — Ánh xạ kết quả bóc PDF Trade Republic → Transaction (thuần, không DOM/pdfjs).
 */
import type { Transaction, TxType } from "../types";
import { ETF } from "../defaults";
import type { TrExecution } from "./parseTr";

export const TR_SOURCE = "trade_republic_pdf" as const;
export const TR_SOURCE_VERSION = 1;
export const VWCE_ISIN = ETF.isin; // IE00BK5BQT80

export function sideToTxType(side: "buy" | "sell"): TxType {
  return side === "sell" ? "sell_vwce" : "buy_vwce";
}

export function buildExternalRef(docNumber: string): string | null {
  const doc = docNumber.trim();
  if (!doc) return null;
  return `trade_republic:${doc}`;
}

export type TrImportDraft = {
  date: string;
  type: TxType;
  amount: number;
  unitPrice: number;
  quantity: number;
  fee: number;
  tax: number;
  notes: string;
  isin: string;
  docNumber: string;
  externalRef: string | null;
  source: typeof TR_SOURCE;
  sourceVersion: number;
};

export type TrImportValidation =
  | { ok: true }
  | { ok: false; error: string };

/** Tạo draft xem trước từ kết quả parser. */
export function trExecutionToDraft(exec: TrExecution, tax = 0): TrImportDraft {
  const docNumber = exec.docNumber?.trim() ?? "";
  return {
    date: exec.date,
    type: sideToTxType(exec.side),
    amount: exec.amount,
    unitPrice: exec.unitPrice,
    quantity: exec.quantity,
    fee: exec.fee,
    tax,
    notes: docNumber ? `Trade Republic · ${docNumber}` : "Trade Republic",
    isin: exec.isin,
    docNumber,
    externalRef: buildExternalRef(docNumber),
    source: TR_SOURCE,
    sourceVersion: TR_SOURCE_VERSION,
  };
}

/**
 * Kiểm tra draft trước khi lưu.
 * isinMismatch khóa lưu; thiếu docNumber cũng khóa.
 */
export function validateTrImportDraft(draft: TrImportDraft): TrImportValidation {
  if (!draft.docNumber.trim() || !draft.externalRef) {
    return { ok: false, error: "Không tìm thấy số hóa đơn để chống nhập trùng." };
  }
  if (draft.isin.trim().toUpperCase() !== VWCE_ISIN.toUpperCase()) {
    return {
      ok: false,
      error: `ISIN không phải VWCE (${VWCE_ISIN}). Không thể nhập hóa đơn này.`,
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
    return { ok: false, error: "Ngày không hợp lệ." };
  }
  if (!(draft.amount > 0)) return { ok: false, error: "Tổng tiền phải lớn hơn 0." };
  if (!(draft.quantity > 0)) return { ok: false, error: "Số lượng phải lớn hơn 0." };
  if (!(draft.unitPrice > 0)) return { ok: false, error: "Giá phải lớn hơn 0." };
  if (draft.fee < 0) return { ok: false, error: "Phí không được âm." };
  if (draft.tax < 0) return { ok: false, error: "Thuế không được âm." };
  return { ok: true };
}

/** Tạo Transaction sẵn sàng upsert (chưa có id/createdAt). */
export function draftToTransaction(
  draft: TrImportDraft,
  ids: { id: string; createdAt: string; updatedAt: string },
): Transaction {
  return {
    id: ids.id,
    date: draft.date,
    type: draft.type,
    amount: draft.amount,
    unitPrice: draft.unitPrice,
    quantity: draft.quantity,
    fee: draft.fee,
    tax: draft.tax,
    notes: draft.notes,
    createdAt: ids.createdAt,
    updatedAt: ids.updatedAt,
    instrumentIsin: draft.isin.trim().toUpperCase() || VWCE_ISIN,
    source: draft.source,
    sourceVersion: draft.sourceVersion,
    externalRef: draft.externalRef ?? undefined,
  };
}
