// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultSettings } from "../lib/defaults";

const dbMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  listGoals: vi.fn(),
  listQuotes: vi.fn(),
  listTransactions: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);

import Simulation from "./Simulation";

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.listGoals.mockResolvedValue([]);
  dbMocks.listQuotes.mockResolvedValue([]);
  dbMocks.listTransactions.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe("Simulation load state", () => {
  it("announces that the snapshot is busy while local data is loading", () => {
    dbMocks.getSettings.mockReturnValue(new Promise(() => undefined));
    render(createElement(Simulation));

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Đang tải dữ liệu mô phỏng…")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "What-if" })).toBeNull();
  });

  it("shows a fail-closed error and retries the complete snapshot", async () => {
    dbMocks.getSettings
      .mockRejectedValueOnce(new Error("IndexedDB unavailable"))
      .mockResolvedValueOnce(defaultSettings());
    render(createElement(Simulation));

    expect(
      await screen.findByRole("heading", { name: "Không tải được What-if" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "What-if" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(await screen.findByRole("heading", { name: "What-if" })).toBeTruthy();
    expect(dbMocks.getSettings).toHaveBeenCalledTimes(2);
    expect(dbMocks.listTransactions).toHaveBeenCalledTimes(2);
  });
});
