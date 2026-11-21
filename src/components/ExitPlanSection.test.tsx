// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Goal } from "../lib/types";
import ExitPlanSection from "./ExitPlanSection";

const GOAL: Goal = {
  id: "fixture-goal", name: "Studium", dueDate: "2048-10-28",
  amount: 27200, mode: "nominal", baseYear: 2026,
  inflationRate: 0.02, bufferPct: 0.1, urgency: "hard",
  protectedAmount: 230, notes: "", createdAt: "2026-01-01", updatedAt: "2026-01-01",
};
const renderPlan = (goals: Goal[] = [GOAL], locale: "de" | "vi" = "de", balance = 2200, contribution = 300) =>
  render(<ExitPlanSection goals={goals} locale={locale} actualBalance={balance} actualMonthly={contribution} />);
afterEach(cleanup);

describe("Exit Plan plain-language presentation", () => {
  it("reads actual balance and monthly savings, not a hardcoded portfolio amount", () => {
    renderPlan();
    expect(screen.getByText(/2.200,00/)).toBeTruthy();
    expect(screen.getAllByText(/300,00/).length).toBeGreaterThan(0);
    expect(screen.getByText("Ihr Plan, einfach erklärt")).toBeTruthy();
    expect(screen.getByText("Noch kein Ziel gewählt")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.body.textContent).not.toContain("2042");
    expect(document.body.textContent).not.toContain("2050");
  });
  it("calculates a milestone year from the supplied data, not the Goal's due date", () => {
    renderPlan();
    fireEvent.change(screen.getByLabelText("Welches Ziel soll hier stehen?"), { target: { value: GOAL.id } });
    const expected = new Date().getFullYear() + Math.ceil((GOAL.amount - 2200) / (300 * 12));
    expect(document.body.textContent).toContain(String(expected));
    expect(document.body.textContent).toContain("ohne Kursschwankungen");
    expect(screen.getAllByText(/27.200,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/230,00/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("never assumes a quote, monthly payment or target if an input is unavailable", () => {
    const { rerender } = render(
      <ExitPlanSection goals={[GOAL]} locale="de" actualBalance={null} actualMonthly={null}/>,
    );
    fireEvent.change(screen.getByLabelText("Welches Ziel soll hier stehen?"), { target: { value: GOAL.id } });
    expect(document.body.textContent).toContain("Der aktuelle Wert ist noch nicht sicher bekannt.");
    expect(document.body.textContent).toContain("Die monatliche Sparrate ist noch nicht hinterlegt.");
    expect(document.body.textContent).toContain("Ein ungefähres Jahr ist");
    rerender(<ExitPlanSection goals={[GOAL]} locale="de" actualBalance={Infinity} actualMonthly={0}/>);
    expect(document.body.textContent).not.toContain("Infinity");
  });
  it("shows the 3 plain-language moments, no old glide-path or tax card", () => {
    renderPlan();
    fireEvent.change(screen.getByLabelText("Welches Ziel soll hier stehen?"), { target: { value: GOAL.id } });
    expect(document.querySelectorAll(".exit-plan-steps > li")).toHaveLength(3);
    expect(screen.getByText("Geld, das Sie bald brauchen, kann zum Beispiel auf einem verzinsten Tagesgeldkonto auf seinen Einsatz warten.")).toBeTruthy();
    expect(document.body.textContent).toContain("Heute müssen Sie nichts verkaufen");
    expect(document.body.textContent).not.toContain("Teilfreistellung");
    expect(document.body.textContent).not.toContain("Szenariovergleich");
    expect(screen.getByRole("link", { name: "Simulation ansehen" }).getAttribute("href")).toBe("#/simulation");
  });
  it("only shows a sample table when the owner enters the sample, right below its input", () => {
    renderPlan();
    fireEvent.change(screen.getByLabelText("Welches Ziel soll hier stehen?"), { target: { value: GOAL.id } });
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.change(screen.getByLabelText("Welchen Beispielbetrag möchten Sie aufteilen?"), { target: { value: "123,01" } });
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(7);
    expect(screen.getByRole("columnheader", { name: "In diesem Schritt verkaufen" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Noch nicht verkauft" })).toBeTruthy();
    expect(screen.getByText("0,00 €")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Welches Ziel soll hier stehen?"), { target: { value: "" } });
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("speaks Vietnamese in the same simple tone and never changes the Goal record", () => {
    const original = JSON.stringify(GOAL);
    renderPlan([GOAL], "vi");
    fireEvent.change(screen.getByLabelText("Bạn muốn xem mốc nào?"), { target: { value: GOAL.id } });
    expect(screen.getByRole("heading", { name: "Khi nào cần dùng tiền?" })).toBeTruthy();
    expect(document.body.textContent).toContain("ống heo");
    expect(screen.getByText("Đây là mốc bạn đặt, không phải lệnh bán.")).toBeTruthy();
    expect(screen.getByText("Số mẫu — không phải tiền thật của bạn")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Xem mô phỏng" })).toBeTruthy();
    expect(JSON.stringify(GOAL)).toBe(original);
  });
  it("labels the purchasing-power goal comparison as ignoring future inflation", () => {
    const inflated: Goal = { ...GOAL, mode: "purchasing_power" };
    renderPlan([inflated]);
    fireEvent.change(screen.getByLabelText("Welches Ziel soll hier stehen?"), { target: { value: GOAL.id } });
    expect(document.body.textContent).toContain("nicht um künftige Inflation erhöht");
  });
});
