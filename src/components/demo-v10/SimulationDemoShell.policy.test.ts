// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SimulationDemoShell, { type SimulationDemoShellProps } from "./SimulationDemoShell";

const noop = vi.fn();

function renderShell(locale: "vi" | "de") {
  const props: SimulationDemoShellProps = {
    locale,
    mode: "A",
    setMode: noop,
    planUnreachable: false,
    headlineValue: 1000,
    yearsForProject: 15,
    monthlyForProject: 200,
    headlineNote: "nominal",
    primary: undefined,
    initialBalance: 0,
    shownInterest: 0,
    results: [],
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

  it("does not render German tax controls or after-tax results", () => {
    renderShell("de");
    expect(screen.queryByText(/DE-Steuern|nach Steuern|mit Steuern/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Thuế DE|afterTax|after-tax/i);
  });
});
