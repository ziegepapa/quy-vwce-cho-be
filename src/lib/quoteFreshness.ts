/**
 * Honest wording for the price feed status. Pure: no I/O and no clock of its
 * own — the caller passes `now`, so the screen and the tests read the same way.
 *
 * The old sentence "Giá đã là bản mới nhất" was a statement about the local
 * database, not about the market. On 06/08 the published feed was two sessions
 * old and the refresh button still claimed the price was current. Freshness
 * belongs to the session the price came from (`asOf`) and to the moment the
 * price bot read it (`fetchedAt`), so both are shown and neither is hidden.
 *
 * The staleness threshold is `STALE_DAYS` from types.ts — the same number
 * quoteResolve.ts already uses to mark an auto candidate stale. One threshold,
 * one meaning.
 */
import { calendarDaysBetween, isValidAsOfDate, toDateOnly } from "./instrument";
import { STALE_DAYS } from "./types";
import type { QuoteFeedIngestResult } from "./quoteFeed";

export type FeedFreshnessLevel = "current" | "aging" | "stale" | "unknown";

export type FeedFreshnessInput = {
  asOf?: string | null;
  fetchedAt?: string | null;
  now?: Date;
};

export type FeedFreshness = {
  level: FeedFreshnessLevel;
  /** Calendar days between the session and today; null when it cannot be read. */
  ageDays: number | null;
  sessionLabel: string | null;
  fetchedAgeLabel: string | null;
  summary: string;
};

export type RefreshDescription = {
  message: string;
  level: FeedFreshnessLevel;
  freshness: FeedFreshness | null;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** YYYY-MM-DD → DD/MM/YYYY. Plain string work, so no timezone can shift it. */
export function formatSessionDate(asOf: string): string {
  const [year, month, day] = asOf.split("-");
  return `${day}/${month}/${year}`;
}

export function describeDayAge(days: number): string {
  if (days <= 0) return "hôm nay";
  if (days === 1) return "1 ngày trước";
  return `${days} ngày trước`;
}

/** Latency from the bot fetch to now, in the coarsest unit that stays honest. */
export function describeFetchAge(fetchedAt: string, now: Date): string | null {
  const parsed = Date.parse(fetchedAt);
  if (!Number.isFinite(parsed)) return null;
  const elapsed = now.getTime() - parsed;
  if (elapsed < 0) return null;
  if (elapsed < MINUTE_MS) return "vừa xong";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} phút trước`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} giờ trước`;
  return `${Math.floor(elapsed / DAY_MS)} ngày trước`;
}

export function buildFeedFreshness(input: FeedFreshnessInput = {}): FeedFreshness {
  const now = input.now ?? new Date();
  const asOf = typeof input.asOf === "string" ? input.asOf.trim() : "";
  const rawFetchedAt = typeof input.fetchedAt === "string" ? input.fetchedAt.trim() : "";
  const fetchedAgeLabel = rawFetchedAt ? describeFetchAge(rawFetchedAt, now) : null;

  if (!isValidAsOfDate(asOf)) {
    return {
      level: "unknown",
      ageDays: null,
      sessionLabel: null,
      fetchedAgeLabel,
      summary: "không đọc được ngày phiên",
    };
  }

  const sessionLabel = formatSessionDate(asOf);
  const ageDays = calendarDaysBetween(asOf, toDateOnly(now));
  if (ageDays < 0) {
    return {
      level: "unknown",
      ageDays,
      sessionLabel,
      fetchedAgeLabel,
      summary: `phiên ${sessionLabel} nằm ở tương lai`,
    };
  }

  const level: FeedFreshnessLevel =
    ageDays <= 1 ? "current" : ageDays <= STALE_DAYS ? "aging" : "stale";
  const age = describeDayAge(ageDays);
  return {
    level,
    ageDays,
    sessionLabel,
    fetchedAgeLabel,
    summary:
      level === "stale"
        ? `phiên ${sessionLabel} · ${age} · quá ${STALE_DAYS} ngày`
        : `phiên ${sessionLabel} · ${age}`,
  };
}

/**
 * One sentence for the refresh button. The offline and failure wording is kept
 * exactly as it was: those two already told the truth.
 */
export function describeRefreshResult(
  result: QuoteFeedIngestResult,
  options: { now?: Date } = {},
): RefreshDescription {
  const now = options.now ?? new Date();

  if (result.status === "offline") {
    return {
      message: "Đang offline — giá đã lưu trên máy vẫn được giữ nguyên.",
      level: "unknown",
      freshness: null,
    };
  }
  if (result.status === "error") {
    const reason = result.errors[0];
    return {
      message: `Chưa cập nhật được. Giá đang dùng không bị thay đổi${
        reason ? `: ${reason}` : "."
      }`,
      level: "unknown",
      freshness: null,
    };
  }

  const freshness = buildFeedFreshness({
    asOf: result.newestAsOf,
    fetchedAt: result.newestFetchedAt,
    now,
  });

  const parts: string[] = [];
  if (result.updated > 0) parts.push(`${result.updated} mã đã cập nhật`);
  else if (freshness.level === "stale") parts.push("Nguồn giá đang cũ, chưa có phiên mới");
  else if (freshness.level === "unknown") parts.push("Đã đọc nguồn giá");
  else parts.push("Chưa có phiên mới");

  parts.push(freshness.summary);
  if (freshness.fetchedAgeLabel) parts.push(`bot lấy ${freshness.fetchedAgeLabel}`);
  if (result.unchanged > 0) parts.push(`${result.unchanged} mã không đổi`);
  if (result.skipped.length > 0) parts.push(`${result.skipped.length} dòng không hợp lệ đã bỏ qua`);
  if (result.errors.length > 0) parts.push(`${result.errors.length} mã gặp lỗi`);

  return { message: parts.join(" · "), level: freshness.level, freshness };
}
