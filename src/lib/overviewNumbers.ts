/**
 * Deterministic number rules for the overview screen (Pulse Home).
 *
 * Two numbers were literally true for their inputs and still wrong as
 * statements about the portfolio:
 *
 * 1. The hero netted a negative bookkeeping cash balance against real
 *    securities, so a depot worth 101,65 EUR with one missing `cash_in`
 *    entry was announced as "Tong tai san 1,65 EUR".
 * 2. "Doi gi?" divided the visit-to-visit value change by the previous
 *    baseline even when the ledger itself changed between the two visits, so
 *    deleting or re-importing transactions produced "-1.593,10 EUR (-99,9%)".
 *
 * CASH-MODEL-OPTIONAL-001 r1 added a third one. The owner pays for the ETF
 * from a bank or broker account this app never sees, so "missing deposit" was
 * ledger-true and product-false: it demanded a bookkeeping entry for money
 * that was never meant to pass through here. `trackInAppCash` decides whether
 * that gap exists at all; the assets line itself is identical in both modes.
 *
 * Everything here is pure: no Date.now(), no storage, no network, no AI. The
 * UI only maps these results to text.
 */

/** Money differences below half a cent are display noise. */
const MONEY_EPSILON = 0.005;
/** Quantities are stored with four to six decimals. */
const QUANTITY_EPSILON = 0.000001;
/** Below one euro a baseline cannot carry a meaningful percentage. */
const MIN_PERCENT_BASELINE = 1;

export type OverviewHeroStatus =
  | "empty"
  | "unfunded"
  | "incomplete_prices"
  | "ready";

export type PnlSuppressedReason =
  | "no_position"
  | "no_cost_basis"
  | "missing_price"
  | null;

export type OverviewHeroInput = {
  /** Market value of every position that has a valid price. */
  securitiesValue: number;
  /** Ledger cash balance. Negative means funding entries are missing. */
  cashBalance: number;
  /** How many instruments are still missing a price. */
  missingPriceCount: number;
  /** Total quantity held across all positions. */
  totalQuantity: number;
  /** Cost basis of the position used for profit and loss. */
  costBasis: number;
  /** Market value of that same position, or null when its price is missing. */
  positionValue: number | null;
  /** Number of ledger entries; zero means nothing has been recorded yet. */
  transactionCount: number;
  /**
   * True keeps the double-entry ledger: a buy without its `cash_in` is a
   * missing deposit worth reporting. False is securities-first, where the
   * purchase was funded outside the app, so there is no gap to report and
   * nothing to demand from the user.
   *
   * Required on purpose. A silent default is how one caller ends up reporting
   * a funding gap that the rest of the app has already dismissed.
   */
  trackInAppCash: boolean;
};

export type OverviewHero = {
  status: OverviewHeroStatus;
  /** What the user owns. A negative cash balance is never subtracted here. */
  assets: number;
  securitiesValue: number;
  /** Cash counted as an asset; never negative. */
  cashAsset: number;
  /** Missing funding entries, as a positive number. Always 0 when cash is not tracked. */
  cashShortfall: number;
  /** securities + cash, kept for the trace sheet only. */
  ledgerNet: number;
  missingPriceCount: number;
  /** Absolute profit and loss, or null when it cannot be stated honestly. */
  pnl: number | null;
  /** Percentage of the cost basis, never of a plan target. */
  pnlPct: number | null;
  pnlSuppressedReason: PnlSuppressedReason;
  /** True when the ledger is missing funding entries. */
  setupIncomplete: boolean;
  /**
   * False in securities-first mode, where the cash row is not a claim this app
   * is entitled to make. The UI reads it to stay quiet instead of printing a
   * number nobody maintains.
   */
  cashTracked: boolean;
};

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Splits the hero into assets, a funding gap and profit and loss so that no
 * single number silently mixes the three.
 */
export function buildOverviewHero(input: OverviewHeroInput): OverviewHero {
  const securitiesValue = finite(input.securitiesValue);
  const cashBalance = finite(input.cashBalance);
  const missingPriceCount = Math.max(0, Math.trunc(finite(input.missingPriceCount)));
  const totalQuantity = Math.max(0, finite(input.totalQuantity));
  const costBasis = finite(input.costBasis);
  const positionValue = finiteOrNull(input.positionValue);
  const transactionCount = Math.max(0, Math.trunc(finite(input.transactionCount)));
  const trackInAppCash = input.trackInAppCash === true;

  // The locked line: securities plus cash counted as an asset, never negative.
  // Both modes share it; only the reporting of the gap differs.
  const cashAsset = Math.max(0, cashBalance);
  const ledgerShortfall = cashBalance < 0 ? -cashBalance : 0;
  // Securities-first: the deposit never belonged in this app, so there is no
  // shortfall to report, no "unfunded" status and nothing to press the user
  // about. The raw balance still reaches the trace sheet through ledgerNet.
  const cashShortfall = trackInAppCash ? ledgerShortfall : 0;
  const setupIncomplete = cashShortfall > MONEY_EPSILON;

  let pnl: number | null = null;
  let pnlPct: number | null = null;
  let pnlSuppressedReason: PnlSuppressedReason = null;
  if (totalQuantity <= QUANTITY_EPSILON) {
    pnlSuppressedReason = "no_position";
  } else if (positionValue === null) {
    pnlSuppressedReason = "missing_price";
  } else if (costBasis <= 0) {
    pnlSuppressedReason = "no_cost_basis";
  } else {
    pnl = positionValue - costBasis;
    pnlPct = (pnl / costBasis) * 100;
  }

  const empty =
    transactionCount === 0 &&
    missingPriceCount === 0 &&
    Math.abs(securitiesValue) <= MONEY_EPSILON &&
    Math.abs(cashBalance) <= MONEY_EPSILON;

  const status: OverviewHeroStatus = empty
    ? "empty"
    : setupIncomplete
      ? "unfunded"
      : missingPriceCount > 0
        ? "incomplete_prices"
        : "ready";

  return {
    status,
    assets: securitiesValue + cashAsset,
    securitiesValue,
    cashAsset,
    cashShortfall,
    ledgerNet: securitiesValue + cashBalance,
    missingPriceCount,
    pnl,
    pnlPct,
    pnlSuppressedReason,
    setupIncomplete,
    cashTracked: trackInAppCash,
  };
}

export type PulseDeltaSnapshot = {
  value: number;
  quantity: number;
  valuePct?: number | null;
  since?: string;
};

export type PulseComparisonBasis =
  | "no_baseline"
  | "ledger_changed"
  | "baseline_too_small"
  | "price_only";

export type PulseDisplay = {
  basis: PulseComparisonBasis;
  value: number;
  quantity: number;
  quantityChanged: boolean;
  /** Only set for a like-for-like comparison of the same holdings. */
  percent: number | null;
  showPercent: boolean;
};

/**
 * A percentage is a performance claim, so it is only allowed when the same
 * holdings are compared with a baseline that is large enough to divide by.
 * Any quantity change means the ledger moved, not the market.
 */
export function buildPulseDisplay(
  delta: PulseDeltaSnapshot | null | undefined,
  options: { baselineValue?: number | null } = {},
): PulseDisplay {
  if (!delta) {
    return {
      basis: "no_baseline",
      value: 0,
      quantity: 0,
      quantityChanged: false,
      percent: null,
      showPercent: false,
    };
  }

  const value = finite(delta.value);
  const quantity = finite(delta.quantity);
  const quantityChanged = Math.abs(quantity) > QUANTITY_EPSILON;
  const baseline = finiteOrNull(options.baselineValue);

  if (quantityChanged) {
    return {
      basis: "ledger_changed",
      value,
      quantity,
      quantityChanged,
      percent: null,
      showPercent: false,
    };
  }

  if (baseline === null || Math.abs(baseline) < MIN_PERCENT_BASELINE) {
    return {
      basis: "baseline_too_small",
      value,
      quantity,
      quantityChanged,
      percent: null,
      showPercent: false,
    };
  }

  return {
    basis: "price_only",
    value,
    quantity,
    quantityChanged,
    percent: (value / Math.abs(baseline)) * 100,
    showPercent: true,
  };
}

/**
 * With a funding gap the screen already shows one "record the deposit" call to
 * action, so the monthly contribution nudge must stand down instead of adding
 * a second, competing task.
 */
export function shouldShowContributionNudge(input: {
  status: OverviewHeroStatus;
  hasContributionThisMonth: boolean;
}): boolean {
  if (input.hasContributionThisMonth) return false;
  return input.status !== "empty" && input.status !== "unfunded";
}
