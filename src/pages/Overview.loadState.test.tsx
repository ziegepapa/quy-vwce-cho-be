// @vitest-environment jsdom

import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { defaultSettings } from "../lib/defaults";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";

const dbMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  listQuotes: vi.fn(),
  listTransactions: vi.fn(),
  db: { appMetadata: { get: vi.fn() } },
}));

vi.mock("../lib/db", () => dbMocks);

import Overview from "./Overview";

function renderOverview() {
  return render(createElement(MemoryRouter, null, createElement(Overview)));
}

function renderGermanOverview() {
  window.localStorage.setItem(LOCALE_KEY, "de");
  return render(createElement(MemoryRouter, null, createElement(LocaleProvider, null, createElement(Overview))));
}

const TX_STAMP = "2026-08-01T00:00:00.000Z";
const MISSING_PRICE_ISIN = "IE00B5BMR087";

function cashIn(id: string, date: string, amount: number) {
  return { id, date, type: "cash_in", amount, notes: "", createdAt: TX_STAMP, updatedAt: TX_STAMP };
}

function buyVwce(id: string, date: string) {
  return {
    id,
    date,
    type: "buy_vwce" as const,
    amount: 100,
    quantity: 1,
    unitPrice: 100,
    fee: 0,
    tax: 0,
    notes: "",
    createdAt: TX_STAMP,
    updatedAt: TX_STAMP,
  };
}

function buyWithoutPrice(id: string, date: string) {
  return {
    id,
    date,
    type: "buy_security",
    instrumentIsin: MISSING_PRICE_ISIN,
    amount: 400,
    quantity: 5,
    unitPrice: 80,
    fee: 0,
    tax: 0,
    notes: "",
    createdAt: TX_STAMP,
    updatedAt: TX_STAMP,
  };
}

function buyMissingQuoteComplete(id: string, date: string) {
  return { ...buyWithoutPrice(id, date), notes: "Đã kiểm tra" };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.listQuotes.mockResolvedValue([]);
  dbMocks.listTransactions.mockResolvedValue([]);
  dbMocks.db.appMetadata.get.mockResolvedValue({ lastBackupAt: "" });
});

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LOCALE_KEY);
});

describe("Overview load state", () => {
  it("announces loading without rendering a partial overview", async () => {
    let resolveSettings: (value: unknown) => void = () => undefined;
    dbMocks.getSettings.mockReturnValue(new Promise((resolve) => { resolveSettings = resolve; }));

    renderOverview();

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-label")).toBe("Đang tải Tổng quan");
    expect(document.querySelector(".ov")).toBeNull();

    resolveSettings(defaultSettings());
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("shows a fail-closed error and retries the local read", async () => {
    dbMocks.getSettings.mockRejectedValueOnce(new Error("indexeddb offline")).mockResolvedValueOnce(defaultSettings());

    renderOverview();

    expect(await screen.findByRole("heading", { name: "Không tải được Tổng quan" })).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.querySelector(".ov")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(() => expect(document.querySelector(".ov")).toBeTruthy());
    expect(dbMocks.getSettings).toHaveBeenCalledTimes(2);
    expect(dbMocks.listTransactions).toHaveBeenCalledTimes(2);
  });
});

describe("Overview German locale", () => {
  it("does not leak Vietnamese overview labels when Deutsch is active", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([cashIn("tx-cash-1", "2026-08-01", 1000)]);

    renderGermanOverview();

    expect(await screen.findByText("VWCE-Kurs")).toBeTruthy();
    expect(screen.getByText("Anteile")).toBeTruthy();
    expect(screen.getAllByText("Sparplan").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Heute")).toBeTruthy();
    expect(screen.getByLabelText("Zu beachten")).toBeTruthy();
    expect(screen.getByLabelText("Langfristplan")).toBeTruthy();
    expect(screen.getByText(/Zieltermin:/)).toBeTruthy();
    expect(screen.getByLabelText("Jahresrückblick")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bericht exportieren" })).toBeTruthy();
    expect(screen.getAllByText("Noch nicht bewertbar").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/tháng góp|Giá VWCE|Cập nhật|Cổ phần|Chuỗi góp|Hiệu suất danh mục|Vốn góp|Nhịp danh mục|Kỳ góp tiếp theo|Cần chú ý|Tình trạng dữ liệu|Kế hoạch dài hạn hiện tại|Tổng kết năm|Xuất báo cáo/);
  });
});

describe("Overview clean hierarchy", () => {
  it("renders a calm portfolio-state hierarchy without duplicating the transaction dashboard", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ov")).toBeTruthy());
    expect(container.querySelector(".ovc-hero .ovc-eyebrow")).toBeTruthy();
    expect(container.querySelector(".ovc-meta .ovc-price")).toBeTruthy();
    expect(container.querySelector(".ovc-plan-meta")).toBeTruthy();
    expect(container.querySelector(".ovc-today-grid")).toBeTruthy();
    expect(container.querySelector(".ovc-attention .ovc-attention-list")).toBeTruthy();
    expect(container.querySelector(".data-health-list")).toBeNull();
    expect(container.querySelector('[aria-label="Kế hoạch dài hạn"]')).toBeTruthy();
    expect(container.querySelector(".ovc-foot")).toBeTruthy();
    expect(container.querySelector(".streak-card")).toBeNull();
    expect(container.querySelector(".perf-card")).toBeNull();
    expect(container.querySelector(".ovc-plan-meta")?.textContent).toContain("100,00");
    expect(container.querySelector(".ovc-plan-meta")?.textContent).toContain("/th");
    expect(container.querySelector(".ovc-pnl-pct")?.textContent).toBe("Chưa định giá");
  });

  it("binds the current portfolio value without inventing a PnL badge or contribution streak", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([cashIn("tx-cash-1", "2026-08-01", 1000)]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovc-hero")).toBeTruthy());
    expect(container.querySelector(".ovc-value")?.textContent?.trim()).not.toBe("");
    expect(container.querySelector(".ovc-pnl-row .ovc-pnl")?.textContent?.trim()).toBe("—");
    expect(container.querySelector(".hero-ring")).toBeNull();
    expect(container.querySelector(".streak-card")).toBeNull();
  });

  it("renders one merged attention list that links to the existing review surfaces", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-health", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([{ id: "quote-health", instrumentIsin: "IE00BK5BQT80", currency: "EUR", price: 110, asOf: "2026-08-19", source: "manual", createdAt: TX_STAMP, updatedAt: TX_STAMP }]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovc-attention")).toBeTruthy());
    expect(screen.getByLabelText("Cần chú ý")).toBeTruthy();
    const links = container.querySelectorAll<HTMLAnchorElement>(".ovc-attention a");
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe("#/transactions?quality=needs_review");
    expect(links[0]?.textContent).toContain("1 mục dữ liệu cần rà soát");
    expect(links[1]?.getAttribute("href")).toBe("#/settings");
    expect(links[1]?.textContent).toContain("Chưa ghi nhận sao lưu");
    expect(container.querySelector(".data-health-list")).toBeNull();
  });

  it("folds a data-quality attention signal into the merged list without duplicating it", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-quality", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([{ id: "quote-quality", instrumentIsin: "IE00BK5BQT80", currency: "EUR", price: 110, asOf: "2026-08-19", source: "manual", createdAt: TX_STAMP, updatedAt: TX_STAMP }]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovc-attention")).toBeTruthy());
    // One row only: the heartbeat signal and the data-health issue describe the
    // same underlying signal, so they must not appear twice.
    expect(container.querySelectorAll(".ovc-attention a[href='#/transactions?quality=needs_review']")).toHaveLength(1);
    expect(container.querySelector(".ovc-attention")?.textContent).toContain("1 mục dữ liệu cần rà soát");
    expect(container.querySelector(".ovc-attention")?.textContent).not.toContain("1 giao dịch cần rà soát");
  });

  it("uses precise missing-notes wording when Data Health only has missing notes", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.db.appMetadata.get.mockResolvedValue({ lastBackupAt: "2026-08-01T00:00:00Z" });
    dbMocks.listTransactions.mockResolvedValue([
      buyVwce("tx-note-1", "2026-08-01"),
      buyVwce("tx-note-2", "2026-08-02"),
    ]);
    dbMocks.listQuotes.mockResolvedValue([{
      id: "quote-notes",
      instrumentIsin: "IE00BK5BQT80",
      currency: "EUR",
      price: 110,
      asOf: "2026-08-19",
      source: "manual",
      createdAt: TX_STAMP,
      updatedAt: TX_STAMP,
    }]);
    const { container } = renderOverview();
    await waitFor(() => expect(container.querySelector(".ovc-attention")).toBeTruthy());
    expect(container.textContent).toContain("2 ghi chú còn thiếu");
    expect(container.textContent).not.toContain("2 mục dữ liệu cần rà soát");
    const healthLink = container.querySelector(".ovc-attention a");
    expect(healthLink?.getAttribute("href")).toBe("#/transactions?quality=needs_review");
  });


  it("routes a missing-price attention signal to Settings when transaction data is complete", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyMissingQuoteComplete("tx-missing-price", "2026-08-01")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovc-attention")).toBeTruthy());
    expect(screen.getByRole("link", { name: /Thiếu giá cho 1 mã/ }).getAttribute("href")).toBe("#/settings");
    // The heartbeat signal and the data-health issue are the same signal:
    // the price row appears exactly once, next to the unrelated backup row.
    const links = container.querySelectorAll(".ovc-attention a");
    expect(links).toHaveLength(2);
    expect(Array.from(links).filter((a) => /Thiếu giá cho 1 mã/.test(a.textContent ?? ""))).toHaveLength(1);
  });

  it("keeps a factual gain state in the hero without a second performance dashboard", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-gain", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([{ id: "quote-gain", instrumentIsin: "IE00BK5BQT80", currency: "EUR", price: 150, asOf: "2026-08-19", source: "manual", createdAt: TX_STAMP, updatedAt: TX_STAMP }]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovc-pnl-pct")?.textContent).toBe("+50,0%"));
    expect(container.querySelector(".ovc-pnl-pct")?.className).toContain("gain");
    expect(container.querySelector(".ovc-pnl")?.className).toContain("up");
    expect(container.querySelector(".perf-card")).toBeNull();
  });

  it("keeps a factual loss state in the hero without an inferred chart", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-loss", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([{ id: "quote-loss", instrumentIsin: "IE00BK5BQT80", currency: "EUR", price: 80, asOf: "2026-08-19", source: "manual", createdAt: TX_STAMP, updatedAt: TX_STAMP }]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovc-pnl-pct")?.textContent).toBe("-20,0%"));
    expect(container.querySelector(".ovc-pnl-pct")?.className).toContain("loss");
    expect(container.querySelector(".ovc-pnl")?.className).toContain("down");
    expect(container.querySelector(".perf-card")).toBeNull();
  });

  it("marks performance as unavailable instead of inventing gain or loss without a quote", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-unvalued", "2026-08-01")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovc-pnl-pct")?.textContent).toBe("Chưa định giá"));
    expect(container.querySelector(".ovc-pnl-pct")?.className).toContain("unavailable");
    expect(container.querySelector(".perf-card")).toBeNull();
  });

  it("shows a factual current price without adding a performance comparison chart", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-vwce-1", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([{ id: "quote-vwce", instrumentIsin: "IE00BK5BQT80", currency: "EUR", price: 110, asOf: "2026-08-19", source: "manual", createdAt: TX_STAMP, updatedAt: TX_STAMP }]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ovc-meta")).toBeTruthy());
    expect(container.querySelector(".ovc-price")?.textContent).toContain("110,00");
    expect(container.querySelector(".sparkline-svg")).toBeNull();
    expect(container.querySelector(".perf-card")).toBeNull();
  });

  it("preserves the valuation-incomplete label while retaining demo card geometry", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([
      cashIn("tx-cash-1", "2026-08-01", 1000),
      cashIn("tx-cash-2", "2026-08-02", 500),
      buyWithoutPrice("tx-buy-1", "2026-08-03"),
    ]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ov")).toBeTruthy());
    expect(screen.getByText("Tài sản đã định giá")).toBeTruthy();
    expect(container.querySelector(".ovc-pnl-pct")?.textContent?.trim()).toBe("Chưa định giá");
    expect(container.querySelector(".ovc-meta")).toBeTruthy();
    expect(container.querySelector(".ovc-plan-meta")).toBeTruthy();
  });
});
