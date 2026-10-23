// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SimulationDemoShell, { type SimulationDemoShellProps } from "./SimulationDemoShell";

const noop = vi.fn();

function renderShell(locale: "vi" | "de", startingBalanceWarning = "", shownInterest = 0, targetUnreachable = false, planChanged = false, mode: "A" | "B" | "C" = "A") {
  const props: SimulationDemoShellProps = {
    locale,
    mode,
    setMode: noop,
    planUnreachable: false,
    targetUnreachable,
    headlineValue: mode === "B" ? 200 : mode === "C" ? 15 : 1000,
    yearsForProject: 15,
    monthlyForProject: 200,
    headlineNote: locale === "de"
      ? mode === "B" ? "erforderlicher Monatsbeitrag" : mode === "C" ? "benötigte Zeit bis zum Ziel" : "nominal"
      : mode === "B" ? "mức góp hằng tháng cần thiết" : mode === "C" ? "thời gian cần để đạt mục tiêu" : "danh nghĩa",
    startingBalanceWarning,
    primary: undefined,
    initialBalance: 0,
    shownInterest,
    results: [
      { sc: { id: "cautious", label: locale === "de" ? "Vorsichtig" : "Thận trọng", rate: -0.02 }, out: { yearEnds: [], terminal: 800, contributed: 900, interest: -100 } },
      { sc: { id: "base", label: locale === "de" ? "Basis" : "Cơ sở", rate: 0.06 }, out: { yearEnds: [], terminal: 1200, contributed: 900, interest: 300 } },
      { sc: { id: "bull", label: locale === "de" ? "Günstig" : "Thuận lợi", rate: 0.1 }, out: { yearEnds: [], terminal: 1600, contributed: 900, interest: 700 } },
    ],
    goalMarkers: [],
    band: 0,
    baseRate: 0.06,
    monthly: "200",
    setMonthly: noop,
    years: 15,
    setYears: noop,
    targetAmount: "50000",
    setTargetAmount: noop,
    targetYear: "2042",
    setTargetYear: noop,
    yearsB: 15,
    requiredMonthlyBase: 0,
    yearsC: { years: 15, reached: true },
    rateInput: "6",
    setRateInput: noop,
    bandPctLabel: "",
    readOnly: false,
    goals: [],
    applyYearsFromGoal: noop,
    advSummary: locale === "de" ? "Erweiterte Optionen" : "Tùy chọn nâng cao",
    bandInput: "0",
    setBandInput: noop,
    growthOn: false,
    setGrowthOn: noop,
    growthPct: "0",
    setGrowthPct: noop,
    lumpSum: "0",
    setLumpSum: noop,
    balanceOverride: "",
    setBalanceOverride: noop,
    realBalance: 0,
    inflationOn: false,
    setInflationOn: noop,
    inflationPct: "0",
    setInflationPct: noop,
    showPP: false,
    setShowPP: noop,
    yearRows: [],
    baseMap: new Map(),
    cautiousMap: new Map(),
    bullMap: new Map(),
    goalYearSet: new Set(),
    goalNameByYear: new Map(),
    nowY: 2026,
    showAllYears: false,
    setShowAllYears: noop,
    openSaveConfirm: noop,
    matchMsg: false,
    undoVisible: false,
    undoSnap: null,
    undoPersist: noop,
    saveOpen: false,
    setSaveOpen: noop,
    y1Diff: planChanged,
    y2Diff: false,
    retDiff: false,
    writeY1: false,
    setWriteY1: noop,
    writeY2: false,
    setWriteY2: noop,
    writeReturn: false,
    setWriteReturn: noop,
    monthlyForProjectRounded: 200,
    oldY1: 200,
    oldY2: 200,
    oldVwce: 0.06,
    baseRateNew: 0.06,
    selectedCount: 0,
    saveLabel: "Save",
    confirmPersist: noop,
    round2: (value) => value,
  };
  return render(createElement(SimulationDemoShell, props));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SimulationDemoShell financial-policy containment", () => {
  it("does not render Vietnamese German-tax controls or after-tax results", () => {
    renderShell("vi");
    expect(screen.queryByText(/Thuế DE|sau thuế|có thuế/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/DE-Steuern|afterTax|after-tax/i);
  });

  it("uses localized descriptive subtitles instead of English mode labels", () => {
    renderShell("vi");
    expect(screen.getByText("Số dư → Kết quả")).toBeTruthy();
    expect(screen.getByText("Số tiền → Mức góp")).toBeTruthy();
    cleanup();
    renderShell("de");
    expect(screen.getByText("Startwert → Ergebnis")).toBeTruthy();
    expect(screen.getByText("Zielbetrag → Monatsrate")).toBeTruthy();
  });

  it("shows the 40-year projection while disclosing that the target is unreachable", () => {
    renderShell("vi", "", 0, true);
    expect(screen.getByRole("status").textContent).toContain("Chưa thể đạt mục tiêu trong 40 năm");
    expect(document.querySelector(".sh-big")?.textContent).not.toBe("—");
  });

  it("compares three nominal scenarios and labels them as assumptions, not forecasts", () => {
    renderShell("vi");
    expect(screen.getByRole("heading", { name: "So sánh kịch bản" })).toBeTruthy();
    expect(screen.getByText("Thận trọng")).toBeTruthy();
    expect(screen.getAllByText("Cơ sở")).toHaveLength(2);
    expect(screen.getByText("Thuận lợi")).toBeTruthy();
    expect(document.querySelectorAll(".scenario-chip")).toHaveLength(3);
    expect(document.querySelectorAll(".scenario-card")).toHaveLength(0);
    expect(screen.getByText(/không phải xác suất hay dự báo/i)).toBeTruthy();
    cleanup();
    renderShell("de");
    expect(screen.getByRole("heading", { name: "Szenariovergleich" })).toBeTruthy();
    expect(document.querySelectorAll(".scenario-chip")).toHaveLength(3);
    expect(document.querySelectorAll(".scenario-card")).toHaveLength(0);
  });

  it("applies theme-aware premium presentation classes to the live Simulation route", () => {
    const { container } = renderShell("vi");
    expect(container.querySelector(".sim-screen")).toBeTruthy();
    expect(container.querySelector(".sim-headline .sim-mode-badge")).toBeTruthy();
    expect(container.querySelectorAll(".scenario-chip")).toHaveLength(3);
    expect(container.querySelector(".scenario-chip-cautious")).toBeTruthy();
    expect(container.querySelector(".scenario-chip-base")).toBeTruthy();
    expect(container.querySelector(".scenario-chip-bull")).toBeTruthy();
    const majorSections = Array.from(container.querySelectorAll(".sim-headline, .sim-chart-card, .mode-tabs")).map((element) => {
      if (element.classList.contains("sim-headline")) return "hero";
      if (element.classList.contains("sim-chart-card")) return "chart";
      return "modes";
    });
    expect(majorSections).toEqual(["hero", "chart", "modes"]);
    expect(container.querySelector(".sim-sheet-backdrop")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Điều chỉnh giả định" }));
    expect(container.querySelector(".sim-sheet-panel")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Điều chỉnh giả định" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(container.querySelector(".sim-sheet-backdrop")).toBeNull();
    cleanup();
    const german = renderShell("de");
    expect(german.container.querySelector(".sim-screen")).toBeTruthy();
    expect(german.container.querySelectorAll(".scenario-chip")).toHaveLength(3);
  });

  it("shows the mode-specific hero metric without duplicating it in the secondary strip", () => {
    const { container } = renderShell("vi", "", 0, false, false, "B");
    expect(container.querySelector(".sim-mode-badge")?.textContent).toContain("Chế độ B");
    expect(container.querySelector(".sim-headline .sh-big")?.textContent).toContain("200");
    expect(container.querySelector(".sim-headline .sh-sub")?.textContent).toContain("2042");
    expect(container.querySelectorAll(".summary-strip > span")).toHaveLength(2);
    cleanup();
    const timeResult = renderShell("de", "", 0, true, false, "C");
    expect(timeResult.container.querySelector(".sim-mode-badge")?.textContent).toContain("Modus C");
    expect(timeResult.container.querySelector(".sim-headline .sh-big")?.textContent).toContain("15");
    expect(timeResult.container.querySelector(".sim-headline .sh-big")?.textContent).toContain("Jahre");
  });

  it("keeps a projected loss visible as a loss", () => {
    renderShell("vi", "", -125);
    expect(document.querySelector(".summary-strip .loss")).not.toBeNull();
  });

  it("discloses when the starting balance excludes unpriced holdings", () => {
    renderShell("vi", "Giá trị đầu kỳ chưa đầy đủ: VALL chưa có giá dùng được.");
    expect(screen.getByRole("status").textContent).toContain("VALL");
  });

  it("associates Vietnamese controls with labels and exposes accurate control semantics", () => {
    renderShell("vi");
    expect(screen.queryByLabelText("Góp mỗi tháng (EUR)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Điều chỉnh giả định" }));
    expect(screen.getByLabelText("Góp mỗi tháng (EUR)")).toBeTruthy();
    expect(screen.getByLabelText("Lợi nhuận / năm (%)")).toBeTruthy();
    expect(screen.getByLabelText("Thời hạn")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Mô phỏng" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Tóm tắt kết quả mô phỏng" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Góp → Nhận/ }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".sim-year-disclosure")?.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByText("Bảng mô phỏng theo năm"));
    expect(screen.getByRole("table", { name: "Bảng mô phỏng theo năm" })).toBeTruthy();
    expect(document.querySelectorAll(".scenario-card")).toHaveLength(3);
    expect(document.querySelector(".sim-year-disclosure")?.hasAttribute("open")).toBe(true);
    expect(document.querySelector(".sim-chart-svg")?.textContent).toContain("15 năm");
  });

  it("associates German controls with labels and localizes chart duration", () => {
    renderShell("de");
    expect(screen.queryByLabelText("Monatlicher Beitrag (EUR)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Annahmen anpassen" }));
    expect(screen.getByLabelText("Monatlicher Beitrag (EUR)")).toBeTruthy();
    expect(screen.getByLabelText("Rendite / Jahr (%)")).toBeTruthy();
    expect(screen.getByLabelText("Laufzeit")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Simulation" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Simulationsergebnis" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Einzahlen → Ergebnis/ }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".sim-year-disclosure")?.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByText("Jährliche Projektion"));
    expect(screen.getByRole("table", { name: "Jährliche Projektion" })).toBeTruthy();
    expect(document.querySelectorAll(".scenario-chip")).toHaveLength(3);
    expect(document.querySelector(".sim-chart-svg")?.textContent).toContain("15 Jahre");
  });

  it("keeps advanced options collapsed and shows the save CTA only when the plan differs", () => {
    renderShell("vi");
    expect(screen.queryByRole("button", { name: "Lưu mức góp & lợi nhuận cơ sở vào kế hoạch" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Điều chỉnh giả định" }));
    const details = document.querySelector("details.gl:not(.sim-year-disclosure)") as HTMLDetailsElement | null;
    expect(details?.open).toBe(false);
    expect(screen.queryByRole("button", { name: "Lưu mức góp & lợi nhuận cơ sở vào kế hoạch" })).toBeNull();

    cleanup();
    renderShell("vi", "", 0, false, true);
    const save = screen.getByRole("button", { name: "Lưu mức góp & lợi nhuận cơ sở vào kế hoạch" });
    fireEvent.click(save);
    expect(noop).toHaveBeenCalled();
  });

  it("does not render German tax controls or after-tax results", () => {
    renderShell("de");
    expect(screen.queryByText(/DE-Steuern|nach Steuern|mit Steuern/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Thuế DE|afterTax|after-tax/i);
  });
});
