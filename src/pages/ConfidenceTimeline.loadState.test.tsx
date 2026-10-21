// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const dbMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  listQuotes: vi.fn(),
  listTransactions: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/locale", () => ({ useLocale: () => ({ locale: "vi" }) }));

import ConfidenceTimeline from "./ConfidenceTimeline";

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getSettings.mockResolvedValue({ depotStatements: [] });
  dbMocks.listQuotes.mockResolvedValue([{
    id: "IE00BK5BQT80|EUR",
    instrumentIsin: "IE00BK5BQT80",
    currency: "EUR",
    venue: "XETRA",
    price: 170.36,
    asOf: "2026-10-20",
    source: "auto",
    fetchedAt: "2026-10-20T20:39:54.703Z",
    createdAt: "2026-10-20T20:39:54.703Z",
    updatedAt: "2026-10-21T06:57:00.000Z",
  }]);
  dbMocks.listTransactions.mockResolvedValue([{
    id: "tx-buy",
    date: "2026-10-16",
    type: "buy_vwce",
    amount: 120,
    instrumentIsin: "IE00BK5BQT80",
    notes: "Góp tháng 10",
    createdAt: "2026-10-16T11:36:00.000Z",
    updatedAt: "2026-10-16T11:36:00.000Z",
    source: "manual",
  }]);
});

describe("ConfidenceTimeline", () => {
  it("shows quote value, market session and bot fetch separately from the local snapshot timestamp", async () => {
    render(createElement(ConfidenceTimeline, { syncStatus: "synced", pending: 0 }));

    expect(await screen.findByText("Snapshot giá · VWCE")).toBeTruthy();
    expect(screen.getByText(/170,36/)).toBeTruthy();
    expect(screen.getByText(/Phiên giá: 20\/10\/2026/)).toBeTruthy();
    expect(screen.getByText(/Bot lấy dữ liệu: 20\/10\/2026/)).toBeTruthy();
    expect(screen.getByText(/Giá · 21\/10\/2026/)).toBeTruthy();
  });

  it("shows the current emergency contact snapshot only after expanding it", async () => {
    dbMocks.getSettings.mockResolvedValueOnce({
      depotStatements: [],
      notfallmappe: {
        updatedAt: "2026-10-20T10:00:00.000Z",
        contacts: [{ id: "contact-1", name: "Mẹ", relation: "Mẹ", phone: "+49 111", email: "mom@example.test" }],
      },
    });
    dbMocks.listQuotes.mockResolvedValue([]);
    dbMocks.listTransactions.mockResolvedValue([]);

    render(createElement(ConfidenceTimeline, { syncStatus: "synced", pending: 0 }));

    expect(await screen.findByText("Snapshot liên hệ hiện tại · 1 người")).toBeTruthy();
    const contactDetails = document.querySelector("details.ct-event-contact") as HTMLDetailsElement | null;
    expect(contactDetails).toBeTruthy();
    expect(contactDetails?.open).toBe(false);

    fireEvent.click(screen.getByText("Xem thông tin liên hệ (1)"));
    expect(contactDetails?.open).toBe(true);
    expect(screen.getByText("Mẹ")).toBeTruthy();
    expect(screen.getByText(/\+49 111/)).toBeTruthy();
    expect(screen.getByText("mom@example.test")).toBeTruthy();
    expect(screen.getByText(/không phải lịch sử từng liên hệ/)).toBeTruthy();
  });

  it("shows transaction amount and reveals its note only when the owner opens it", async () => {
    render(createElement(ConfidenceTimeline, { syncStatus: "synced", pending: 0 }));

    expect(await screen.findByText("Đã ghi giao dịch · Mua VWCE")).toBeTruthy();
    expect(screen.getByText(/120,00/)).toBeTruthy();
    const noteDetails = document.querySelector("details.ct-event-note") as HTMLDetailsElement | null;
    expect(noteDetails).toBeTruthy();
    expect(noteDetails?.open).toBe(false);

    fireEvent.click(screen.getByText("Xem ghi chú"));
    expect(noteDetails?.open).toBe(true);
    expect(screen.getByText("Góp tháng 10")).toBeTruthy();
  });
});
