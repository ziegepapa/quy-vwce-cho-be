// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AppSettings } from "../lib/types";
import { APP_RELEASE_VERSION } from "../lib/appVersion";
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
  getSyncMeta: vi.fn(),
  listDeadOutbox: vi.fn(),
  pushOutbox: vi.fn(),
  reviveDeadOutbox: vi.fn(),
}));
const authMocks = vi.hoisted(() => ({
  user: null as { id: string; email: string; last_sign_in_at?: string } | null,
  resetPassword: vi.fn(),
  startMfaEnrollment: vi.fn(),
  verifyMfaEnrollment: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/sync/engine", () => syncMocks);
vi.mock("../lib/auth", () => ({
  useAuth: () => ({ user: authMocks.user, mfaEnrolled: false, resetPassword: authMocks.resetPassword, startMfaEnrollment: authMocks.startMfaEnrollment, verifyMfaEnrollment: authMocks.verifyMfaEnrollment }),
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
    contributionY2: 300,
    planTarget: { targetUseDate: "2036-12-31", needFullAmount: false, partialNeedEuro: 50000 },
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

function renderGermanSettings(path = "/settings") {
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
  authMocks.user = null;
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
  syncMocks.getSyncMeta.mockResolvedValue({ lastPulledAt: "", lastPushedAt: "" });
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
  it("uses the CBO German hierarchy, localized preference labels and stable tabs", async () => {
    renderGermanSettings();

    expect(await screen.findByRole("heading", { name: "Einstellungen" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Allgemein" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Plan" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sicherheit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Passwort" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wiederherstellungslink" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "VI" })).toBeTruthy();
    expect(screen.getByText("Darstellung")).toBeTruthy();
    expect(screen.getByText("Sprache")).toBeTruthy();
    expect(screen.getByText("Ozean")).toBeTruthy();
    expect(screen.queryByText("Ocean")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Daten" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Daten" }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getAllByText("Daten & Betrieb").length).toBeGreaterThan(0);

    dbMocks.exportBackup.mockRejectedValueOnce(new Error("EXPORT_SECRET_CANARY"));
    fireEvent.click(screen.getByRole("button", { name: /JSON sichern/ }));
    const germanBackupSheet = await screen.findByRole("dialog", { name: "Datensicherung" });
    fireEvent.click(germanBackupSheet.querySelector("button.settings-child-primary") as HTMLButtonElement);
    await waitFor(() => expect(dbMocks.exportBackup).toHaveBeenCalledTimes(1));
    const exportAlert = await screen.findByRole("alert");
    expect(exportAlert.textContent).toContain("JSON-Sicherung konnte nicht exportiert werden");
    expect(document.body.textContent).not.toMatch(/Không|Dữ liệu|Cài đặt|Đồng bộ|Giá/);
  });

  it("renders immediate localized feedback for successful JSON export", async () => {
    renderSettings("/settings?tab=data");

    fireEvent.click(await screen.findByRole("button", { name: /Sao lưu JSON/ }));
    const vietnameseBackupSheet = await screen.findByRole("dialog", { name: "Sao lưu dữ liệu" });
    fireEvent.click(vietnameseBackupSheet.querySelector("button.settings-child-primary") as HTMLButtonElement);

    await waitFor(() => expect(dbMocks.exportBackup).toHaveBeenCalledTimes(1));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(document.body.textContent).toContain("Đã tải xuống bản sao JSON.");
  });

  it("sends a password link only after explicit confirmation and never renders token material", async () => {
    authMocks.user = { id: "security-test", email: "security-test@example.invalid", last_sign_in_at: "2026-08-22T09:00:00Z" };
    authMocks.resetPassword.mockResolvedValue({});
    renderSettings();

    fireEvent.click(await screen.findByRole("button", { name: /^Đổi mật khẩu/ }));
    const dialog = screen.getByRole("dialog", { name: "Đổi mật khẩu" });
    expect(dialog.textContent).toContain("security-test@example.invalid");
    fireEvent.click(screen.getByRole("button", { name: "Gửi link" }));

    await waitFor(() => expect(authMocks.resetPassword).toHaveBeenCalledWith("security-test@example.invalid"));
    expect(screen.getByText("Đã gửi link mật khẩu.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/access_token|refresh_token|code=/i);
  });

  it("keeps password-link provider failures localized and retryable", async () => {
    authMocks.user = { id: "security-error", email: "security-error@example.invalid" };
    authMocks.resetPassword.mockResolvedValue({ error: "PROVIDER_SECRET_CANARY" });
    renderSettings();

    fireEvent.click(await screen.findByRole("button", { name: /^Đổi mật khẩu/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gửi link" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không gửi được link mật khẩu. Vui lòng thử lại.");
    expect(document.body.textContent).not.toContain("PROVIDER_SECRET_CANARY");
  });

  it("keeps malformed and unsupported German backup imports fail-closed", async () => {
    const { container } = renderGermanSettings("/settings?tab=data");
    fireEvent.click(await screen.findByRole("button", { name: /Daten wiederherstellen/ }));
    await screen.findByRole("dialog", { name: "Daten wiederherstellen" });
    let input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const malformed = new File(["not-json"], "kaputt.json", { type: "application/json" });
    Object.defineProperty(malformed, "text", { value: () => Promise.resolve("not-json") });
    fireEvent.change(input, { target: { files: [malformed] } });
    fireEvent.click(await screen.findByRole("button", { name: "Import bestätigen" }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("Ungültige JSON-Datei."));
    expect(dbMocks.importBackup).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: /Daten wiederherstellen/ }));
    input = container.querySelector('input[type="file"]') as HTMLInputElement;
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
    fireEvent.click(await screen.findByRole("button", { name: /Daten wiederherstellen/ }));
    await screen.findByRole("dialog", { name: "Daten wiederherstellen" });
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

  it("uses one accessible child sheet, locks the actual dock and restores it on Escape", async () => {
    const dock = document.createElement("nav");
    dock.className = "bottom-dock";
    document.body.append(dock);
    renderSettings();

    fireEvent.click(await screen.findByRole("button", { name: /^Đổi mật khẩu/ }));
    expect(screen.getByRole("dialog", { name: "Đổi mật khẩu" })).toBeTruthy();
    expect(dock.classList.contains("is-hidden")).toBe(true);
    expect(dock.hasAttribute("inert")).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(dock.classList.contains("is-hidden")).toBe(false);
    expect(dock.hasAttribute("inert")).toBe(false);
    dock.remove();
  });

  it("calls real Sync callback with loading and success feedback", async () => {
    const onSyncNow = vi.fn().mockResolvedValue({ tone: "success", message: "Đã đồng bộ" });
    render(createElement(MemoryRouter, { initialEntries: ["/settings?tab=data"] }, createElement(SettingsPage, { onReload: vi.fn(), onSyncNow })));
    const button = await screen.findByRole("button", { name: /Đồng bộ ngay/ });
    fireEvent.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect((await screen.findAllByText("Đã đồng bộ")).length).toBeGreaterThan(0);
    expect(onSyncNow).toHaveBeenCalledTimes(1);
  });

  it("starts MFA from the stable General tab through its child view", async () => {
    authMocks.startMfaEnrollment.mockResolvedValue({ error: "MFA_FAIL" });
    renderSettings();
    const generalTab = await screen.findByRole("tab", { name: "Chung" });
    expect(generalTab.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /MFA \/ TOTP/ }));
    const mfaDialog = await screen.findByRole("dialog", { name: "MFA / TOTP" });
    expect(mfaDialog).toBeTruthy();
    fireEvent.click(mfaDialog.querySelector("button.settings-child-primary") as HTMLButtonElement);
    await waitFor(() => expect(authMocks.startMfaEnrollment).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("opens the durable Data tab for the legacy tab=data deep link used by Sync conflict navigation", async () => {
    renderGermanSettings("/settings?tab=data");
    const dataTab = await screen.findByRole("tab", { name: "Daten" });
    expect(dataTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByText("Daten & Betrieb").length).toBeGreaterThan(0);
  });
});

describe("Settings operation errors", () => {
  it("keeps the draft and retries a failed autosave without exposing the exception", async () => {
    dbMocks.saveSettings
      .mockRejectedValueOnce(new Error("SETTINGS_SECRET_CANARY"))
      .mockResolvedValueOnce(undefined);
    renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: "Tùy chỉnh kế hoạch" }));
    const input = await screen.findByLabelText("Năm / ngày cần tiền") as HTMLInputElement;

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

    fireEvent.click(await screen.findByRole("button", { name: /Sao lưu JSON/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Xuất JSON/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không xuất được bản sao lưu JSON");
    expect(screen.queryByText("EXPORT_SECRET_CANARY")).toBeNull();
  });

  it("aborts import when the mandatory pre-import backup cannot be created", async () => {
    dbMocks.exportBackup.mockRejectedValueOnce(new Error("PREBACKUP_SECRET_CANARY"));
    const { container } = renderSettings("/settings?tab=data");
    fireEvent.click(await screen.findByRole("button", { name: /Khôi phục dữ liệu/ }));
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
    renderSettings("/settings?tab=data");
    expect((await screen.findAllByText("Dữ liệu & vận hành")).length).toBeGreaterThan(0);
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
