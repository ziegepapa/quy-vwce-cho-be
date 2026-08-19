// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function renderSettings(path = "/settings") {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(SettingsPage, { onReload: vi.fn() }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getSettings.mockResolvedValue(loadedSettings());
  dbMocks.db.appMetadata.get.mockResolvedValue({ lastBackupAt: "" });
  dbMocks.getOrCreateChecklist.mockResolvedValue({
    year: new Date().getFullYear(),
    items: [{ key: "review", label: "Kiểm tra hồ sơ", done: false }],
    updatedAt: new Date().toISOString(),
  });
  dbMocks.db.annualChecklists.put.mockResolvedValue(undefined);
  dbMocks.exportBackup.mockResolvedValue({
    exportedAt: "2026-08-14T06:00:00Z",
    schemaVersion: 3,
  });
  dbMocks.importBackup.mockResolvedValue(undefined);
  dbMocks.listTransactions.mockResolvedValue([]);
  dbMocks.saveSettings.mockResolvedValue(undefined);
  syncMocks.listDeadOutbox.mockResolvedValue([]);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:test"),
  });
  HTMLAnchorElement.prototype.click = vi.fn();
  window.alert = vi.fn();
});

afterEach(() => cleanup());

describe("Settings operation errors", () => {
  it("keeps the draft and retries a failed autosave without exposing the exception", async () => {
    dbMocks.saveSettings
      .mockRejectedValueOnce(new Error("SETTINGS_SECRET_CANARY"))
      .mockResolvedValueOnce(undefined);
    renderSettings("/settings?tab=advanced");
    const input = await screen.findByLabelText("Ngày cần tiền (mốc sử dụng)") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "2043-12-31" } });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không lưu được Cài đặt");
    expect(screen.queryByText("SETTINGS_SECRET_CANARY")).toBeNull();
    expect(input.value).toBe("2043-12-31");

    fireEvent.click(screen.getByRole("button", { name: "Thử lưu lại" }));

    await waitFor(() => expect(dbMocks.saveSettings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(input.value).toBe("2043-12-31");
  });


  it("reports JSON export failure without changing data", async () => {
    dbMocks.exportBackup.mockRejectedValueOnce(new Error("EXPORT_SECRET_CANARY"));
    renderSettings("/settings?tab=data");

    fireEvent.click(await screen.findByRole("button", { name: /Xuất JSON/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không xuất được bản sao lưu JSON");
    expect(screen.queryByText("EXPORT_SECRET_CANARY")).toBeNull();
  });

  it("aborts import when the mandatory pre-import backup cannot be created", async () => {
    dbMocks.exportBackup.mockRejectedValueOnce(new Error("PREBACKUP_SECRET_CANARY"));
    const { container } = renderSettings();
    await screen.findByText("Nhập sao lưu");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify({ schemaVersion: 3, exportedAt: "2026-08-14T06:00:00Z" })], "backup.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(JSON.stringify({ schemaVersion: 3, exportedAt: "2026-08-14T06:00:00Z" })) });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText(/Thay dữ liệu bằng file backup\.json\?/);

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận nhập" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
      "Không tạo được bản sao lưu trước khi nhập. Dữ liệu chưa bị thay đổi.",
    ));
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain("PREBACKUP_SECRET_CANARY");
  });

  it("keeps data when deletion fails and leaves the confirmation available", async () => {
    dbMocks.clearAllData.mockRejectedValueOnce(new Error("DELETE_SECRET_CANARY"));
    renderSettings("/settings?tab=advanced");
    await screen.findByText("Sao lưu & dữ liệu trên thiết bị");
    const deleteButton = await waitFor(() => {
      const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Xóa toàn bộ dữ liệu local"));
      expect(button).toBeTruthy();
      return button as HTMLButtonElement;
    });
    fireEvent.click(deleteButton);
    fireEvent.change(document.querySelector('input[placeholder="XOA"]') as HTMLInputElement, { target: { value: "XOA" } });

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xóa" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không xóa được dữ liệu");
    expect(screen.queryByText("DELETE_SECRET_CANARY")).toBeNull();
    expect(screen.getByRole("button", { name: "Xác nhận xóa" })).toBeTruthy();
  });
});
