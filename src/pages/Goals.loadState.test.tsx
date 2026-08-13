// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const dbMocks = vi.hoisted(() => ({
  deleteGoal: vi.fn(),
  listGoals: vi.fn(),
  uid: vi.fn(() => "goal-new"),
  upsertGoal: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/navActions", () => ({ useNavAction: vi.fn() }));
vi.mock("../lib/recoveryReadOnly", () => ({
  useRecoveryReadOnly: () => ({ readOnly: false, showBlocked: vi.fn() }),
}));
vi.mock("../components/ActionMenu", () => ({ default: () => null }));

import Goals from "./Goals";

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.deleteGoal.mockResolvedValue(undefined);
  dbMocks.upsertGoal.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("Goals load state", () => {
  it("does not show zero totals or an empty state before the read completes", () => {
    dbMocks.listGoals.mockReturnValue(new Promise(() => undefined));
    render(createElement(Goals));

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Đang tải mục tiêu…")).toBeTruthy();
    expect(screen.queryByText("Chưa có mục tiêu.")).toBeNull();
    expect(screen.queryByText("Còn thiếu")).toBeNull();
  });

  it("shows a fail-closed error and retries the read", async () => {
    dbMocks.listGoals
      .mockRejectedValueOnce(new Error("IndexedDB unavailable"))
      .mockResolvedValueOnce([]);
    render(createElement(Goals));

    expect(
      await screen.findByRole("heading", { name: "Không tải được Mục tiêu" }),
    ).toBeTruthy();
    expect(screen.queryByText("Chưa có mục tiêu.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(await screen.findByText("Chưa có mục tiêu.")).toBeTruthy();
    expect(dbMocks.listGoals).toHaveBeenCalledTimes(2);
  });
});
