import { describe, expect, it } from "vitest";
import { toDateOnly } from "./instrument";
import {
  buildFeedFreshness,
  describeFetchAge,
  describeRefreshResult,
  formatSessionDate,
} from "./quoteFreshness";
import type { QuoteFeedIngestResult } from "./quoteFeed";
import { STALE_DAYS } from "./types";

/** Local midday, so the calendar day is identical in every runner timezone. */
const NOW = new Date(2026, 7, 7, 12, 0, 0);

function isoBefore(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

function sessionDaysAgo(days: number): string {
  const day = new Date(NOW.getTime());
  day.setDate(day.getDate() - days);
  return toDateOnly(day);
}

function ingested(overrides: Partial<QuoteFeedIngestResult> = {}): QuoteFeedIngestResult {
  return {
    status: "ok",
    url: "/data/quotes.json",
    totalRows: 1,
    acceptedRows: 1,
    updated: 0,
    unchanged: 1,
    skipped: [],
    errors: [],
    feedGeneratedAt: isoBefore(4 * 60 * 60 * 1000),
    newestAsOf: sessionDaysAgo(1),
    newestFetchedAt: isoBefore(4 * 60 * 60 * 1000),
    ...overrides,
  };
}

describe("feed freshness", () => {
  it("reads a session date as a Vietnamese calendar date", () => {
    expect(formatSessionDate("2026-08-06")).toBe("06/08/2026");
  });

  it("names the session and its age for the last close", () => {
    const freshness = buildFeedFreshness({ asOf: sessionDaysAgo(1), now: NOW });
    expect(freshness.level).toBe("current");
    expect(freshness.ageDays).toBe(1);
    expect(freshness.summary).toBe(`phiên ${formatSessionDate(sessionDaysAgo(1))} · 1 ngày trước`);
  });

  it("does not count days when the session is today", () => {
    const freshness = buildFeedFreshness({ asOf: sessionDaysAgo(0), now: NOW });
    expect(freshness.level).toBe("current");
    expect(freshness.summary).toContain("hôm nay");
  });

  it("stays aging up to and including STALE_DAYS", () => {
    expect(buildFeedFreshness({ asOf: sessionDaysAgo(3), now: NOW }).level).toBe("aging");
    expect(buildFeedFreshness({ asOf: sessionDaysAgo(STALE_DAYS), now: NOW }).level).toBe("aging");
  });

  it("turns stale one day past STALE_DAYS and says so out loud", () => {
    const freshness = buildFeedFreshness({ asOf: sessionDaysAgo(STALE_DAYS + 1), now: NOW });
    expect(freshness.level).toBe("stale");
    expect(freshness.ageDays).toBe(STALE_DAYS + 1);
    expect(freshness.summary).toContain(`quá ${STALE_DAYS} ngày`);
  });

  it("never guesses when the session date is missing or malformed", () => {
    for (const asOf of [undefined, null, "", "hôm qua", "2026-13-40"]) {
      const freshness = buildFeedFreshness({ asOf, now: NOW });
      expect(freshness.level).toBe("unknown");
      expect(freshness.ageDays).toBeNull();
      expect(freshness.summary).toBe("không đọc được ngày phiên");
    }
  });

  it("refuses a session dated in the future instead of showing a negative age", () => {
    const freshness = buildFeedFreshness({ asOf: sessionDaysAgo(-1), now: NOW });
    expect(freshness.level).toBe("unknown");
    expect(freshness.summary).toContain("tương lai");
  });

  it("measures the bot fetch in the coarsest honest unit", () => {
    expect(describeFetchAge(isoBefore(30_000), NOW)).toBe("vừa xong");
    expect(describeFetchAge(isoBefore(9 * 60_000), NOW)).toBe("9 phút trước");
    expect(describeFetchAge(isoBefore(4 * 60 * 60_000), NOW)).toBe("4 giờ trước");
    expect(describeFetchAge(isoBefore(50 * 60 * 60_000), NOW)).toBe("2 ngày trước");
    expect(describeFetchAge(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBeNull();
    expect(describeFetchAge("not a date", NOW)).toBeNull();
  });
});

describe("refresh result wording", () => {
  it("never claims the price is the newest when nothing was written", () => {
    const { message, level } = describeRefreshResult(ingested(), { now: NOW });
    expect(message).not.toMatch(/mới nhất/);
    expect(level).toBe("current");
    expect(message).toContain(`phiên ${formatSessionDate(sessionDaysAgo(1))}`);
    expect(message).toContain("bot lấy 4 giờ trước");
    expect(message).toContain("1 mã không đổi");
  });

  it("warns loudly when the feed itself is older than STALE_DAYS", () => {
    const staleAge = (STALE_DAYS + 2) * 24 * 60 * 60 * 1000;
    const { message, level } = describeRefreshResult(
      ingested({
        newestAsOf: sessionDaysAgo(STALE_DAYS + 2),
        newestFetchedAt: isoBefore(staleAge),
        feedGeneratedAt: isoBefore(staleAge),
      }),
      { now: NOW },
    );
    expect(level).toBe("stale");
    expect(message).toContain("Nguồn giá đang cũ");
    expect(message).toContain(`quá ${STALE_DAYS} ngày`);
  });

  it("counts only what it actually wrote", () => {
    const { message } = describeRefreshResult(
      ingested({ updated: 2, unchanged: 0, totalRows: 2, acceptedRows: 2 }),
      { now: NOW },
    );
    expect(message).toContain("2 mã đã cập nhật");
    expect(message).not.toContain("không đổi");
  });

  it("keeps the offline and failure sentences unchanged", () => {
    const offline = describeRefreshResult(
      ingested({
        status: "offline",
        unchanged: 0,
        totalRows: 0,
        acceptedRows: 0,
        feedGeneratedAt: undefined,
        newestAsOf: undefined,
        newestFetchedAt: undefined,
      }),
      { now: NOW },
    );
    expect(offline.message).toBe("Đang offline — giá đã lưu trên máy vẫn được giữ nguyên.");
    expect(offline.freshness).toBeNull();

    const failed = describeRefreshResult(
      ingested({ status: "error", errors: ["quote feed HTTP 404"], unchanged: 0 }),
      { now: NOW },
    );
    expect(failed.message).toContain("Giá đang dùng không bị thay đổi");
    expect(failed.message).toContain("quote feed HTTP 404");
    expect(failed.freshness).toBeNull();
  });

  it("still reports skipped rows and per-instrument errors", () => {
    const { message } = describeRefreshResult(
      ingested({
        status: "partial",
        skipped: [{ index: 1, reason: "asOf must be a valid YYYY-MM-DD date" }],
        errors: ["IE00BK5BQT80|EUR: write failed"],
      }),
      { now: NOW },
    );
    expect(message).toContain("1 dòng không hợp lệ đã bỏ qua");
    expect(message).toContain("1 mã gặp lỗi");
  });

  it("stays honest when the feed carries no readable session at all", () => {
    const { message, level } = describeRefreshResult(
      ingested({ newestAsOf: undefined, unchanged: 0, acceptedRows: 0, totalRows: 0 }),
      { now: NOW },
    );
    expect(level).toBe("unknown");
    expect(message).toContain("không đọc được ngày phiên");
  });
});
