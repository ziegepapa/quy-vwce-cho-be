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
  } as unknown as AppSettings;
}

function renderSettings() {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(SettingsPage, { onReload: vi.fn() }),
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
});

afterEach(() => cleanup());

describe("Settings initial load state", () => {
  it("announces loading without rendering editable settings", () => {
    dbMocks.getSettings.mockReturnValue(new Promise(() => undefined));

    renderSettings();

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Đang tải Cài đặt…")).toBeTruthy();
    expect(screen.queryByText("Mọi thứ ở đúng một chỗ")).toBeNull();
  });

  it("fails closed and retries the initial read", async () => {
    dbMocks.getSettings
      .mockRejectedValueOnce(new Error("IndexedDB unavailable"))
      .mockResolvedValueOnce(loadedSettings());

    renderSettings();

    expect(
      await screen.findByRole("heading", { name: "Không tải được Cài đặt" }),
    ).toBeTruthy();
    expect(screen.queryByText("Mọi thứ ở đúng một chỗ")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(await screen.findByText("Mọi thứ ở đúng một chỗ")).toBeTruthy();
    expect(dbMocks.getSettings).toHaveBeenCalledTimes(2);
  });
});
