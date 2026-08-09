import type { AppSettings, Transaction } from "./types";
import { STALE_DAYS } from "./types";
import type { TodayCenterPortfolioSnapshot } from "./todayCenterAdapter";

export type NhipInsightKind =
  | "empty_start"
  | "contribution_rhythm"
  | "days_to_goal"
  | "stale_price"
  | "on_track";

export type NhipInsight = {
  kind: NhipInsightKind;
  text: string;
};

export type NhipInsightInput = {
  portfolioEmpty: boolean;
  vwceAsOf: string | null;
  planEndDate: string;
  transactions: ReadonlyArray<Pick<Transaction, "date" | "type" | "amount" | "deletedAt">>;
  /** Injected ISO timestamp for deterministic tests. Defaults to new Date().toISOString(). */
  now?: string;
};

export type NhipInsightsResult = {
  insights: NhipInsight[];
};

const MAX_INSIGHTS = 3;
/**
 * OVERVIEW-RHYTHM-001 r2: exported so RhythmHero and Overview can reference
 * the same constant, keeping X_hero and X_nhip on identical periods.
 *
 * OVERVIEW-RHYTHM-001 r3: value is unchanged on purpose. r3 touches copy and
 * layout only; the window itself is frozen.
 *
 * OVERVIEW-RHYTHM-001 r4: still frozen. r4 changes who RENDERS these insights
 * and what one of them says, never how long the window is.
 */
export const CONTRIBUTION_WINDOW_DAYS = 35;
const GOAL_UPCOMING_DAYS = 365;
const MONEY_EPSILON = 0.005;
const QUANTITY_EPSILON = 0.000001;

function daysBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

export function buildNhipInsights({
  portfolioEmpty,
  vwceAsOf,
  planEndDate,
  transactions,
  now: rawNow,
}: NhipInsightInput): NhipInsightsResult {
  const now = rawNow ?? new Date().toISOString();
  const result: NhipInsight[] = [];

  // empty_start is returned alone — no other signals matter
  if (portfolioEmpty) {
    return {
      insights: [{
        kind: "empty_start",
        text: "Bắt đầu bằng khoản góp đầu tiên để tạo nhịp quỹ cho bé.",
      }],
    };
  }

  // stale_price — highest priority for non-empty portfolio
  if (vwceAsOf) {
    const age = daysBetween(vwceAsOf, now);
    if (age !== null && age > STALE_DAYS) {
      result.push({
        kind: "stale_price",
        text: `Giá VWCE đang dùng đã ${age} ngày tuổi — cập nhật để con số phản ánh thị trường gần nhất.`,
      });
    }
  }

  // days_to_goal — plan end approaching within one year
  if (result.length < MAX_INSIGHTS) {
    const daysToEnd = daysBetween(now, planEndDate);
    if (daysToEnd !== null && daysToEnd > 0 && daysToEnd <= GOAL_UPCOMING_DAYS) {
      result.push({
        kind: "days_to_goal",
        text: `Còn ${daysToEnd} ngày đến ${planEndDate.slice(0, 10)} — mốc kế hoạch đang đến gần.`,
      });
    }
  }

  // Contribution rhythm.
  //
  // OVERVIEW-RHYTHM-001 r3 (Option B) — the hero owns the sentence
  // "Bạn đã góp X € trong 35 ngày qua", so this line stopped repeating the
  // total and kept only the count.
  //
  // OVERVIEW-RHYTHM-001 r4 — r3 shrank the duplicate; r4 removes it. The
  // engine keeps producing `on_track` unchanged (other callers, the tests and
  // any future surface still get it), but the overview no longer renders that
  // kind at all — see HERO_OWNED_KINDS in TodayCenter.tsx. What survives on
  // screen is the branch below it: an empty 35-day window, i.e. the rhythm is
  // actually broken. Its copy now names that problem directly instead of
  // narrating a period the hero already reported.
  //
  // No new "off track" state was invented for r4. `recent.length === 0` is a
  // condition this engine has always evaluated; r4 only stopped burying it
  // underneath a cheerful twin.
  if (result.length < MAX_INSIGHTS) {
    const cutoffMs = Date.parse(now) - CONTRIBUTION_WINDOW_DAYS * 86_400_000;
    const recent = transactions.filter((tx) => {
      if (tx.deletedAt) return false;
      const t = tx.type;
      if (t !== "cash_in" && t !== "buy_vwce" && t !== "buy_security") return false;
      const d = Date.parse(tx.date);
      return Number.isFinite(d) && d >= cutoffMs;
    });

    if (recent.length === 0) {
      result.push({
        kind: "contribution_rhythm",
        text: `Nhịp đã đứt: không có khoản góp nào trong ${CONTRIBUTION_WINDOW_DAYS} ngày gần nhất.`,
      });
    } else {
      const total = recent.reduce(
        (s, tx) => s + (Number.isFinite(tx.amount) ? tx.amount : 0),
        0,
      );
      result.push({
        kind: "on_track",
        text: `Trong ${CONTRIBUTION_WINDOW_DAYS} ngày qua: ${recent.length} lần góp · tổng ${Math.round(total)} €`,
      });
    }
  }

  return { insights: result.slice(0, MAX_INSIGHTS) };
}

/**
 * One shared definition of "the fund has not started yet".
 *
 * A ledger that recorded activity is never empty, even when the numbers happen
 * to net back to zero. Without this rule the UI tells a first-time story
 * ("start with your first contribution") to someone who already deposited and
 * withdrew, which is false. Soft-deleted rows do not count as activity.
 */
export function isLedgerEmpty({
  transactions,
  totalValue,
  totalQuantity,
}: {
  transactions: ReadonlyArray<Pick<Transaction, "deletedAt">>;
  totalValue: number;
  totalQuantity: number;
}): boolean {
  const active = transactions.filter((tx) => !tx.deletedAt);
  return (
    active.length === 0 &&
    Math.abs(totalValue) < MONEY_EPSILON &&
    Math.abs(totalQuantity) < QUANTITY_EPSILON
  );
}

/**
 * Thin adapter: extract NhipInsightInput from the existing UI data objects
 * so callers do not need to know which fields the engine reads.
 */
export function buildNhipInsightInput(
  snapshot: TodayCenterPortfolioSnapshot,
  transactions: Transaction[],
  settings: Pick<AppSettings, "endDate">,
  now?: string,
): NhipInsightInput {
  return {
    portfolioEmpty: isLedgerEmpty({
      transactions,
      totalValue: snapshot.totalValue,
      totalQuantity: snapshot.totalQuantity,
    }),
    vwceAsOf: snapshot.vwceQuote?.asOf ?? null,
    planEndDate: settings.endDate,
    transactions,
    now,
  };
}
