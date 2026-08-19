// @vitest-environment jsdom

import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { defaultSettings } from "../lib/defaults";

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

const TX_STAMP = "2026-08-01T00:00:00.000Z";
const MISSING_PRICE_ISIN = "IE00B5BMR087";

function cashIn(id: string, date: string, amount: number) {
  return { id, date, type: "cash_in", amount, notes: "", createdAt: TX_STAMP, updatedAt: TX_STAMP };
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

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.listQuotes.mockResolvedValue([]);
  dbMocks.listTransactions.mockResolvedValue([]);
});

afterEach(() => cleanup());

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
    expect(container.querySelector(".perf-card .perf-top")).toBeTruthy();
    expect(container.querySelector(".perf-card .perf-bar-track")).toBeTruthy();
    expect(container.querySelector(".perf-card .perf-legend")).toBeTruthy();
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
