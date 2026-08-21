/**
 * DEBT_3 of OVERVIEW-NUMBERS-P0-001 r2 — read-only depot reconciliation.
 *
 * A broker statement is evidence, never a source of transactions. This module
 * only reads: it compares the newest statement against the quantities the
 * ledger actually books, names the gap in units and in money at the price
 * printed on the statement, and says how old that statement is.
 *
 * The ledger column is produced by replaying the entries through
 * applyTransaction from ./calc, not by re-adding quantities by hand. That
 * matters: applyTransaction returns the state unchanged unless the ISIN is
 * resolvable AND isValidIsin passes, and it clamps a sell to the quantity
 * actually held. Any hand-rolled sum diverges from the portfolio the app
 * displays (FINDING_NOTION_10), and a reconciliation that compares against a
 * quantity the app never held is worse than no reconciliation at all.
 *
 * Entries the replay refuses are counted and named instead of vanishing.
 */
import type { DepotPosition, Transaction } from "./types";
import { applyTransaction, calcQuantity, emptyPortfolio, formatDateVN, getPosition } from "./calc";
import {
  classifyTransactionAgainstHoldings,
  compareTransactionReplayOrder,
} from "./transactionValidation";
import {
  hasResolvableInstrumentIsin,
  isSecurityBuy,
  isSecuritySell,
  isValidIsin,
  normalizeIsin,
  resolveInstrumentIsin,
} from "./instrument";

export const QUANTITY_TOLERANCE = 0.000001;

/** Only the ledger fields a reconciliation may read. */
export type ReconciliationLedgerEntry = Pick<Transaction, "date" | "type" | "amount"> &
  Partial<
    Pick<
      Transaction,
      "id" | "createdAt" | "notes" | "quantity" | "unitPrice" | "fee" | "tax" | "instrumentIsin" | "deletedAt"
    >
  >;

export type DepotStatementSnapshot = {
  date: string;
  positions: DepotPosition[];
};

export type DepotLineStatus = "match" | "gap" | "missing_in_ledger" | "missing_on_statement";

/** What the replay accepted and what it had to refuse. */
export type LedgerAdmission = {
  counted: number;
  ignoredInvalidIsin: number;
  zeroQuantityBuys: number;
  skippedDeleted: number;
  skippedAfterStatement: number;
};

export type DepotReconciliationLine = {
  instrumentIsin: string;
  label: string;
  currency: string;
  statementQuantity: number;
  ledgerQuantity: number;
  /** statement − ledger, in units. */
  quantityGap: number;
  /** Price printed on the statement. Never today's price. */
  statementUnitPrice: number | null;
  moneyGap: number | null;
  status: DepotLineStatus;
};

export type DepotReconciliationDisplay = {
  status: "no_statement" | "all_match" | "has_gap";
  statementDate: string | null;
  ageDays: number | null;
  lines: DepotReconciliationLine[];
  gapLines: DepotReconciliationLine[];
  admission: LedgerAdmission;
  totalMoneyGap: number | null;
  /** False when at least one gap line has no price on the statement. */
  moneyGapComplete: boolean;
};

export type DepotReconciliationCopy = {
  headline: string;
  dateLabel: string | null;
  detail: string | null;
};

function round(value: number, digits = 6): number {
  const factor = Math.pow(10, digits);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function emptyLedgerAdmission(): LedgerAdmission {
  return {
    counted: 0,
    ignoredInvalidIsin: 0,
    zeroQuantityBuys: 0,
    skippedDeleted: 0,
    skippedAfterStatement: 0,
  };
}

/** Price per unit as printed on the statement, or derived from its own total. */
export function statementUnitPrice(position: DepotPosition): number | null {
  const unit = finite(position.unitPrice);
  if (unit != null && unit > 0) return round(unit, 4);
  const value = finite(position.marketValue);
  const quantity = finite(position.quantity);
  if (value != null && value > 0 && quantity != null && quantity > 0) {
    return round(value / quantity, 4);
  }
  return null;
}

/** Whole days between the statement date and today. Never negative. */
export function statementAgeDays(statementDate: string, today: string): number | null {
  const from = Date.parse(`${String(statementDate).slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${String(today).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const days = Math.round((to - from) / 86400000);
  return days > 0 ? days : 0;
}

/**
 * Replay the ledger up to the statement date with the app's own rules and
 * report which entries the replay refused.
 */
export function replayLedgerQuantities(
  entries: ReconciliationLedgerEntry[],
  asOfDate: string,
): { quantities: Record<string, number>; admission: LedgerAdmission } {
  const admission = emptyLedgerAdmission();
  const eligible: Array<{ entry: ReconciliationLedgerEntry; index: number }> = [];

  entries.forEach((entry, index) => {
    const isBuy = isSecurityBuy(entry.type);
    const isSell = isSecuritySell(entry.type);
    const isSecurity = isBuy || isSell;

    if (entry.deletedAt) {
      if (isSecurity) admission.skippedDeleted += 1;
      return;
    }
    if (asOfDate && entry.date > asOfDate) {
      if (isSecurity) admission.skippedAfterStatement += 1;
      return;
    }
    if (isSecurity) {
      const isin = hasResolvableInstrumentIsin(entry)
        ? normalizeIsin(resolveInstrumentIsin(entry))
        : "";
      if (!isin || !isValidIsin(isin)) {
        admission.ignoredInvalidIsin += 1;
        return;
      }
      admission.counted += 1;
      if (isBuy) {
        const explicit = finite(entry.quantity);
        const derived =
          explicit != null && explicit > 0
            ? explicit
            : calcQuantity(
                finite(entry.amount) ?? 0,
                finite(entry.unitPrice) ?? 0,
                finite(entry.fee) ?? 0,
                finite(entry.tax) ?? 0,
              );
        if (!(derived > 0)) admission.zeroQuantityBuys += 1;
      }
    }
    eligible.push({ entry, index });
  });

  eligible.sort((a, b) =>
    compareTransactionReplayOrder(
      {
        date: a.entry.date,
        createdAt: a.entry.createdAt ?? "",
        id: a.entry.id ?? `reconciliation-${a.index}`,
      },
      {
        date: b.entry.date,
        createdAt: b.entry.createdAt ?? "",
        id: b.entry.id ?? `reconciliation-${b.index}`,
      },
    ),
  );

  let state = emptyPortfolio();
  for (const item of eligible) {
    const isin = resolveInstrumentIsin(item.entry);
    const heldQuantity = isin ? getPosition(state, isin).qty : undefined;
    const classification = classifyTransactionAgainstHoldings(item.entry, heldQuantity);
    if (classification.status === "accepted") {
      state = applyTransaction(state, classification.normalized);
    }
  }

  const quantities: Record<string, number> = {};
  for (const [isin, position] of Object.entries(state.positions)) {
    const quantity = round(position.qty);
    if (Math.abs(quantity) > QUANTITY_TOLERANCE) quantities[isin] = quantity;
  }
  return { quantities, admission };
}

export function buildDepotReconciliation(input: {
  statement?: DepotStatementSnapshot | null;
  transactions: ReconciliationLedgerEntry[];
  /** ISO date. Defaults to the statement date so the module never reads a clock. */
  today?: string;
  tolerance?: number;
}): DepotReconciliationDisplay {
  const tolerance = input.tolerance ?? QUANTITY_TOLERANCE;
  const statement = input.statement;
  if (!statement || !statement.date || !statement.positions || statement.positions.length === 0) {
    return {
      status: "no_statement",
      statementDate: null,
      ageDays: null,
      lines: [],
      gapLines: [],
      admission: emptyLedgerAdmission(),
      totalMoneyGap: null,
      moneyGapComplete: false,
    };
  }

  const { quantities, admission } = replayLedgerQuantities(input.transactions, statement.date);

  const statementRows = new Map<
    string,
    { quantity: number; price: number | null; currency: string; label: string }
  >();
  for (const position of statement.positions) {
    const isin = normalizeIsin(position.instrumentIsin ?? "");
    if (!isin) continue;
    const quantity = finite(position.quantity) ?? 0;
    const price = statementUnitPrice(position);
    const existing = statementRows.get(isin);
    if (!existing) {
      statementRows.set(isin, {
        quantity: round(quantity),
        price,
        currency: position.currency || "EUR",
        label: position.name?.trim() || isin,
      });
    } else {
      statementRows.set(isin, {
        ...existing,
        quantity: round(existing.quantity + quantity),
        price: existing.price ?? price,
      });
    }
  }

  const keys = [...new Set([...statementRows.keys(), ...Object.keys(quantities)])].sort();
  const lines: DepotReconciliationLine[] = keys.map((isin) => {
    const row = statementRows.get(isin);
    const statementQuantity = row?.quantity ?? 0;
    const ledgerQuantity = quantities[isin] ?? 0;
    const quantityGap = round(statementQuantity - ledgerQuantity);
    const price = row?.price ?? null;
    let status: DepotLineStatus = "match";
    if (Math.abs(quantityGap) > tolerance) {
      if (!row) status = "missing_on_statement";
      else if (quantities[isin] == null) status = "missing_in_ledger";
      else status = "gap";
    }
    return {
      instrumentIsin: isin,
      label: row?.label ?? isin,
      currency: row?.currency ?? "EUR",
      statementQuantity,
      ledgerQuantity,
      quantityGap,
      statementUnitPrice: price,
      moneyGap: price != null ? round(quantityGap * price, 2) : null,
      status,
    };
  });

  const gapLines = lines.filter((line) => line.status !== "match");
  const pricedGaps = gapLines.filter((line) => line.moneyGap != null);
  const totalMoneyGap = pricedGaps.length
    ? round(
        pricedGaps.reduce((sum, line) => sum + (line.moneyGap ?? 0), 0),
        2,
      )
    : null;

  return {
    status: gapLines.length > 0 ? "has_gap" : "all_match",
    statementDate: statement.date,
    ageDays: statementAgeDays(statement.date, input.today ?? statement.date),
    lines,
    gapLines,
    admission,
    totalMoneyGap,
    moneyGapComplete: gapLines.length > 0 && pricedGaps.length === gapLines.length,
  };
}

/** Deterministic Vietnamese unit formatting; no Intl so copy is testable. */
export function formatUnits(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  const fixed = abs >= 1000 ? abs.toFixed(2) : abs.toFixed(4);
  const trimmed = fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
  return trimmed.replace(".", ",");
}

export function signedUnits(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) <= QUANTITY_TOLERANCE) return formatUnits(0);
  return `${value > 0 ? "+" : "−"}${formatUnits(value)}`;
}

function ageLabel(ageDays: number | null): string | null {
  if (ageDays == null) return null;
  if (ageDays === 0) return "hôm nay";
  if (ageDays === 1) return "hôm qua";
  return `${ageDays} ngày trước`;
}

function lineSentence(line: DepotReconciliationLine): string {
  if (line.status === "missing_in_ledger") {
    return `${line.label}: sao kê ${formatUnits(line.statementQuantity)} · sổ chưa có mã này`;
  }
  if (line.status === "missing_on_statement") {
    return `${line.label}: sổ ${formatUnits(line.ledgerQuantity)} · sao kê không liệt kê mã này`;
  }
  return `${line.label}: sao kê ${formatUnits(line.statementQuantity)} · sổ ${formatUnits(
    line.ledgerQuantity,
  )} · lệch ${signedUnits(line.quantityGap)} đơn vị`;
}

function admissionNotes(admission: LedgerAdmission): string[] {
  const notes: string[] = [];
  if (admission.ignoredInvalidIsin > 0) {
    notes.push(
      `bỏ qua ${admission.ignoredInvalidIsin} bút toán chứng khoán thiếu hoặc sai ISIN`,
    );
  }
  if (admission.zeroQuantityBuys > 0) {
    notes.push(`${admission.zeroQuantityBuys} lệnh mua không ra đơn vị nào`);
  }
  if (admission.skippedAfterStatement > 0) {
    notes.push(`${admission.skippedAfterStatement} bút toán sau ngày sao kê chưa được tính`);
  }
  return notes;
}

export function describeDepotReconciliation(
  display: DepotReconciliationDisplay,
): DepotReconciliationCopy {
  if (display.status === "no_statement") {
    return {
      headline: "Chưa có sao kê",
      dateLabel: null,
      detail: "Nhập PDF sao kê Depot để đối chiếu số lượng.",
    };
  }

  const age = ageLabel(display.ageDays);
  const dateLabel = display.statementDate
    ? `Sao kê ${formatDateVN(display.statementDate)}${age ? ` · ${age}` : ""}`
    : null;
  const notes = admissionNotes(display.admission);

  if (display.status === "all_match") {
    return {
      headline: `Khớp ${display.lines.length}/${display.lines.length} mã`,
      dateLabel,
      detail: notes.length > 0 ? notes.join(" · ") : null,
    };
  }

  const sentences = display.gapLines.slice(0, 2).map(lineSentence);
  const rest = display.gapLines.length - sentences.length;
  if (rest > 0) sentences.push(`và ${rest} mã khác`);
  return {
    headline: `${display.gapLines.length} mã lệch`,
    dateLabel,
    detail: [...sentences, ...notes].join(" · "),
  };
}
