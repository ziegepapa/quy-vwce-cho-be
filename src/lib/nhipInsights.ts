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
const CONTRIBUTION_WINDOW_DAYS = 35;
const GOAL_UPCOMING_DAYS = 365;

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

  // contribution rhythm — on_track or nudge based on recent activity
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
        text: `Chưa có khoản góp nào trong ${CONTRIBUTION_WINDOW_DAYS} ngày qua — đây là thời điểm tốt để duy trì nhịp.`,
      });
    } else {
      const total = recent.reduce(
        (s, tx) => s + (Number.isFinite(tx.amount) ? tx.amount : 0),
        0,
      );
      result.push({
        kind: "on_track",
        text: `${recent.length} khoản góp trong ${CONTRIBUTION_WINDOW_DAYS} ngày qua, tổng ${Math.round(total)} € — nhịp quỹ đang được duy trì.`,
      });
    }
  }

  return { insights: result.slice(0, MAX_INSIGHTS) };
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
    portfolioEmpty: snapshot.totalQuantity === 0 && snapshot.totalValue === 0,
    vwceAsOf: snapshot.vwceQuote?.asOf ?? null,
    planEndDate: settings.endDate,
    transactions,
    now,
  };
}
