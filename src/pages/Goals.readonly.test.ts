// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RECOVERY_READONLY_MESSAGE, RecoveryReadOnlyProvider } from "../lib/recoveryReadOnly";

const dbMocks = vi.hoisted(() => ({
  listGoals: vi.fn(),
  upsertGoal: vi.fn(),
  deleteGoal: vi.fn(),
  uid: vi.fn(() => "goal-new"),
}));
vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/navActions", () => ({ useNavAction: () => undefined }));
vi.mock("../components/ActionMenu", async () => {
  const React = await import("react");
  return {
    default: ({ actions }: { actions: { label: string; onClick: () => void }[] }) =>
      React.createElement(
        "div",
        null,
        actions.map((action, index) =>
          React.createElement(
            "button",
            { key: index, type: "button", onClick: action.onClick },
            action.label,
          ),
        ),
      ),
  };
});

import Goals from "./Goals";

const GOAL = {
  id: "goal-1",
  name: "Mục tiêu học phí",
  dueDate: "2038-06-30",
  amount: 10000,
  mode: "purchasing_power",
  baseYear: 2026,
  inflationRate: 0.02,
  bufferPct: 0.1,
  urgency: "hard",
  protectedAmount: 0,
  notes: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderGoals(readOnly: boolean) {
  return render(
    createElement(RecoveryReadOnlyProvider, { readOnly }, createElement(Goals)),
  );
}

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.listGoals.mockResolvedValue([GOAL]);
  dbMocks.upsertGoal.mockResolvedValue(undefined);
  dbMocks.deleteGoal.mockResolvedValue(undefined);
});

describe("Goals read-only recovery mode", () => {
  it("keeps existing goals visible", async () => {
    renderGoals(true);
    expect(await screen.findByText("Mục tiêu học phí")).toBeTruthy();
  });

  it("intercepts edit with the recovery message and does not write", async () => {
    renderGoals(true);
    await screen.findByText("Mục tiêu học phí");
    fireEvent.click(screen.getByRole("button", { name: "Sửa" }));
    expect(await screen.findByText(RECOVERY_READONLY_MESSAGE)).toBeTruthy();
    expect(screen.queryByText("Sửa mục tiêu")).toBeNull();
    expect(dbMocks.upsertGoal).not.toHaveBeenCalled();
  });

  it("intercepts delete and never removes local data", async () => {
    renderGoals(true);
    await screen.findByText("Mục tiêu học phí");
    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    expect(await screen.findByText(RECOVERY_READONLY_MESSAGE)).toBeTruthy();
    expect(dbMocks.deleteGoal).not.toHaveBeenCalled();
    expect(screen.getByText("Mục tiêu học phí")).toBeTruthy();
  });

  it("does not surface raw backend errors", async () => {
    renderGoals(true);
    await screen.findByText("Mục tiêu học phí");
    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    await screen.findByText(RECOVERY_READONLY_MESSAGE);
    expect(document.body.textContent ?? "").not.toContain("Dexie");
    expect(document.body.textContent ?? "").not.toContain("undefined");
  });

  it("allows writes when not in recovery read-only mode", async () => {
    renderGoals(false);
    await screen.findByText("Mục tiêu học phí");
    fireEvent.click(screen.getByRole("button", { name: "Sửa" }));
    expect(await screen.findByText("Sửa mục tiêu")).toBeTruthy();
    expect(screen.queryByText(RECOVERY_READONLY_MESSAGE)).toBeNull();
  });
});
