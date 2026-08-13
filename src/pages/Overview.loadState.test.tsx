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
vi.mock("../components/TraceSheet", () => ({ default: () => null }));
vi.mock("../components/RhythmHero", () => ({
  default: () => createElement("div", { "data-testid": "rhythm-hero" }),
}));
vi.mock("../components/PlanPhaseCard", () => ({ default: () => null }));

import Overview from "./Overview";

function renderOverview() {
  return render(
    createElement(MemoryRouter, null, createElement(Overview)),
  );
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
  it("announces that the overview is busy while local data is loading", () => {
    dbMocks.getSettings.mockReturnValue(new Promise(() => undefined));

    renderOverview();

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Đang tải dữ liệu Tổng quan…")).toBeTruthy();
    expect(screen.queryByText(/Không phải tư vấn đầu tư/)).toBeNull();
  });

  it("shows a fail-closed error and retries the complete read", async () => {
    dbMocks.getSettings
      .mockRejectedValueOnce(new Error("IndexedDB unavailable"))
      .mockResolvedValueOnce(defaultSettings());

    renderOverview();

    expect(
      await screen.findByRole("heading", { name: "Không tải được Tổng quan" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("rhythm-hero")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(await screen.findByTestId("rhythm-hero")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(dbMocks.getSettings).toHaveBeenCalledTimes(2);
    expect(dbMocks.listTransactions).toHaveBeenCalledTimes(2);
  });
});
