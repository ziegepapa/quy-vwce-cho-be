// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AppSettings } from "../lib/types";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";

const dbMocks = vi.hoisted(() => ({
  clearAllData: vi.fn(),
  countLocalData: vi.fn(),
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

function renderGermanSettings(path = "/settings?tab=advanced") {
  window.localStorage.setItem(LOCALE_KEY, "de");
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(LocaleProvider, null, createElement(SettingsPage, { onReload: vi.fn() })),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getSettings.mockResolvedValue(loadedSettings());
  dbMocks.countLocalData.mockResolvedValue({ settings: 1, goals: 0, transactions: 0, annualChecklists: 0, monthlySnapshots: 0, quotes: 0 });
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

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LOCALE_KEY);
});

describe("German Settings and mobile Advanced hierarchy", () => {
  it("uses German copy and keeps all Advanced groups collapsed until explicitly opened", async () => {
    dbMocks.exportBackup.mockRejectedValueOnce(new Error("EXPORT_SECRET_CANARY"));
    const { container } = renderGermanSettings();

    await screen.findByText("Erscheinungsbild");
    expect(screen.getByRole("button", { name: "Vietnamesisch Verfügbar" })).toBeTruthy();
    expect(screen.getByText("Kurse & Marktdaten")).toBeTruthy();
    expect(screen.getByText("Synchronisierung & Datenkonflikte")).toBeTruthy();
    expect(screen.getByText("Gerätediagnose")).toBeTruthy();
    expect(screen.getByText("Verwendungsplan")).toBeTruthy();
    expect(screen.getByText("Sicherung & lokale Daten")).toBeTruthy();
    expect(screen.getByText("v1.8.1 · Online")).toBeTruthy();
    const groups = [...container.querySelectorAll("details.advanced-group")] as HTMLDetailsElement[];
    expect(groups).toHaveLength(5);
    expect(groups.every((group) => group.open === false)).toBe(true);

    fireEvent.click(screen.getByText("Kurse & Marktdaten"));
    expect(groups[0]?.open).toBe(true);
    fireEvent.click(screen.getByText("Synchronisierung & Datenkonflikte"));
    await waitFor(() => {
      expect(groups[0]?.open).toBe(false);
      expect(groups[1]?.open).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: /JSON exportieren/ }));
    expect(await screen.findByText("JSON-Sicherung konnte nicht exportiert werden. Ihre Daten wurden nicht verändert.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Không|Dữ liệu|Cài đặt|Đồng bộ|Giá/);
  });

  it("keeps malformed and unsupported German backup imports fail-closed", async () => {
    const { container } = renderGermanSettings("/settings?tab=data");
    await screen.findByText("Sicherung importieren");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const malformed = new File(["not-json"], "kaputt.json", { type: "application/json" });
    Object.defineProperty(malformed, "text", { value: () => Promise.resolve("not-json") });
    fireEvent.change(input, { target: { files: [malformed] } });
    fireEvent.click(await screen.findByRole("button", { name: "Import bestätigen" }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("Ungültige JSON-Datei."));
    expect(dbMocks.importBackup).not.toHaveBeenCalled();

    const unsupportedJson = JSON.stringify({ schemaVersion: 999, exportedAt: "2026-08-14T06:00:00Z" });
    const unsupported = new File([unsupportedJson], "alt.json", { type: "application/json" });
    Object.defineProperty(unsupported, "text", { value: () => Promise.resolve(unsupportedJson) });
    fireEvent.change(input, { target: { files: [unsupported] } });
    fireEvent.click(await screen.findByRole("button", { name: "Import bestätigen" }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("Diese Sicherungsversion wird nicht unterstützt."));
    expect(dbMocks.exportBackup).not.toHaveBeenCalled();
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/Không|Dữ liệu|Cài đặt|Đồng bộ|Giá/);
  });

  it("aborts German import when the mandatory pre-import backup cannot be created", async () => {
    dbMocks.exportBackup.mockRejectedValueOnce(new Error("PREBACKUP_SECRET_CANARY"));
    const { container } = renderGermanSettings("/settings?tab=data");
    await screen.findByText("Sicherung importieren");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const validJson = JSON.stringify({ schemaVersion: 3, exportedAt: "2026-08-14T06:00:00Z" });
    const backup = new File([validJson], "backup.json", { type: "application/json" });
    Object.defineProperty(backup, "text", { value: () => Promise.resolve(validJson) });
    fireEvent.change(input, { target: { files: [backup] } });
    fireEvent.click(await screen.findByRole("button", { name: "Import bestätigen" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
      "Sicherung vor dem Import konnte nicht erstellt werden. Ihre Daten wurden nicht verändert.",
    ));
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain("PREBACKUP_SECRET_CANARY");
  });

  it("opens Advanced for the legacy tab=data deep link used by Sync conflict navigation", async () => {
    const { container } = renderGermanSettings("/settings?tab=data");
    await screen.findByText("Erweitert");
    const advanced = container.querySelector("details.set-advanced") as HTMLDetailsElement;
    expect(advanced.open).toBe(true);
  });
});

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
