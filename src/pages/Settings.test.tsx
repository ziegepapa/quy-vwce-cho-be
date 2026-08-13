// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const RAW_PAYLOAD_CANARY = "RAW_PAYLOAD_CANARY_DO_NOT_RENDER";
const FILE_CONTENT = `{"schemaVersion":3,"exportedAt":"2026-08-10T09:08:07Z","canary":"${RAW_PAYLOAD_CANARY}"}`;

const dbMocks = vi.hoisted(() => ({
  clearAllData: vi.fn(),
  exportBackup: vi.fn(),
  importBackup: vi.fn(),
  getSettings: vi.fn(),
  getOrCreateChecklist: vi.fn(),
  listTransactions: vi.fn(),
  saveSettings: vi.fn(),
  db: {
    appMetadata: { get: vi.fn() },
    annualChecklists: { put: vi.fn() },
  },
}));
const engineMocks = vi.hoisted(() => ({
  listDeadOutbox: vi.fn(),
  pushOutbox: vi.fn(),
  reviveDeadOutbox: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/sync/engine", () => engineMocks);
vi.mock("../lib/calc", () => ({
  csvEscape: (value: unknown) => String(value ?? ""),
  formatDateVN: (value: string) => value,
  parseDecimal: (value: string) => Number(value),
}));
vi.mock("../lib/theme", () => ({
  THEME_OPTIONS: [{ value: "system", label: "Hệ thống" }],
  persistTheme: vi.fn(),
  readTheme: () => "system",
}));
vi.mock("../lib/types", () => ({
  APP_VERSION: "test",
  BACKUP_SCHEMA_VERSION: 3,
  SCHEMA_VERSION: 3,
}));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: null, mfaEnrolled: false }) }));
vi.mock("../components/SettingsPricePanel", () => ({ default: () => null }));
vi.mock("../components/SyncConflictSection", () => ({ default: () => null }));

import SettingsPage from "./Settings";

const SETTINGS = {
  id: "settings",
  planName: "Kế hoạch",
  childName: "Bé",
  accountType: "parent",
  trackInAppCash: false,
  inflationRate: 0.02,
  bufferPct: 0.1,
  vwceReturn: 0.07,
  safeReturn: 0.02,
  endMode: "hard",
};

function renderSettings(onOpenMigrate = vi.fn(), onReload = vi.fn()) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/settings?tab=data"] },
      createElement(SettingsPage, { onReload, onOpenMigrate }),
    ),
  );
}

function makeFile(name: string, content = FILE_CONTENT) {
  const file = new File([content], name, { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(content) });
  return file;
}

async function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText("Thay dữ liệu trên thiết bị bằng file này?");
}

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getSettings.mockResolvedValue(SETTINGS);
  dbMocks.getOrCreateChecklist.mockResolvedValue({ id: "c", year: 2026, items: [], createdAt: "", updatedAt: "" });
  dbMocks.listTransactions.mockResolvedValue([]);
  dbMocks.exportBackup.mockResolvedValue({ exportedAt: "2026-08-11T12:00:00Z", schemaVersion: 3 });
  dbMocks.importBackup.mockResolvedValue(undefined);
  dbMocks.db.appMetadata.get.mockResolvedValue(undefined);
  engineMocks.listDeadOutbox.mockResolvedValue([]);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:x") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  HTMLAnchorElement.prototype.click = vi.fn();
  window.alert = vi.fn();
});

describe("JSON import confirmation modal", () => {
  it("hiển thị nhãn 'File đã chọn' và tên file đã chọn", async () => {
    const { container } = renderSettings();
    await screen.findByText("Nhập file JSON");
    await selectFile(container, makeFile("backup-cu.json"));
    expect(screen.getByText("File đã chọn")).toBeTruthy();
    expect(screen.getByText("backup-cu.json")).toBeTruthy();
  });

  it("chưa gọi importBackup trước khi xác nhận", async () => {
    const { container } = renderSettings();
    await screen.findByText("Nhập file JSON");
    await selectFile(container, makeFile("backup-cu.json"));
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
  });

  it("'Quay lại' không sao lưu, không nhập và đóng modal", async () => {
    const { container } = renderSettings();
    await screen.findByText("Nhập file JSON");
    await selectFile(container, makeFile("backup-cu.json"));
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    await waitFor(() =>
      expect(screen.queryByText("Thay dữ liệu trên thiết bị bằng file này?")).toBeNull(),
    );
    expect(dbMocks.exportBackup).not.toHaveBeenCalled();
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
  });

  it("JSON sai cú pháp: báo lỗi và không chạm dữ liệu", async () => {
    const onReload = vi.fn();
    const { container } = renderSettings(vi.fn(), onReload);
    await screen.findByText("Nhập file JSON");
    await selectFile(container, makeFile("backup-loi.json", "{khong-phai-json"));

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận thay dữ liệu trên thiết bị" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("JSON không hợp lệ"));
    expect(dbMocks.exportBackup).not.toHaveBeenCalled();
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("Thay dữ liệu trên thiết bị bằng file này?")).toBeNull(),
    );
  });

  it("JSON không phải object: báo lỗi và không chạm dữ liệu", async () => {
    const onReload = vi.fn();
    const { container } = renderSettings(vi.fn(), onReload);
    await screen.findByText("Nhập file JSON");
    await selectFile(container, makeFile("backup-null.json", "null"));

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận thay dữ liệu trên thiết bị" }));

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Cấu trúc backup không hợp lệ"),
    );
    expect(dbMocks.exportBackup).not.toHaveBeenCalled();
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("Thay dữ liệu trên thiết bị bằng file này?")).toBeNull(),
    );
  });

  it("schemaVersion không hỗ trợ: báo lỗi và không chạm dữ liệu", async () => {
    const onReload = vi.fn();
    const { container } = renderSettings(vi.fn(), onReload);
    await screen.findByText("Nhập file JSON");
    await selectFile(
      container,
      makeFile(
        "backup-schema-999.json",
        JSON.stringify({ schemaVersion: 999, exportedAt: "2026-08-10T09:08:07Z" }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận thay dữ liệu trên thiết bị" }));

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("schemaVersion không khớp")),
    );
    expect(dbMocks.exportBackup).not.toHaveBeenCalled();
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("Thay dữ liệu trên thiết bị bằng file này?")).toBeNull(),
    );
  });

  it("xác nhận: sao lưu trước rồi mới gọi importBackup", async () => {
    const onReload = vi.fn();
    const { container } = renderSettings(vi.fn(), onReload);
    await screen.findByText("Nhập file JSON");
    await selectFile(container, makeFile("backup-cu.json"));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận thay dữ liệu trên thiết bị" }));
    await waitFor(() => expect(dbMocks.importBackup).toHaveBeenCalledTimes(1));
    expect(dbMocks.exportBackup).toHaveBeenCalledTimes(1);
    expect(dbMocks.exportBackup.mock.invocationCallOrder[0]).toBeLessThan(
      dbMocks.importBackup.mock.invocationCallOrder[0],
    );
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
  });

  it("nút khôi phục chỉ gọi onOpenMigrate", async () => {
    const onOpenMigrate = vi.fn();
    renderSettings(onOpenMigrate);
    const button = await screen.findByRole("button", {
      name: /Khôi phục dữ liệu đang có trên thiết bị/,
    });
    fireEvent.click(button);
    expect(onOpenMigrate).toHaveBeenCalledTimes(1);
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(dbMocks.exportBackup).not.toHaveBeenCalled();
    expect(dbMocks.clearAllData).not.toHaveBeenCalled();
    expect(engineMocks.pushOutbox).not.toHaveBeenCalled();
    expect(engineMocks.reviveDeadOutbox).not.toHaveBeenCalled();
  });

  it("không hiển thị nội dung file thô trong modal", async () => {
    const { container } = renderSettings();
    await screen.findByText("Nhập file JSON");
    await selectFile(container, makeFile("backup-cu.json"));
    expect(document.body.innerHTML).not.toContain(RAW_PAYLOAD_CANARY);
    expect(document.body.innerHTML).not.toContain("schemaVersion");
  });
});
