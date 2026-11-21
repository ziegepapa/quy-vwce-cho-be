// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Goal } from "../lib/types";
import ExitPlanSection from "./ExitPlanSection";

const TEST_GOAL: Goal = {
  id: "goal-a", name: "Studium", dueDate: "2048-10-28",
  amount: 20000, mode: "purchasing_power", baseYear: 2026,
  inflationRate: 0.02, bufferPct: 0.10, urgency: "hard",
  protectedAmount: 250, notes: "", createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

afterEach(() => cleanup());

describe("Exit Plan owner-only controls", () => {
  it("keeps the German screen empty until a Goal is actively chosen", () => {
    render(<ExitPlanSection goals={[TEST_GOAL]} locale="de" />);
    expect(screen.getByText("Auszahlungsplan")).toBeTruthy();
    expect(screen.getByText("Noch kein Ziel ausgewählt")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect((screen.getByLabelText("Selbst gewählter Modellbetrag in EUR") as HTMLInputElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain("2042");
    expect(document.body.textContent).not.toContain("2050");
  });

  it("cannot synthesize money from selected Goal or its protectedAmount", () => {
    render(<ExitPlanSection goals={[TEST_GOAL]} locale="de" />);
    fireEvent.change(screen.getByLabelText("Mein Ziel"), { target: { value: "goal-a" } });
    expect(screen.getByText(/20.000,00/)).toBeTruthy();
    expect(screen.getByText(/250,00/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect((screen.getByLabelText("Selbst gewählter Modellbetrag in EUR") as HTMLInputElement).value).toBe("");
  });

  it("creates a mathematical schedule ONLY after entering an amount; changing the Goal clears it", () => {
    const otherGoal: Goal = { ...TEST_GOAL, id: "goal-b", name: "Später", dueDate: "2049-06-30" };
    render(<ExitPlanSection goals={[TEST_GOAL, otherGoal]} locale="de" />);
    fireEvent.change(screen.getByLabelText("Mein Ziel"), { target: { value: "goal-a" } });
    fireEvent.change(screen.getByLabelText("Selbst gewählter Modellbetrag in EUR"), { target: { value: "100,01" } });
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(7);
    expect(screen.getByText("0,00 €")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Mein Ziel"), { target: { value: "goal-b" } });
    expect(screen.queryByRole("table")).toBeNull();
    expect((screen.getByLabelText("Selbst gewählter Modellbetrag in EUR") as HTMLInputElement).value).toBe("");
  });

  it("never offers a past Goal as a sale date; switches to Vietnamese without tax computation", () => {
    const old: Goal = { ...TEST_GOAL, id: "old", dueDate: "2020-01-01" };
    render(<ExitPlanSection goals={[old]} locale="vi" />);
    expect(screen.getByText("Kế hoạch sử dụng tiền")).toBeTruthy();
    expect(screen.queryByRole("option", { name: /2020/ })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.body.textContent).toContain("Không tính thuế cá nhân");
  });
});
