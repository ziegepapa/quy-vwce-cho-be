// @vitest-environment jsdom

import { createElement, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AppSettings } from "../lib/types";
import SettingsCboWorkspace from "./SettingsCboWorkspace";

const settings = {
  planName: "VWCE Vault",
  childName: "Bé",
  accountType: "parent",
  trackInAppCash: false,
  startDate: "2026-01-01",
  endDate: "2039-10-28",
  planTarget: { targetUseDate: "2039-10-28", needFullAmount: true },
  contributionY1: 100,
  contributionY2: 120,
  vwceReturn: 0.07,
  inflationRate: 0.02,
  safeReturn: 0.02,
  bufferPct: 0.1,
} as AppSettings;

function renderSettings(locale: "vi" | "de" = "vi", overrides: Partial<ComponentProps<typeof SettingsCboWorkspace>> = {}) {
  return render(createElement(SettingsCboWorkspace, {
    activeTab: "general",
    settings,
    locale,
    theme: "premium",
    saveLabel: "Đã lưu",
    syncLabel: "Đang đồng bộ",
    syncing: false,
    lastSync: null,
    pricesPanel: null,
    dataHealthPanel: null,
    syncHealthPanel: null,
    syncConflictPanel: null,
    onSelectTab: vi.fn(),
    onPatchSettings: vi.fn(),
    onChangeTarget: vi.fn(),
    onTheme: vi.fn(),
    onLocale: vi.fn(),
    onOpenChild: vi.fn(),
    onSync: vi.fn(),
    onExportCsv: vi.fn(),
    ...overrides,
  }));
}

afterEach(() => cleanup());

describe("SettingsCboWorkspace yearly plan", () => {
  it("shows the full yearly schedule with current, safe-start and target markers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T12:00:00"));
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Tùy chỉnh kế hoạch" }));
    const table = screen.getByTestId("p40-yearly-plan");
    const rows = within(table).getAllByRole("row");

    expect(screen.getByText("Kế hoạch từng năm")).toBeTruthy();
    expect(rows).toHaveLength(15);
    expect(table.textContent).toContain("2026");
    expect(table.textContent).toContain("2034");
    expect(table.textContent).toContain("2039");
    expect(table.textContent).toContain("Hiện tại");
    expect(table.textContent).toContain("Bắt đầu an toàn");
    expect(table.textContent).toContain("Năm cần tiền");
    expect(table.textContent).toContain("1.200");
    expect(document.body.textContent).not.toMatch(/Mua|Bán|lệnh mua|lệnh bán/);
  });

  it("keeps the yearly table localized in German", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T12:00:00"));
    renderSettings("de", { saveLabel: "Gespeichert" });

    fireEvent.click(screen.getByRole("button", { name: "Plan anpassen" }));
    const table = screen.getByTestId("p40-yearly-plan");

    expect(screen.getByText("Jahresplan")).toBeTruthy();
    expect(table.textContent).toContain("Heute");
    expect(table.textContent).toContain("Sicherheit beginnt");
    expect(table.textContent).toContain("Zieljahr");
  });
});
