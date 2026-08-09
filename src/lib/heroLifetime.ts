/**
 * OVERVIEW-HERO-LIFETIME-001 r1 — X_lifetime for the hero "kế hoạch" lines.
 *
 * ## Why this exists
 *
 * `portfolio.totalContributed` (calc.ts) only grows on `cash_in`. That is
 * correct for what it is: money that entered the wallet this app maintains.
 * It becomes wrong the moment it is reused as "how much has been contributed
 * to the fund", because in securities-first mode the owner pays the broker
 * from a bank account this app never sees. The ledger holds `buy_vwce` rows
 * and no `cash_in` at all, so the hero printed
 *
 *     Bạn đã góp 100 € trong 35 ngày qua
 *     Đã góp 0,00 € / 15.xxx € kế hoạch
 *
 * — two sentences contradicting each other on the same card.
 *
 * The fix is not to redefine `totalContributed`; other screens ("Vốn đã đóng",
 * the trace sheet, the cash model) depend on its current meaning, and widening
 * it would double-count for anyone who does keep the wallet here. Instead the
 * hero gets its own figure, derived from the ledger under the mode that is
 * actually in force.
 *
 * ## Definitions
 *
 * | Concept | Meaning | Source |
 * |---|---|---|
 * | `totalContributed` | cash that entered the in-app wallet | `calc.ts`, `case "cash_in"` — UNCHANGED |
 * | `heroLifetimeContribution` | money put into the fund, as the hero should state it | this file |
 *
 * ## Mode selection
 *
 * `settings.trackInAppCash === true` → cash-first. Anything else — `false`,
 * `undefined`, settings not loaded yet — → securities-first, matching the
 * default in `defaults.ts` and the same expression Overview already uses for
 * the cash column.
 *
 * ## Double-count guard
 *
 * The two type sets are **disjoint**, and that is the whole guard:
 *
 * - cash-first counts `cash_in` only, never a buy.
 * - securities-first counts `buy_vwce` + `buy_security` only, never `cash_in`.
 *
 * So a day carrying both a `cash_in` of 100 € and a `buy_vwce` of 100 € for
 * that same 100 € contributes 100 € to X, not 200 €, in either mode. No date
 * matching, no amount pairing, no heuristic — the mode already decides which
 * half of the double entry is the authoritative record of the contribution.
 *
 * (`nhipWindowTotal` in Overview.tsx sums all three types over 35 days and can
 * therefore still double-count that pair. It is out of scope here: r1 forbids
 * touching the Nhịp window, and the streak engine intentionally treats all
 * three as eligible. Documented in the PR body as a known, separate issue.)
 *
 * Pure: no Date.now(), no storage, no network.
 */

/** Contribution types for cash-first mode. Mirrors `calc.ts` `case "cash_in"`. */
export const CASH_FIRST_CONTRIBUTION_TYPES: readonly string[] = ["cash_in"];

/**
 * Contribution types for securities-first mode: the purchases themselves are
 * the contribution, because the funding leg never enters this app.
 */
export const SECURITIES_FIRST_CONTRIBUTION_TYPES: readonly string[] = [
  "buy_vwce",
  "buy_security",
];

export type HeroLifetimeMode = "cash_first" | "securities_first";

/**
 * Structural on purpose so this helper stays testable with plain literals and
 * never drags the full `Transaction` shape into a pure calculation.
 */
export type HeroLifetimeTransaction = {
  type: string;
  amount: number;
  deletedAt?: string | null;
};

export type HeroLifetimeInput = {
  transactions: ReadonlyArray<HeroLifetimeTransaction>;
  /** `settings.trackInAppCash`. Read only to pick the mode; never written. */
  trackInAppCash: boolean | null | undefined;
};

export type HeroLifetimeResult = {
  mode: HeroLifetimeMode;
  /** X_lifetime. Always finite and >= 0. */
  amount: number;
  /** Which ledger types were summed — surfaced for tests and for the trace. */
  countedTypes: readonly string[];
  /** How many ledger rows were counted. 0 means "nothing to state". */
  countedRows: number;
};

/** cash-first only when the owner opted in explicitly. */
export function heroLifetimeMode(
  trackInAppCash: boolean | null | undefined,
): HeroLifetimeMode {
  return trackInAppCash === true ? "cash_first" : "securities_first";
}

/**
 * Lifetime contribution as the hero should state it. No time window: this is
 * the whole ledger, unlike `nhipWindowTotal` which is deliberately 35 days.
 *
 * Soft-deleted rows are skipped, matching `contributionStreak.ts`. Non-finite
 * and non-positive amounts are skipped rather than summed, so one corrupt row
 * cannot turn X into NaN and blank the line.
 */
export function computeHeroLifetimeContribution(
  input: HeroLifetimeInput,
): HeroLifetimeResult {
  const mode = heroLifetimeMode(input.trackInAppCash);
  const countedTypes =
    mode === "cash_first"
      ? CASH_FIRST_CONTRIBUTION_TYPES
      : SECURITIES_FIRST_CONTRIBUTION_TYPES;

  let amount = 0;
  let countedRows = 0;

  for (const tx of input.transactions ?? []) {
    if (!tx) continue;
    if (tx.deletedAt) continue;
    if (!countedTypes.includes(tx.type)) continue;
    const value = tx.amount;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    amount += value;
    countedRows += 1;
  }

  return { mode, amount, countedTypes, countedRows };
}
