// @vitest-environment jsdom

// @ts-ignore -- test-only CSS source audit; Node typings are intentionally omitted from the app tsconfig.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SimulationDemoShell, { type SimulationDemoShellProps } from "./SimulationDemoShell";

const simulationCss = readFileSync("src/styles/demo-v10-simulation.css", "utf8");
const simulationPageSource = readFileSync("src/pages/Simulation.tsx", "utf8");



const noop = vi.fn();

function renderShell(locale: "vi" | "de", startingBalanceWarning = "", shownInterest = 0, targetUnreachable = false, planChanged = false, mode: "A" | "B" | "C" = "A", band = 0, showInflation = false) {
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
      ? "Schätzung · ohne deutsche Steuern · ohne Inflationsanpassung"
      : "Ước tính · chưa tính thuế · chưa chỉnh lạm phát",
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
    band,
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
    inflationOn: showInflation,
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
    expect(document.querySelectorAll(".scenario-chip-value")).toHaveLength(3);
    expect(screen.getByText(/không phải xác suất hay dự báo/i)).toBeTruthy();
    cleanup();
    renderShell("de");
    expect(screen.getByRole("heading", { name: "Szenariovergleich" })).toBeTruthy();
    expect(document.querySelectorAll(".scenario-chip")).toHaveLength(3);
    expect(document.querySelectorAll(".scenario-card")).toHaveLength(0);
  });

  it("applies theme-aware premium presentation classes to the live Simulation route", () => {
    const { container } = renderShell("vi", "", 0, false, false, "A", 0.02);
    expect(container.querySelector(".sim-screen")).toBeTruthy();
    expect(container.querySelector(".sim-headline .sim-mode-badge")).toBeTruthy();
    expect(container.querySelectorAll('[data-testid="simulation-growth-chart"]')).toHaveLength(1);
    expect(container.querySelectorAll('svg[data-chart-kind="portfolio-growth"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-series="cautious-to-bull-band"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="simulation-mode-switch"]')).toHaveLength(1);
    expect(container.querySelectorAll(".mode-tabs .mtab")).toHaveLength(3);
    expect(container.querySelectorAll(".scenario-chip")).toHaveLength(3);
    expect(container.querySelector(".scenario-chip-cautious")).toBeTruthy();
    expect(container.querySelector(".scenario-chip-base")).toBeTruthy();
    expect(container.querySelector(".scenario-chip-bull")).toBeTruthy();
    const majorSections = Array.from(container.querySelectorAll(".mode-tabs, .sim-headline, .sim-chart-card")).map((element) => {
      if (element.classList.contains("mode-tabs")) return "modes";
      if (element.classList.contains("sim-headline")) return "hero";
      return "chart";
    });
    expect(majorSections).toEqual(["modes", "hero", "chart"]);
    expect(container.querySelectorAll(".mode-tabs")).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="simulation-growth-chart"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="simulation-hero-amount"]')).toHaveLength(1);
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

  it("locks a calm mobile hero scale shared by modes A, B and C", () => {
    const mobileScale = simulationCss.slice(simulationCss.lastIndexOf("@media (max-width: 600px)"));
    expect(simulationCss).toMatch(/\.sim-wrap \.sim-hero-amount\s*\{[^}]*font-size:\s*clamp\(32px,\s*4\.5vw,\s*36px\)/s);
    expect(mobileScale).toMatch(/\.sim-wrap \.sim-hero-amount\s*\{[^}]*font-size:\s*clamp\(28px,\s*8\.2vw,\s*32px\)/s);
    expect(mobileScale).toMatch(/\.sim-wrap \.summary-strip > span strong\s*\{[^}]*font-size:\s*15px[^}]*font-weight:\s*750/s);
    expect(mobileScale).toMatch(/\.sim-wrap \.sh-sub\s*\{[^}]*font-size:\s*14px/s);
    expect(simulationCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(simulationCss).toMatch(/\.sim-wrap \.sim-parameters-trigger\s*\{[^}]*min-height:\s*48px/s);
    expect(simulationCss).toMatch(/\.sim-wrap \.sim-sheet-close\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);

    for (const mode of ["A", "B", "C"] as const) {
      const { container } = renderShell("vi", "", 0, false, false, mode);
      const amount = container.querySelector('[data-testid="simulation-hero-amount"]');
      expect(amount).toBeTruthy();
      expect(amount?.classList.contains("sim-hero-amount")).toBe(true);
      expect(container.querySelectorAll(".mode-tabs")).toHaveLength(1);
      expect(container.querySelectorAll('[data-testid="simulation-growth-chart"]')).toHaveLength(1);
      cleanup();
    }
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
    const { container } = renderShell("vi");
    expect(screen.queryByLabelText("Góp mỗi tháng (EUR)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Điều chỉnh giả định" }));
    expect(screen.getByLabelText("Góp mỗi tháng (EUR)")).toBeTruthy();
    expect(screen.getByLabelText("Lợi nhuận / năm (%)")).toBeTruthy();
    expect(screen.getByLabelText("Thời hạn")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Mô phỏng" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Tóm tắt kết quả mô phỏng" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Góp → Nhận/ }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".sim-year-disclosure")?.hasAttribute("open")).toBe(false);
    fireEvent.click(container.querySelector(".sim-sheet-close")!);
    fireEvent.click(screen.getByText("Bảng mô phỏng theo năm"));
    expect(screen.getByRole("table", { name: "Bảng mô phỏng theo năm" })).toBeTruthy();
    expect(document.querySelectorAll(".scenario-chip")).toHaveLength(3);
    expect(document.querySelector(".sim-year-disclosure")?.hasAttribute("open")).toBe(true);
    expect(document.querySelector(".sim-chart-svg")?.textContent).toContain("15 năm");
  });

  it("associates German controls with labels and localizes chart duration", () => {
    const { container } = renderShell("de");
    expect(screen.queryByLabelText("Monatlicher Beitrag (EUR)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Annahmen anpassen" }));
    expect(screen.getByLabelText("Monatlicher Beitrag (EUR)")).toBeTruthy();
    expect(screen.getByLabelText("Rendite / Jahr (%)")).toBeTruthy();
    expect(screen.getByLabelText("Laufzeit")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Simulation" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Simulationsergebnis" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Einzahlen → Ergebnis/ }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".sim-year-disclosure")?.hasAttribute("open")).toBe(false);
    fireEvent.click(container.querySelector(".sim-sheet-close")!);
    fireEvent.click(screen.getByText("Jährliche Projektion"));
    expect(screen.getByRole("table", { name: "Jährliche Projektion" })).toBeTruthy();
    expect(document.querySelectorAll(".scenario-chip")).toHaveLength(3);
    expect(document.querySelector(".sim-chart-svg")?.textContent).toContain("15 Jahre");
  });

  it("shows localized Vietnamese estimate details without German copy and labels purchasing-power mode clearly", () => {
    renderShell("vi", "", 0, false, false, "A", 0, true);
    expect(screen.getByText("Ước tính · chưa tính thuế · chưa chỉnh lạm phát")).toBeTruthy();
    expect(screen.getByText("Lãi / lỗ")).toBeTruthy();
    const info = screen.getByRole("button", { name: "Giải thích về ước tính" });
    expect(info.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(info);
    expect(screen.getByText("Kết quả dựa trên giả định lợi suất bạn chọn.")).toBeTruthy();
    expect(screen.getByText("Mô phỏng chưa trừ thuế Đức và phí broker.")).toBeTruthy();
    expect(screen.getByText("Bật “Hiện theo sức mua hôm nay” để quy đổi giá trị tiền tệ về sức mua hiện tại.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Deutsche Steuern");
    expect(document.body.textContent).not.toContain("Gewinn/Verlust");
    expect(document.body.textContent).not.toMatch(/danh nghĩa|nominal/i);

    fireEvent.click(screen.getByRole("button", { name: "Điều chỉnh giả định" }));
    fireEvent.click(screen.getByText("Tùy chọn nâng cao"));
    const powerToggle = screen.getByRole("button", { name: "Hiện theo sức mua hôm nay" });
    expect(powerToggle.getAttribute("aria-pressed")).toBe("false");
    noop.mockClear();
    fireEvent.click(powerToggle);
    expect(noop).toHaveBeenCalled();
  });

  it("shows localized German estimate details without Vietnamese copy and labels purchasing-power mode clearly", () => {
    renderShell("de", "", 0, false, false, "A", 0, true);
    expect(screen.getByText("Schätzung · ohne deutsche Steuern · ohne Inflationsanpassung")).toBeTruthy();
    expect(screen.getByText("Gewinn/Verlust")).toBeTruthy();
    const info = screen.getByRole("button", { name: "Hinweise zur Schätzung" });
    expect(info.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(info);
    expect(screen.getByText("Das Ergebnis basiert auf der gewählten Renditeannahme.")).toBeTruthy();
    expect(screen.getByText("Deutsche Steuern und Brokergebühren werden nicht abgezogen.")).toBeTruthy();
    expect(screen.getByText("Aktiviere „In heutiger Kaufkraft anzeigen“, um den Geldwert auf heutige Kaufkraft umzurechnen.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Ước tính");
    expect(document.body.textContent).not.toContain("Lãi / lỗ");
    expect(document.body.textContent).not.toMatch(/danh nghĩa|nominal/i);

    fireEvent.click(screen.getByRole("button", { name: "Annahmen anpassen" }));
    fireEvent.click(screen.getByText("Erweiterte Optionen"));
    const powerToggle = screen.getByRole("button", { name: "In heutiger Kaufkraft anzeigen" });
    expect(powerToggle.getAttribute("aria-pressed")).toBe("false");
    noop.mockClear();
    fireEvent.click(powerToggle);
    expect(noop).toHaveBeenCalled();
  });

  it("uses the same localized estimate strings on the production Simulation page", () => {
    expect(simulationPageSource).toContain('heroEstimateUnadjusted: "Schätzung · ohne deutsche Steuern · ohne Inflationsanpassung"');
    expect(simulationPageSource).toContain('heroEstimateAdjusted: "Schätzung · ohne deutsche Steuern · in heutiger Kaufkraft"');
    expect(simulationPageSource).toContain('heroEstimateUnadjusted: "Ước tính · chưa tính thuế · chưa chỉnh lạm phát"');
    expect(simulationPageSource).toContain('heroEstimateAdjusted: "Ước tính · chưa tính thuế · theo sức mua hôm nay"');
    expect(simulationPageSource).toContain('const headlineNote = mode === "A" && usePP');
    expect(simulationPageSource).not.toContain('nominal: "nominal"');
    expect(simulationPageSource).not.toContain('nominal: "danh nghĩa"');
  });

  it("keeps advanced options collapsed and shows the save CTA only when the plan differs", () => {
    renderShell("vi");
    expect(screen.queryByRole("button", { name: "Lưu vào kế hoạch" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Điều chỉnh giả định" }));
    const details = document.querySelector("details.gl:not(.sim-year-disclosure)") as HTMLDetailsElement | null;
    expect(details?.open).toBe(false);
    expect(screen.queryByRole("button", { name: "Lưu vào kế hoạch" })).toBeNull();

    cleanup();
    renderShell("vi", "", 0, false, true);
    const save = screen.getByRole("button", { name: "Lưu vào kế hoạch" });
    fireEvent.click(save);
    expect(noop).toHaveBeenCalled();
  });

  it("does not render German tax controls or after-tax results", () => {
    renderShell("de");
    expect(screen.queryByText(/DE-Steuern|nach Steuern|mit Steuern/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Thuế DE|afterTax|after-tax/i);
  });
});
