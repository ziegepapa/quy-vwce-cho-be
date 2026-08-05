import type { DepotPosition, DepotStatement, Transaction } from "../types";
import {
  isSecurityBuy,
  isSecuritySell,
  isValidIsin,
  normalizeIsin,
  resolveInstrumentIsin,
} from "../instrument";
import { germanDateToIso, parseGermanNumber, parseTrText } from "./parseTr";
import type { TrExecution } from "./parseTr";

export type TrDocumentKind = "execution_invoice" | "depot_statement" | "unsupported";

export type ParsedDepotStatement = Pick<
  DepotStatement,
  "statementId" | "date" | "accountRef" | "positions"
>;

export type TrDocumentParseResult =
  | { ok: true; kind: "execution_invoice"; value: TrExecution; warnings: string[] }
  | { ok: true; kind: "depot_statement"; value: ParsedDepotStatement; warnings: string[] }
  | { ok: false; kind: "unsupported"; error: string };

export type ReconciliationStatus =
  | "match"
  | "difference"
  | "missing_local"
  | "missing_statement";

export type DepotReconciliationRow = {
  instrumentIsin: string;
  name?: string;
  currency: string;
  statementQuantity: number;
  bookQuantity: number;
  difference: number;
  status: ReconciliationStatus;
};

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u202f\u2007\u2009]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function grab(re: RegExp, value: string): string {
  const match = re.exec(value);
  return match?.[1]?.trim() ?? "";
}

function round(value: number, digits = 6): number {
  const factor = Math.pow(10, digits);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function positionNameBefore(text: string, index: number): string | undefined {
  const lines = text.slice(Math.max(0, index - 260), index).split("\n").reverse();
  const candidate = lines.find((raw) => {
    const line = raw.trim();
    if (line.length < 3) return false;
    if (/ISIN|DEPOT|STICHTAG|DATUM|POSITION|ANZAHL|KURS|WERT|TRADE REPUBLIC/i.test(line)) {
      return false;
    }
    if (/^\d+(?:\.\d{3})*,\d+/.test(line)) return false;
    return true;
  });
  return candidate?.trim().slice(0, 140) || undefined;
}

export function classifyTrDocument(rawText: string): TrDocumentKind {
  const text = normalizeText(rawText || "");
  if (text.length < 20 || !/TRADE\s+REPUBLIC/i.test(text)) return "unsupported";
  if (/DEPOTAUSZUG|DEPOTBESTAND|DEPOT(?:-|\s*)ÜBERSICHT|PORTFOLIO(?:-|\s*)ÜBERSICHT/i.test(text)) {
    return "depot_statement";
  }
  if (/WERTPAPIERABRECHNUNG|SPARPLANAUSF(?:UE|Ü)HRUNG|\bVERKAUF\b/i.test(text)) {
    return "execution_invoice";
  }
  return "unsupported";
}

export function parseTrDepotStatementText(
  rawText: string,
):
  | { ok: true; value: ParsedDepotStatement; warnings: string[] }
  | { ok: false; error: string } {
  const text = normalizeText(rawText || "");
  if (classifyTrDocument(text) !== "depot_statement") {
    return { ok: false, error: "Không nhận ra đây là sao kê Depot của Trade Republic." };
  }

  const dateRaw =
    grab(/(?:STICHTAG|DEPOTSTAND|DATUM)\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i, text) ||
    grab(/(\d{2}\.\d{2}\.\d{4})/, text);
  const date = germanDateToIso(dateRaw);
  if (!date) return { ok: false, error: "Không tìm thấy ngày sao kê Depot." };

  const warnings: string[] = [];
  const isinMatches = Array.from(text.matchAll(/\b([A-Z]{2}[A-Z0-9]{9}\d)\b/gi));
  const positionsByKey = new Map<string, DepotPosition>();

  for (let i = 0; i < isinMatches.length; i++) {
    const match = isinMatches[i];
    const isin = normalizeIsin(match[1]);
    if (!isValidIsin(isin)) {
      warnings.push(`Đã bỏ qua ISIN không hợp lệ: ${isin}`);
      continue;
    }
    const start = (match.index ?? 0) + match[0].length;
    const end = isinMatches[i + 1]?.index ?? text.length;
    const segment = text.slice(start, end);
    const quantity = parseGermanNumber(
      grab(/(\d+(?:\.\d{3})*,\d{1,6})\s*St(?:k|ück|ueck)\.?/i, segment),
    );
    if (!Number.isFinite(quantity) || quantity <= 0) {
      warnings.push(`Không đọc được số lượng cho ${isin}; position đã bị bỏ qua.`);
      continue;
    }

    const unitRaw = grab(
      /(?:KURS|PREIS)\s*:?\s*(\d+(?:\.\d{3})*,\d{2})\s*(?:EUR|USD|GBP|CHF)/i,
      segment,
    );
    const marketRaw = grab(
      /(?:MARKTWERT|GESAMTWERT|WERT)\s*:?\s*(\d+(?:\.\d{3})*,\d{2})\s*(?:EUR|USD|GBP|CHF)/i,
      segment,
    );
    const money = Array.from(
      segment.matchAll(/(\d+(?:\.\d{3})*,\d{2})\s*(EUR|USD|GBP|CHF)/gi),
    );
    const currency = (money[0]?.[2] || "EUR").toUpperCase();
    let unitPrice = parseGermanNumber(unitRaw);
    let marketValue = parseGermanNumber(marketRaw);
    if (!Number.isFinite(unitPrice) && money.length >= 2) {
      unitPrice = parseGermanNumber(money[0][1]);
    }
    if (!Number.isFinite(marketValue) && money.length > 0) {
      marketValue = parseGermanNumber(money[money.length - 1][1]);
    }
    if (!Number.isFinite(unitPrice) && Number.isFinite(marketValue)) {
      unitPrice = marketValue / quantity;
    }

    const key = `${isin}::${currency}`;
    const existing = positionsByKey.get(key);
    const position: DepotPosition = {
      instrumentIsin: isin,
      name: positionNameBefore(text, match.index ?? 0),
      quantity: round(quantity),
      unitPrice: Number.isFinite(unitPrice) && unitPrice > 0 ? round(unitPrice, 4) : undefined,
      marketValue:
        Number.isFinite(marketValue) && marketValue >= 0 ? round(marketValue, 2) : undefined,
      currency,
    };
    if (!existing) {
      positionsByKey.set(key, position);
    } else {
      const totalQuantity = round(existing.quantity + position.quantity);
      const totalValue = round((existing.marketValue ?? 0) + (position.marketValue ?? 0), 2);
      positionsByKey.set(key, {
        ...existing,
        quantity: totalQuantity,
        marketValue: totalValue > 0 ? totalValue : undefined,
        unitPrice: totalValue > 0 ? round(totalValue / totalQuantity, 4) : existing.unitPrice,
      });
    }
  }

  const positions = [...positionsByKey.values()];
  if (positions.length === 0) {
    return { ok: false, error: "Không tìm thấy position có ISIN và số lượng hợp lệ." };
  }

  const explicitId = grab(
    /(?:DOKUMENTENNUMMER|DEPOTAUSZUGSNR\.?|REFERENZ(?:NUMMER)?)\s*:?\s*([A-Z0-9][A-Z0-9-]{5,})/i,
    text,
  );
  const accountRef =
    grab(/(?:DEPOTNUMMER|DEPOTKONTO|DEPOT)\b\s*:?\s*([A-Z0-9][A-Z0-9 -]{3,29})(?:\n|$)/i, text) ||
    undefined;
  const fingerprint = positions
    .map((p) => `${p.instrumentIsin}:${p.currency}:${p.quantity}`)
    .sort()
    .join("|");
  const statementId = explicitId || `tr-depot:${date}:${stableHash(`${accountRef ?? ""}|${fingerprint}`)}`;
  if (!explicitId) {
    warnings.push("Không có số tài liệu; đã tạo statementId ổn định từ ngày và positions.");
  }

  return {
    ok: true,
    warnings,
    value: { statementId, date, accountRef, positions },
  };
}

export function parseTrDocumentText(rawText: string): TrDocumentParseResult {
  const kind = classifyTrDocument(rawText);
  if (kind === "execution_invoice") {
    const parsed = parseTrText(rawText);
    if (!parsed.ok) return { ok: false, kind: "unsupported", error: parsed.error };
    return { ok: true, kind, value: parsed.value, warnings: parsed.warnings };
  }
  if (kind === "depot_statement") {
    const parsed = parseTrDepotStatementText(rawText);
    if (!parsed.ok) return { ok: false, kind: "unsupported", error: parsed.error };
    return { ok: true, kind, value: parsed.value, warnings: parsed.warnings };
  }
  return {
    ok: false,
    kind: "unsupported",
    error: "Tài liệu không được hỗ trợ. Hãy chọn hóa đơn giao dịch hoặc sao kê Depot có lớp chữ.",
  };
}

export function reconcileDepotStatement(
  statement: Pick<ParsedDepotStatement, "date" | "positions">,
  transactions: Transaction[],
  tolerance = 0.000001,
): DepotReconciliationRow[] {
  const book = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.deletedAt || tx.date > statement.date) continue;
    if (!isSecurityBuy(tx.type) && !isSecuritySell(tx.type)) continue;
    const isin = resolveInstrumentIsin(tx);
    const quantity = tx.quantity ?? 0;
    if (!isin || !Number.isFinite(quantity) || quantity <= 0) continue;
    const sign = isSecuritySell(tx.type) ? -1 : 1;
    book.set(isin, round((book.get(isin) ?? 0) + sign * quantity));
  }

  const statementMap = new Map<string, DepotPosition>();
  for (const position of statement.positions) {
    statementMap.set(normalizeIsin(position.instrumentIsin), position);
  }
  const keys = new Set([...book.keys(), ...statementMap.keys()]);

  return [...keys]
    .sort()
    .map((instrumentIsin) => {
      const position = statementMap.get(instrumentIsin);
      const statementQuantity = position?.quantity ?? 0;
      const bookQuantity = book.get(instrumentIsin) ?? 0;
      const difference = round(statementQuantity - bookQuantity);
      let status: ReconciliationStatus;
      if (Math.abs(difference) <= tolerance) status = "match";
      else if (!book.has(instrumentIsin)) status = "missing_local";
      else if (!statementMap.has(instrumentIsin)) status = "missing_statement";
      else status = "difference";
      return {
        instrumentIsin,
        name: position?.name,
        currency: position?.currency ?? "EUR",
        statementQuantity,
        bookQuantity,
        difference,
        status,
      };
    });
}

export function reconciliationStatusLabel(status: ReconciliationStatus): string {
  if (status === "match") return "Khớp";
  if (status === "missing_local") return "Thiếu trong ứng dụng";
  if (status === "missing_statement") return "Thiếu trên sao kê";
  return "Chênh lệch";
}
