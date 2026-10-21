// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SimulationDemoShell, { type SimulationDemoShellProps } from "./SimulationDemoShell";

const noop = vi.fn();

function renderShell(locale: "vi" | "de", startingBalanceWarning = "", shownInterest = 0, targetUnreachable = false) {
  const props: SimulationDemoShellProps = {
    locale,
    mode: "A",
    setMode: noop,
    planUnreachable: false,
    targetUnreachable,
    headlineValue: 1000,
    yearsForProject: 15,
    monthlyForProject: 200,
    headlineNote: "nominal",
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
    advSummary: "Erweiterte Optionen",
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
    y1Diff: false,
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
    expect(screen.getAllByText("Giá trị cuối kỳ danh nghĩa")).toHaveLength(3);
    expect(screen.getByText(/không phải xác suất hay dự báo/i)).toBeTruthy();
    cleanup();
    renderShell("de");
    expect(screen.getByRole("heading", { name: "Szenariovergleich" })).toBeTruthy();
    expect(screen.getAllByText("Endwert nominal")).toHaveLength(3);
  });

  it("keeps a projected loss visible as a loss", () => {
    renderShell("vi", "", -125);
    expect(document.querySelector(".summary-strip .loss")).not.toBeNull();
  });

  it("discloses when the starting balance excludes unpriced holdings", () => {
    renderShell("vi", "Giá trị đầu kỳ chưa đầy đủ: VALL chưa có giá dùng được.");
    expect(screen.getByRole("status").textContent).toContain("VALL");
  });

  it("does not render German tax controls or after-tax results", () => {
    renderShell("de");
    expect(screen.queryByText(/DE-Steuern|nach Steuern|mit Steuern/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Thuế DE|afterTax|after-tax/i);
  });
});
