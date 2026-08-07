/**
 * Allocation ratio for the overview hero — OVERVIEW-NUMBERS-P0-001 r2, DEBT_1.
 *
 * r1 locked the hero total but left the allocation bar with two dishonest
 * options, and the screen shipped the first one:
 *
 * 1. What shipped: with one missing `cash_in` entry the bar disappeared and
 *    the legend read "Ti le chua tinh duoc — thieu but toan nap", even though
 *    the depot really did hold 101,65 EUR of securities and 0 EUR of usable
 *    cash. Refusing to divide is not the same as having nothing to divide.
 * 2. The opposite lie: dividing by a denominator that still carries the
 *    negative cash balance, or printing a confident "100% chung khoan" that
 *    quietly ignores the deposit the ledger is still missing.
 *
 * The owner locked option A on 2026-08-07: divide by the public denominator —
 * securities plus cash counted as an asset, never negative, exactly the number
 * the hero already displays — and always ship the percentages together with a
 * label that names what they do not include yet.
 *
 * Everything here is pure: no Date.now(), no storage, no network, no Intl, no
 * AI. The component only places these strings.
 */

import type { OverviewHero } from "./overviewNumbers";

/** Money differences below half a cent are display noise. */
const MONEY_EPSILON = 0.005;

export type AllocationStatus = "unavailable" | "partial" | "complete";

/** What the ratio leaves out, ordered by how badly it misleads. */
export type AllocationCaveat = "missing_funding" | "missing_price";

/** Structurally a subset of OverviewHero, so the two can never disagree. */
export type AllocationInput = Pick<
  OverviewHero,
  "securitiesValue" | "cashAsset" | "cashShortfall" | "missingPriceCount"
>;

export type AllocationDisplay = {
  status: AllocationStatus;
  /** The number actually divided by: securities + cash counted as an asset. */
  denominator: number;
  securitiesValue: number;
  cashAsset: number;
  /** Integer percent; adds up to 100 with cashPct whenever showBar is true. */
  securitiesPct: number;
  cashPct: number;
  caveats: AllocationCaveat[];
  cashShortfall: number;
  missingPriceCount: number;
  /** False only when there is genuinely nothing to divide. */
  showBar: boolean;
};

export type AllocationCopy = {
  securitiesLabel: string;
  cashLabel: string;
  /** Never null while the ratio is only part of the picture. */
  caveat: string | null;
  /** Replaces the bar when there is nothing to divide. */
  unavailable: string | null;
  ariaLabel: string;
};

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Divides on the denominator the user can already see, so the bar agrees with
 * the hero total instead of contradicting it.
 */
export function buildAllocationDisplay(input: AllocationInput): AllocationDisplay {
  const securitiesValue = Math.max(0, finite(input.securitiesValue));
  const cashAsset = Math.max(0, finite(input.cashAsset));
  const cashShortfall = Math.max(0, finite(input.cashShortfall));
  const missingPriceCount = Math.max(0, Math.trunc(finite(input.missingPriceCount)));

  const caveats: AllocationCaveat[] = [];
  if (cashShortfall > MONEY_EPSILON) caveats.push("missing_funding");
  if (missingPriceCount > 0) caveats.push("missing_price");

  const denominator = securitiesValue + cashAsset;
  if (denominator <= MONEY_EPSILON) {
    return {
      status: "unavailable",
      denominator: 0,
      securitiesValue,
      cashAsset,
      securitiesPct: 0,
      cashPct: 0,
      caveats,
      cashShortfall,
      missingPriceCount,
      showBar: false,
    };
  }

  let securitiesPct = Math.round((securitiesValue / denominator) * 100);
  // A side that holds real money must never be rounded away to 0%.
  if (securitiesPct <= 0 && securitiesValue > MONEY_EPSILON) securitiesPct = 1;
  if (securitiesPct >= 100 && cashAsset > MONEY_EPSILON) securitiesPct = 99;
  securitiesPct = Math.min(100, Math.max(0, securitiesPct));

  return {
    status: caveats.length > 0 ? "partial" : "complete",
    denominator,
    securitiesValue,
    cashAsset,
    securitiesPct,
    cashPct: 100 - securitiesPct,
    caveats,
    cashShortfall,
    missingPriceCount,
    showBar: true,
  };
}

/**
 * The percentages are only honest next to the sentence that names what they
 * exclude, so both come from one place and cannot drift apart.
 */
export function describeAllocation(display: AllocationDisplay): AllocationCopy {
  const securitiesLabel = `Chứng khoán ${display.securitiesPct}%`;
  const cashLabel = `An toàn ${display.cashPct}%`;

  if (display.status === "unavailable") {
    const unavailable = display.cashShortfall > MONEY_EPSILON
      ? "Chưa tính được tỉ lệ — sổ còn thiếu bút toán nạp"
      : "Chưa có số dư để tính tỉ lệ";
    return {
      securitiesLabel,
      cashLabel,
      caveat: null,
      unavailable,
      ariaLabel: unavailable,
    };
  }

  const missing: string[] = [];
  if (display.caveats.includes("missing_funding")) missing.push("khoản nạp còn thiếu");
  if (display.caveats.includes("missing_price")) {
    missing.push(`${display.missingPriceCount} mã thiếu giá`);
  }
  const caveat = missing.length > 0
    ? `Tỉ lệ tính trên phần đã có — chưa gồm ${missing.join(" và ")}`
    : null;

  return {
    securitiesLabel,
    cashLabel,
    caveat,
    unavailable: null,
    ariaLabel: caveat
      ? `${securitiesLabel}, ${cashLabel}. ${caveat}`
      : `${securitiesLabel}, ${cashLabel}`,
  };
}
