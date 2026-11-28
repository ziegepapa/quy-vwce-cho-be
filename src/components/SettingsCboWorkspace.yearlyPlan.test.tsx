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

    fireEvent.click(screen.getByRole("button", { name: "Kế hoạch từng năm" }));
    const dialog = screen.getByRole("dialog");
    const table = within(dialog).getByTestId("p40-yearly-plan");
    const rows = within(table).getAllByRole("row");

    expect(within(dialog).getByText("Kế hoạch từng năm")).toBeTruthy();
    expect(rows).toHaveLength(15);
    expect(table.textContent).toContain("2026");
    expect(table.textContent).toContain("2034");
    expect(table.textContent).toContain("2039");
    expect(table.textContent).toContain("Hiện tại");
    expect(table.textContent).toContain("Mốc an toàn");
    expect(table.textContent).toContain("Mốc mục tiêu");
    expect(table.textContent).toContain("1.200");
    expect(table.textContent).not.toMatch(/\b(Mua|Bán)\b/);
    expect(screen.queryByRole("button", { name: /^(Mua|Bán)/i })).toBeNull();
  });

  it("keeps the yearly table localized in German", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T12:00:00"));
    renderSettings("de", { saveLabel: "Gespeichert" });

    fireEvent.click(screen.getByRole("button", { name: "Jahresplan" }));
    const dialog = screen.getByRole("dialog");
    const table = within(dialog).getByTestId("p40-yearly-plan");

    expect(within(dialog).getByText("Jahresplan")).toBeTruthy();
    expect(table.textContent).toContain("Heute");
    expect(table.textContent).toContain("Sicherheitsbeginn");
    expect(table.textContent).toContain("Zieljahr");
  });
});


describe("Settings status center", () => {
  it("does not claim synced or enabled MFA for unverified local sessions", () => {
    renderSettings("de", { accountReady: true, signedIn: false, mfaEnrolled: true, backupAt: null });
    const center = within(screen.getByTestId("settings-status-center"));
    expect(center.getByText("Nur lokal")).toBeTruthy();
    expect(center.getByText("Nicht geprüft")).toBeTruthy();
    expect(center.getByText("Kein Cloud-Konto")).toBeTruthy();
    expect(center.getByText("Kein Export vermerkt")).toBeTruthy();
    expect(center.queryByText("Kontoschutz einrichten")).toBeNull();
  });
  it("prioritizes actual conflicts over MFA and backup and opens the existing sync sheet", () => {
    renderSettings("vi", { accountReady: true, signedIn: true, mfaReady: true, online: true, mfaEnrolled: false, syncState: "conflict", syncLabel: "1 xung đột dữ liệu", backupAt: null });
    const center = within(screen.getByTestId("settings-status-center"));
    fireEvent.click(center.getByRole("button", { name: /Kiểm tra đồng bộ/ }));
    expect(screen.getByRole("dialog", { name: "Đồng bộ" })).toBeTruthy();
  });
  it("shows recorded backup and never suggests mutation while read-only", () => {
    renderSettings("de", { accountReady: true, signedIn: true, mfaReady: true, online: true, mfaEnrolled: false, syncState: "pending", backupAt: "2026-08-23T12:00:00Z", readOnly: true });
    const center = within(screen.getByTestId("settings-status-center"));
    expect(center.getByText(/Nur Lesen/)).toBeTruthy();
    expect(center.queryByRole("button")).toBeNull();
    expect(center.queryByText("Kein Export vermerkt")).toBeNull();
  });
});
