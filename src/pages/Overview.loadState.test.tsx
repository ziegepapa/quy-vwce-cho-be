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
    expect(screen.getByText("Beitragsmonate")).toBeTruthy();
    expect(screen.getByText("Anteile")).toBeTruthy();
    expect(screen.getByText("Einzahlungsserie")).toBeTruthy();
    expect(screen.getAllByText("Nächste Rate").length).toBeGreaterThan(1);
    expect(screen.getByText("Portfolio-Performance")).toBeTruthy();
    expect(screen.getByText("Portfolio-Check")).toBeTruthy();
    expect(screen.getAllByText("Aufmerksamkeit").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Einzahlungen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Noch nicht bewertbar").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/tháng góp|Giá VWCE|Cập nhật|Cổ phần|Chuỗi góp|Gần nhất|Hiệu suất danh mục|Vốn góp|Lãi|Nhịp danh mục|Kỳ góp tiếp theo|Cần chú ý/);
  });
});

describe("Overview demo v10 hierarchy", () => {
  it("renders the complete five-block hierarchy with empty-state geometry", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".ov")).toBeTruthy());
    expect(container.querySelector(".gl.hero .hero-flex .hero-left .h-eye")).toBeTruthy();
    expect(container.querySelector(".gl.hero .hero-flex .hero-ring .hr-shell .hr-svg")).toBeTruthy();
    expect(container.querySelector(".gl.hero .hero-flex .hero-ring .hr-shell .hr-center")).toBeTruthy();
    expect(container.querySelector(".price-row .pr-left .pr-label")).toBeTruthy();
    expect(container.querySelector(".combo-row .cr-item .cr-lbl")).toBeTruthy();
    expect(container.querySelector(".streak-card .sc-top .sc-left")).toBeTruthy();
    expect(container.querySelector(".streak-card .sc-dots")).toBeTruthy();
    expect(container.querySelector(".heartbeat-card .heartbeat-grid")).toBeTruthy();
    expect(container.querySelector(".perf-card .perf-top")).toBeTruthy();
    expect(container.querySelector(".perf-card .perf-bar-track")).toBeTruthy();
    expect(container.querySelector(".perf-card .perf-legend")).toBeTruthy();
    expect(container.querySelector(".perf-card .perf-detail")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Thu gọn/ }).getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".cr-am")?.textContent).toContain("100,00");
    expect(container.querySelector(".cr-am")?.textContent).toContain("/th");
    expect(container.querySelector(".perf-card")?.getAttribute("data-performance-state")).toBe("unavailable");
    expect(container.querySelector(".perf-bar-gain")).toBeNull();
    expect(container.querySelector(".perf-bar-loss")).toBeNull();
    expect(container.querySelector(".sparkline-svg path")).toBeNull();
  });

  it("binds streak and portfolio values without inventing a PnL badge", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([cashIn("tx-cash-1", "2026-08-01", 1000)]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".hero")).toBeTruthy());
    expect(container.querySelector(".h-num")?.textContent?.trim()).not.toBe("");
    expect(container.querySelector(".h-row .bdg")?.textContent?.trim()).toBe("—");
    expect(container.querySelector(".hr-pct")?.textContent?.trim()).toBe("1");
    expect(container.querySelectorAll(".sc-dots .dot.done")).toHaveLength(1);
  });

  it("routes a data-quality attention signal to the existing transaction review workflow", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-quality", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([{ id: "quote-quality", instrumentIsin: "IE00BK5BQT80", currency: "EUR", price: 110, asOf: "2026-08-19", source: "manual", createdAt: TX_STAMP, updatedAt: TX_STAMP }]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".heartbeat-card")?.getAttribute("data-heartbeat-attention")).toBe("quality"));
    expect(screen.getByRole("link", { name: /1 giao dịch cần rà soát/ }).getAttribute("href")).toBe("#/transactions");
  });

  it("routes a missing-price attention signal to Settings when transaction data is complete", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyMissingQuoteComplete("tx-missing-price", "2026-08-01")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".heartbeat-card")?.getAttribute("data-heartbeat-attention")).toBe("missing_prices"));
    expect(screen.getByRole("link", { name: /1 mã thiếu giá/ }).getAttribute("href")).toBe("#/settings");
  });

  it("switches the performance card to a gain segment when the live quote exceeds the purchase cost", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-gain", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([{ id: "quote-gain", instrumentIsin: "IE00BK5BQT80", currency: "EUR", price: 150, asOf: "2026-08-19", source: "manual", createdAt: TX_STAMP, updatedAt: TX_STAMP }]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".perf-card")?.getAttribute("data-performance-state")).toBe("gain"));
    expect(container.querySelector(".perf-return")?.textContent).toBe("+50,0%");
    expect(container.querySelector(".perf-bar-base")?.getAttribute("style")).toContain("width: 66.666");
    expect(container.querySelector(".perf-bar-gain")?.getAttribute("style")).toContain("width: 33.333");
    expect(container.querySelector(".perf-bar-loss")).toBeNull();
    expect(screen.getAllByText("Lãi").length).toBeGreaterThan(0);
  });

  it("switches the performance card to a loss segment when the live quote falls below the purchase cost", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-loss", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([{ id: "quote-loss", instrumentIsin: "IE00BK5BQT80", currency: "EUR", price: 80, asOf: "2026-08-19", source: "manual", createdAt: TX_STAMP, updatedAt: TX_STAMP }]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".perf-card")?.getAttribute("data-performance-state")).toBe("loss"));
    expect(container.querySelector(".perf-return")?.textContent).toBe("-20,0%");
    expect(container.querySelector(".perf-bar-base")?.getAttribute("style")).toContain("width: 100%");
    expect(container.querySelector(".perf-bar-loss")?.getAttribute("style")).toContain("width: 20%");
    expect(container.querySelector(".perf-bar-gain")).toBeNull();
    expect(screen.getAllByText("Lỗ").length).toBeGreaterThan(0);
  });

  it("marks the performance as unavailable instead of inventing a gain or loss without a quote", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-unvalued", "2026-08-01")]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".perf-card")?.getAttribute("data-performance-state")).toBe("unavailable"));
    expect(container.querySelector(".perf-return")?.textContent).toBe("—");
    expect(container.querySelector(".perf-bar-base")).toBeNull();
    expect(container.querySelector(".perf-bar-gain")).toBeNull();
    expect(container.querySelector(".perf-bar-loss")).toBeNull();
    expect(screen.getAllByText("Chưa định giá").length).toBeGreaterThan(0);
  });

  it("draws the compact price comparison only when current price and average buy price are both real", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([buyVwce("tx-vwce-1", "2026-08-01")]);
    dbMocks.listQuotes.mockResolvedValue([{ id: "quote-vwce", instrumentIsin: "IE00BK5BQT80", currency: "EUR", price: 110, asOf: "2026-08-19", source: "manual", createdAt: TX_STAMP, updatedAt: TX_STAMP }]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".price-row")).toBeTruthy());
    expect(container.querySelector(".sparkline-svg path")).toBeTruthy();
    expect(container.querySelector(".pr-big")?.textContent).toContain("110,00");
    expect(container.querySelector(".perf-detail")?.textContent).toContain("Giá mua TB100,00");
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
    expect(container.querySelector(".perf-card .perf-return")?.textContent?.trim()).toBe("—");
    expect(container.querySelector(".price-row")).toBeTruthy();
    expect(container.querySelector(".combo-row")).toBeTruthy();
  });
});
