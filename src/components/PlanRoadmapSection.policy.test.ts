// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";
import PlanRoadmapSection from "./PlanRoadmapSection";

function renderRoadmap(locale: "vi" | "de") {
  window.localStorage.setItem(LOCALE_KEY, locale);
  return render(
    createElement(
      LocaleProvider,
      null,
      createElement(PlanRoadmapSection, {
        target: { targetUseDate: "2042-06-30", needFullAmount: true },
        onChangeTarget: vi.fn(),
      }),
    ),
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LOCALE_KEY);
});

describe("PlanRoadmapSection financial-policy containment", () => {
  it("keeps Vietnamese goal date, time horizon and review awareness without allocation advice", () => {
    renderRoadmap("vi");
    expect(screen.getByText("Ngày cần tiền (mốc sử dụng)")).toBeTruthy();
    expect(screen.getByText("Thời gian còn lại")).toBeTruthy();
    expect(screen.getByText("Điểm rà soát:", { exact: false })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Mục tiêu cổ phiếu|Lộ trình giảm rủi ro|Giai đoạn tăng trưởng|Dừng góp cổ phiếu|\d+% CK/);
  });

  it("keeps German goal date, time horizon and review awareness without allocation advice", () => {
    renderRoadmap("de");
    expect(screen.getByText("Verwendungsdatum")).toBeTruthy();
    expect(screen.getByText("Verbleibender Zeitraum")).toBeTruthy();
    expect(screen.getByText("Prüfpunkt:", { exact: false })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Aktienziel|Jährlicher Risikoabbau|HALTEN|REDUZIEREN|STOPPEN|\d+% Aktien/);
  });
});
