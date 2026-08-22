// @vitest-environment jsdom

import { createElement, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";
import AnnualPlanStudio from "./AnnualPlanStudio";

function renderStudio(overrides: Partial<ComponentProps<typeof AnnualPlanStudio>> = {}) {
  window.localStorage.setItem(LOCALE_KEY, "vi");
  return render(createElement(LocaleProvider, null, createElement(AnnualPlanStudio, {
    target: { targetUseDate: "2028-06-30", needFullAmount: false },
    startDate: "2025-01-15",
    contributionY1: 100,
    contributionY2: 150,
    trackInAppCash: false,
    transactions: [],
    onChangeTarget: vi.fn(),
    ...overrides,
  })));
}

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LOCALE_KEY);
  vi.useRealTimers();
});

describe("AnnualPlanStudio", () => {
  it("shows the owner-controlled contribution schedule year by year without allocation or trade instructions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T12:00:00"));
    renderStudio();

    expect(screen.getByText("Một kế hoạch nhìn rõ từng năm.")).toBeTruthy();
    expect(screen.getByText("2025")).toBeTruthy();
    expect(screen.getByText("2026")).toBeTruthy();
    expect(screen.getByText("2027")).toBeTruthy();
    expect(screen.getAllByText("Dự kiến").length).toBeGreaterThan(0);
    expect(screen.getByText("Chưa lưu số tiền mục tiêu")).toBeTruthy();
    expect(screen.getByText(/150/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/% CK|Mục tiêu cổ phiếu|Mua|Bán|Chuyển.*%|Dừng góp/);
  });

  it("keeps an explicit insufficient-data state rather than inventing a yearly amount", () => {
    renderStudio({ target: { targetUseDate: "", needFullAmount: true } });

    expect(screen.getByText("Chưa đủ nền tảng để lập kế hoạch theo năm")).toBeTruthy();
    expect(document.body.textContent).toContain("ứng dụng không tự tạo số tiền");
  });
});
