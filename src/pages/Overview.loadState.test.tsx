// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { defaultSettings } from "../lib/defaults";

const dbMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  listGoals: vi.fn(),
  listInstruments: vi.fn(),
  listQuotes: vi.fn(),
  listTransactions: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../components/TodayCenter", () => ({ default: () => null }));
vi.mock("../components/TraceSheet", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? createElement("div", { "data-testid": "trace-sheet" }) : null,
}));
vi.mock("../components/PlanPhaseCard", () => ({ default: () => null }));

import Overview from "./Overview";

function renderOverview() {
  return render(
    createElement(MemoryRouter, null, createElement(Overview)),
  );
}

const TX_STAMP = "2026-08-01T00:00:00.000Z";
const MISSING_PRICE_ISIN = "IE00B5BMR087";

function cashIn(id: string, date: string, amount: number) {
  return {
    id,
    date,
    type: "cash_in",
    amount,
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

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.listGoals.mockResolvedValue([]);
  dbMocks.listInstruments.mockResolvedValue([]);
  dbMocks.listQuotes.mockResolvedValue([]);
  dbMocks.listTransactions.mockResolvedValue([]);
  dbMocks.saveSettings.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("Overview load state", () => {
  it("announces that the overview is busy while local data is loading", async () => {
    let resolveSettings: (value: unknown) => void = () => {};
    const settingsPromise = new Promise((resolve) => {
      resolveSettings = resolve;
    });
    dbMocks.getSettings.mockReturnValue(settingsPromise);

    renderOverview();

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Đang tải dữ liệu Tổng quan…")).toBeTruthy();
    expect(screen.queryByText(/Không phải tư vấn đầu tư/)).toBeNull();

    resolveSettings(defaultSettings());
    await waitFor(() => expect(status.getAttribute("aria-busy")).not.toBe("true"));
  });

  it("shows a local retry path when the overview cannot load", async () => {
    dbMocks.getSettings.mockRejectedValueOnce(new Error("indexeddb offline"));
    dbMocks.getSettings.mockResolvedValue(defaultSettings());

    renderOverview();

    expect(
      await screen.findByRole("heading", { name: "Không tải được Tổng quan" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.querySelector(".v10-hero-flex")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(() => expect(document.querySelector(".v10-hero--empty")).toBeTruthy());
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(dbMocks.getSettings).toHaveBeenCalledTimes(2);
    expect(dbMocks.listTransactions).toHaveBeenCalledTimes(2);
  });
});

describe("Overview v10 pixel fold — fail-closed", () => {
  it("mode empty: không render NAV, PnL hoặc ring giả", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".v10-hero--empty")).toBeTruthy());
    expect(container.querySelector(".v10-hero-flex")).toBeNull();
    expect(container.querySelector(".v10-h-num")).toBeNull();
    expect(container.querySelector(".v10-ring-only")).toBeNull();
    expect(container.querySelector(".v10-price")).toBeNull();
    expect(container.querySelector(".v10-combo")).toBeNull();
    expect(container.querySelector(".v10-streak")).toBeNull();
    expect(container.querySelector(".v10-perf")).toBeNull();
  });

  it("hero.pnl == null: NAV vẫn hiện, PnL badge không render", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([
      cashIn("tx-cash-1", "2026-08-01", 1000),
    ]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".v10-ring-only")).toBeTruthy());
    const left = container.querySelector(".v10-hero-left");
    expect(left).toBeTruthy();
    const value = container.querySelector(".v10-h-num");
    expect(value).toBeTruthy();
    expect((value?.textContent ?? "").trim()).not.toBe("");
    expect(container.querySelector(".v10-bdg")).toBeNull();
    expect(left?.textContent ?? "").not.toContain("%");
    expect(screen.getByText("Tổng tài sản")).toBeTruthy();
    expect(screen.getByText("Chưa giữ đơn vị nào")).toBeTruthy();
  });

  it("mode active: NAV mở TraceSheet và ring giữ aria-label streak", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listTransactions.mockResolvedValue([
      cashIn("tx-cash-1", "2026-08-01", 1000),
      cashIn("tx-cash-2", "2026-08-02", 500),
      cashIn("tx-cash-3", "2026-08-03", 250),
    ]);

    const { container } = renderOverview();

    const navButton = await waitFor(() => {
      const button = container.querySelector("button.v10-h-num-btn");
      expect(button).toBeTruthy();
      return button as HTMLButtonElement;
    });
    expect(container.querySelector('svg[aria-label="1 tháng liên tiếp"]')).toBeTruthy();
    expect(container.querySelector(".v10-hero-flex")).toBeTruthy();
    expect(container.querySelector(".v10-hero-flex .v10-hero-left")).toBeTruthy();
    expect(container.querySelector(".v10-hero-flex .v10-ring-only")).toBeTruthy();
    expect(container.querySelector(".v10-hero-flex .rhythm-body")).toBeNull();
    expect(container.querySelector(".v10-streak")).toBeTruthy();
    expect(container.querySelector(".v10-price")).toBeNull();
    expect(container.querySelector(".v10-combo")).toBeNull();
    expect(container.querySelector(".v10-perf")).toBeNull();

    fireEvent.click(navButton);

    expect(await screen.findByTestId("trace-sheet")).toBeTruthy();
  });

  it("!valueComplete: đổi label, ẩn phần trăm, nêu lý do không tính được lãi–lỗ", async () => {
    dbMocks.getSettings.mockResolvedValue(defaultSettings());
    dbMocks.listQuotes.mockResolvedValue([]);
    dbMocks.listTransactions.mockResolvedValue([
      cashIn("tx-cash-1", "2026-08-01", 1000),
      cashIn("tx-cash-2", "2026-08-02", 500),
      buyWithoutPrice("tx-buy-1", "2026-08-03"),
    ]);

    const { container } = renderOverview();

    await waitFor(() => expect(container.querySelector(".v10-ring-only")).toBeTruthy());
    expect(screen.getByText("Tài sản đã định giá")).toBeTruthy();
    expect(container.querySelector(".v10-bdg")).toBeNull();
    expect(container.querySelector(".v10-hero-left")?.textContent ?? "").not.toContain("%");
    expect(screen.getByText("Chưa có giá cho mã này")).toBeTruthy();
    expect(container.querySelector(".v10-perf")).toBeNull();
  });
});
