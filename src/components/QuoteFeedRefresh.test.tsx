// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const dbMocks = vi.hoisted(() => ({
  ingestQuotesFeed: vi.fn(),
  listQuoteSelectionStates: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);

import QuoteFeedRefresh from "./QuoteFeedRefresh";

function offlineResult() {
  return {
    status: "offline",
    url: "/data/quotes.json",
    totalRows: 0,
    acceptedRows: 0,
    updated: 0,
    unchanged: 0,
    skipped: [],
    errors: [],
  };
}

function effectiveQuote(source: "auto" | "manual", asOf: string) {
  return {
    id: `quote-${source}`,
    instrumentIsin: "IE00BK5BQT80",
    currency: "EUR",
    source,
    price: 100,
    asOf,
    createdAt: "2000-01-01T00:00:00.000Z",
    updatedAt: "2000-01-01T00:00:00.000Z",
  };
}

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.listQuoteSelectionStates.mockResolvedValue([]);
  dbMocks.ingestQuotesFeed.mockResolvedValue(offlineResult());
});

describe("QuoteFeedRefresh", () => {
  it("warns when offline refresh retains a stale auto quote", async () => {
    const onUpdated = vi.fn();
    dbMocks.listQuoteSelectionStates.mockResolvedValue([
      { effective: effectiveQuote("auto", "2000-01-01") },
    ]);

    render(createElement(QuoteFeedRefresh, { onUpdated }));
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật giá bây giờ" }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Đang offline");
    expect(status.textContent).toContain("Giá tự động đang dùng là phiên 01/01/2000");
    expect(status.textContent).toContain("đã quá 7 ngày");
    expect(status.getAttribute("data-freshness")).toBe("stale");
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("does not label a retained manual quote as stale", async () => {
    dbMocks.listQuoteSelectionStates.mockResolvedValue([
      { effective: effectiveQuote("manual", "2000-01-01") },
    ]);

    render(createElement(QuoteFeedRefresh));
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật giá bây giờ" }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Đang offline — giá đã lưu trên máy vẫn được giữ nguyên.");
    expect(status.getAttribute("data-freshness")).toBe("unknown");
  });

  it("keeps refreshing even when retained-quote diagnostics cannot load", async () => {
    dbMocks.listQuoteSelectionStates.mockRejectedValue(new Error("IndexedDB unavailable"));

    render(createElement(QuoteFeedRefresh));
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật giá bây giờ" }));

    await screen.findByText("Đang offline — giá đã lưu trên máy vẫn được giữ nguyên.");
    expect(dbMocks.ingestQuotesFeed).toHaveBeenCalledTimes(1);
  });

  it("keeps the stale warning when the refresh throws", async () => {
    dbMocks.listQuoteSelectionStates.mockResolvedValue([
      { effective: effectiveQuote("auto", "2000-01-01") },
    ]);
    dbMocks.ingestQuotesFeed.mockRejectedValue(new Error("network down"));

    render(createElement(QuoteFeedRefresh));
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật giá bây giờ" }));

    const status = await screen.findByRole("status");
    await waitFor(() => expect(status.textContent).toContain("network down"));
    expect(status.textContent).toContain("đã quá 7 ngày");
    expect(status.getAttribute("data-freshness")).toBe("stale");
  });
});
