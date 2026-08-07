/**
 * Deterministic cost-basis statements for the overview screen.
 *
 * DEBT_2 of OVERVIEW-NUMBERS-P0-001 r2. Two silent statements survived r1 and
 * DEBT_1:
 *
 * 1. `avgCost()` returns 0 when nothing is held, so the detail list printed
 *    "0 €" next to "Giá vốn TB VWCE" as if the average cost really were zero.
 * 2. `buildOverviewHero` already computes `pnlSuppressedReason`, but no screen
 *    read it: the profit and loss cell showed a bare "—" and never said which
 *    of the three reasons applied.
 *
 * So this module states the cost basis together with the ledger entries it was
 * built from, and turns a withheld profit and loss into one short reason.
 * Everything here is pure: no Date.now(), no Intl, no storage, no network.
 * Money formatting stays in the component.
 */

import {
  isSecurityBuy,
  isSecuritySell,
  isValidIsin,
  normalizeIsin,
  resolveInstrumentIsin,
} from "./instrument";
import { VWCE_ISIN } from "./types";
import type { PnlSuppressedReason } from "./overviewNumbers";

/** Money differences below half a cent are display noise. */
const MONEY_EPSILON = 0.005;
/** Quantities are stored with four to six decimals. */
const QUANTITY_EPSILON = 0.000001;

export type CostBasisLedgerEntry = {
  type: string;
  amount: number;
  fee?: number;
  tax?: number;
  instrumentIsin?: string;
  deletedAt?: string;
};

export type CostBasisProvenance = {
  /** Buys that really added money to the cost basis. */
  contributingBuys: number;
  /** Buys of this instrument with nothing left after fee and tax. */
  zeroValueBuys: number;
  /** Security buys the replay skipped because the ISIN was missing or malformed. */
  ignoredBuys: number;
  /** Sells, which reduce the cost basis proportionally. */
  sells: number;
};

export type CostBasisStatus = "stated" | "no_position" | "no_cost_basis";

export type CostBasisDisplay = {
  status: CostBasisStatus;
  /** Average cost per unit, or null when it cannot be stated. Never 0 as a stand-in. */
  avgCost: number | null;
  costBasis: number;
  quantity: number;
  provenance: CostBasisProvenance;
};

export type CostBasisCopy = {
  /**
   * Replacement text for the value slot. Null means the caller formats
   * `avgCost` as money instead.
   */
  value: string | null;
  /** One short sentence naming where the number came from. */
  provenance: string | null;
};

function finite(value: number | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function emptyCostBasisProvenance(): CostBasisProvenance {
  return { contributingBuys: 0, zeroValueBuys: 0, ignoredBuys: 0, sells: 0 };
}

/**
 * Counts the ledger entries that built the cost basis of one instrument.
 *
 * The rules mirror `applyTransaction` and `replayTransactions` deliberately:
 * soft deleted rows are skipped, a security buy without a resolvable ISIN
 * changes nothing at all, and only the net amount after fee and tax reaches the
 * cost basis. Counting any other way would describe a ledger the app never
 * replayed.
 */
export function summarizeCostBasisLedger(
  entries: ReadonlyArray<CostBasisLedgerEntry> | null | undefined,
  isin: string = VWCE_ISIN,
): CostBasisProvenance {
  const target = normalizeIsin(isin);
  const out = emptyCostBasisProvenance();
  for (const entry of entries ?? []) {
    if (!entry || entry.deletedAt) continue;
    const buy = isSecurityBuy(entry.type);
    const sell = isSecuritySell(entry.type);
    if (!buy && !sell) continue;
    const resolved = resolveInstrumentIsin(entry);
    if (!resolved || !isValidIsin(resolved)) {
      if (buy) out.ignoredBuys += 1;
      continue;
    }
    if (resolved !== target) continue;
    if (sell) {
      out.sells += 1;
      continue;
    }
    const net = finite(entry.amount) - finite(entry.fee) - finite(entry.tax);
    if (net > MONEY_EPSILON) out.contributingBuys += 1;
    else out.zeroValueBuys += 1;
  }
  return out;
}

/**
 * Decides whether an average cost can be stated at all. `avgCost` is null
 * rather than 0 whenever it cannot, so no caller can print a zero that reads
 * like a real price.
 */
export function buildCostBasisDisplay(input: {
  costBasis: number;
  quantity: number;
  provenance?: CostBasisProvenance;
}): CostBasisDisplay {
  const costBasis = finite(input.costBasis);
  const quantity = Math.max(0, finite(input.quantity));
  const provenance = input.provenance ?? emptyCostBasisProvenance();

  if (quantity <= QUANTITY_EPSILON) {
    return { status: "no_position", avgCost: null, costBasis, quantity, provenance };
  }
  if (costBasis <= MONEY_EPSILON) {
    return { status: "no_cost_basis", avgCost: null, costBasis, quantity, provenance };
  }
  return {
    status: "stated",
    avgCost: costBasis / quantity,
    costBasis,
    quantity,
    provenance,
  };
}

function buyCount(count: number): string {
  return `${count} lệnh mua`;
}

/** Vietnamese copy for the cost basis row. */
export function describeCostBasis(display: CostBasisDisplay): CostBasisCopy {
  const { contributingBuys, zeroValueBuys, ignoredBuys, sells } = display.provenance;
  const notes: string[] = [];
  if (ignoredBuys > 0) notes.push(`bỏ qua ${buyCount(ignoredBuys)} thiếu hoặc sai ISIN`);
  if (zeroValueBuys > 0) notes.push(`${buyCount(zeroValueBuys)} không còn tiền sau phí và thuế`);

  if (display.status === "no_position") {
    const reason =
      contributingBuys > 0 && sells > 0
        ? `${buyCount(contributingBuys)} đã bán hết qua ${sells} lệnh bán`
        : ignoredBuys > 0
          ? `Sổ chỉ có ${buyCount(ignoredBuys)} thiếu hoặc sai ISIN`
          : "Sổ chưa có lệnh mua nào";
    return { value: "Chưa giữ đơn vị nào", provenance: reason };
  }

  if (display.status === "no_cost_basis") {
    const reason =
      ignoredBuys > 0
        ? `Có đơn vị nhưng ${buyCount(ignoredBuys)} bị bỏ qua vì thiếu hoặc sai ISIN`
        : "Có đơn vị nhưng sổ chưa ghi số tiền mua";
    return { value: "Chưa tính được", provenance: reason };
  }

  if (contributingBuys === 0) {
    const mismatch = "Có giá vốn nhưng không khớp lệnh mua nào trong sổ";
    return {
      value: null,
      provenance: notes.length > 0 ? `${mismatch} · ${notes.join(" · ")}` : mismatch,
    };
  }

  const base = `Tính từ ${buyCount(contributingBuys)}, đã trừ phí và thuế`;
  const withSells = sells > 0 ? `${base}; ${sells} lệnh bán đã trừ theo tỉ lệ` : base;
  return {
    value: null,
    provenance: notes.length > 0 ? `${withSells} · ${notes.join(" · ")}` : withSells,
  };
}

/**
 * Turns `pnlSuppressedReason` into one short sentence. r1 computed the reason
 * and the screen dropped it, so the cell showed only "—".
 */
export function describePnlSuppression(
  reason: PnlSuppressedReason,
  context: { missingPriceCount?: number } = {},
): string | null {
  const missing = Math.max(0, Math.trunc(finite(context.missingPriceCount)));
  switch (reason) {
    case "no_position":
      return "Chưa giữ đơn vị nào";
    case "missing_price":
      return missing > 0 ? `Thiếu giá cho ${missing} mã` : "Chưa có giá cho mã này";
    case "no_cost_basis":
      return "Sổ chưa có giá vốn";
    default:
      return null;
  }
}
