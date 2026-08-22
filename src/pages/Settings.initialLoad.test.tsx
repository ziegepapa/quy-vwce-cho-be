// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AppSettings } from "../lib/types";

const dbMocks = vi.hoisted(() => ({
  clearAllData: vi.fn(),
  db: {
    appMetadata: { get: vi.fn() },
    annualChecklists: { put: vi.fn() },
  },
  exportBackup: vi.fn(),
  getOrCreateChecklist: vi.fn(),
  getSettings: vi.fn(),
  importBackup: vi.fn(),
  listTransactions: vi.fn(),
  saveSettings: vi.fn(),
}));
const syncMocks = vi.hoisted(() => ({
  getSyncMeta: vi.fn(),
  listDeadOutbox: vi.fn(),
  pushOutbox: vi.fn(),
  reviveDeadOutbox: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/sync/engine", () => syncMocks);
vi.mock("../lib/auth", () => ({
  useAuth: () => ({ user: null, mfaEnrolled: false }),
}));
vi.mock("../lib/recoveryReadOnly", () => ({
  useRecoveryReadOnly: () => ({ readOnly: false, showBlocked: vi.fn() }),
}));
vi.mock("../lib/theme", () => ({
  THEME_OPTIONS: [{ value: "system", label: "Hệ thống" }],
  persistTheme: vi.fn(),
  readTheme: () => "system",
}));
vi.mock("../components/SettingsPricePanel", () => ({ default: () => null }));
vi.mock("../components/SyncConflictSection", () => ({ default: () => null }));
vi.mock("../components/PlanRoadmapSection", () => ({ default: () => null }));

import SettingsPage from "./Settings";

function loadedSettings(): AppSettings {
  return {
    planName: "Quỹ VWCE",
    childName: "Bé",
    accountType: "parent",
    trackInAppCash: false,
    inflationRate: 0.02,
    bufferPct: 0.1,
    vwceReturn: 0.06,
    safeReturn: 0.025,
    endMode: "hard",
    endDate: "2042-12-31",
    contributionY2: 300,
    planTarget: { targetUseDate: "2036-12-31", needFullAmount: false, partialNeedEuro: 50000 },
  } as unknown as AppSettings;
}

function renderSettings(props: Partial<Parameters<typeof SettingsPage>[0]> = {}) {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(SettingsPage, { onReload: vi.fn(), ...props }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.db.appMetadata.get.mockResolvedValue({ lastBackupAt: "" });
  dbMocks.getOrCreateChecklist.mockResolvedValue({
    year: new Date().getFullYear(),
    items: [],
    updatedAt: new Date().toISOString(),
  });
  syncMocks.listDeadOutbox.mockResolvedValue([]);
  syncMocks.getSyncMeta.mockResolvedValue({ lastPulledAt: "", lastPushedAt: "" });
});

afterEach(() => cleanup());

describe("Settings initial load state", () => {
  it("announces loading without rendering editable settings", () => {
    dbMocks.getSettings.mockReturnValue(new Promise(() => undefined));

    renderSettings();

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-label")).toBe("Đang tải Cài đặt");
    expect(screen.queryByText("Tài khoản")).toBeNull();
  });

  it("fails closed and retries the initial read", async () => {
    dbMocks.getSettings
      .mockRejectedValueOnce(new Error("IndexedDB unavailable"))
      .mockResolvedValueOnce(loadedSettings());

    renderSettings();

    expect(
      await screen.findByRole("heading", { name: "Không tải được Cài đặt" }),
    ).toBeTruthy();
    expect(screen.queryByText("Tài khoản")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(await screen.findByText("Tùy chọn hằng ngày")).toBeTruthy();
    expect(dbMocks.getSettings).toHaveBeenCalledTimes(2);
  });

  it("answers this year first and keeps plan mechanics inside the P40 sheet", async () => {
    dbMocks.getSettings.mockResolvedValue(loadedSettings());
    renderSettings();

    expect(await screen.findByRole("heading", { name: "Kế hoạch" })).toBeTruthy();
    expect(document.body.textContent).toContain("50.000");
    expect(document.body.textContent).toContain("300");
    expect(screen.getByText("NĂM NAY")).toBeTruthy();
    expect(document.querySelector(".p40-plan-accumulate")).toBeTruthy();
    expect(document.body.textContent).toContain("Gợi ý minh họa · không thay đổi giao dịch đã ghi.");
    expect(document.body.textContent).not.toContain("0.06");
    expect(screen.queryByText("Cửa sổ an toàn (preview)")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tùy chỉnh kế hoạch" }));
    expect(screen.getByRole("dialog", { name: "Kế hoạch" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "3 năm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "5 năm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "7 năm" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "8%" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "12%" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "16%" })).toBeTruthy();
    expect(screen.getByText("Hôm nay")).toBeTruthy();
    expect(screen.getByText("Bắt đầu an toàn")).toBeTruthy();
    expect(screen.getByText("Năm cần tiền")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Nâng cao cho mô phỏng/ }));
    expect(screen.getByRole("dialog", { name: "Giả định mô phỏng" })).toBeTruthy();
    expect(screen.getAllByText("%/năm")).toHaveLength(3);
  });

  it("routes Settings sign-out through the app-shell callback", async () => {
    dbMocks.getSettings.mockResolvedValue(loadedSettings());
    const onRequestSignOut = vi.fn();
    renderSettings({ onRequestSignOut });

    fireEvent.click(await screen.findByRole("button", { name: /Đăng xuất/i }));

    expect(onRequestSignOut).toHaveBeenCalledTimes(1);
  });

  it("renders the shared conflict health state supplied by App shell", async () => {
    dbMocks.getSettings.mockResolvedValue(loadedSettings());
    renderSettings({
      syncHealth: {
        signedIn: true, online: true, running: false, pending: 0, dead: 0,
        conflicts: 2, recoveryPending: false, state: "conflict", tone: "blocked", action: "conflicts",
      },
    });

    fireEvent.click(await screen.findByRole("tab", { name: "Dữ liệu" }));
    expect((await screen.findAllByText("2 xung đột dữ liệu")).length).toBe(1);
    expect(document.querySelector('[data-sync-health="conflict"]')).toBeTruthy();
  });
});
