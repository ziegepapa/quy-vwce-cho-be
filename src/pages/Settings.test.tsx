// @vitest-environment jsdom
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const dbMocks = vi.hoisted(() => ({
  clearAllData: vi.fn(),
  db: {},
  exportBackup: vi.fn(),
  getOrCreateChecklist: vi.fn(),
  getSettings: vi.fn(),
  importBackup: vi.fn(),
  listTransactions: vi.fn(),
  saveSettings: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  listDeadOutbox: vi.fn(),
  pushOutbox: vi.fn(),
  reviveDeadOutbox: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/sync/engine", () => engineMocks);
vi.mock("../lib/auth", () => authMocks);
vi.mock("../components/SettingsPricePanel", () => ({ default: () => null }));
vi.mock("../components/SyncConflictSection", () => ({ default: () => null }));

import SettingsPage from "./Settings";

const SAMPLE_BACKUP = {
  schemaVersion: 3,
  exportedAt: "2026-08-12T10:30:00.000Z",
  settings: [],
  goals: [],
  transactions: [],
  annualChecklists: [],
  monthlySnapshots: [],
};

function renderSettings(props: {
  onReload?: () => void;
  onOpenMigrate?: () => void;
} = {}) {
  const onReload = props.onReload ?? vi.fn();
  const onOpenMigrate = props.onOpenMigrate;
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/settings?tab=data"] },
      createElement(SettingsPage, {
        onReload,
        onOpenMigrate,
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.useAuth.mockReturnValue({
    user: { id: "owner-1", email: "owner@example.com" },
    ready: true,
    vaultReady: true,
    mfaReady: true,
  });
  dbMocks.getSettings.mockResolvedValue({
    id: "settings",
    planName: "Quỹ",
    childName: "Bé",
    version: 1,
  });
  dbMocks.getOrCreateChecklist.mockResolvedValue({ year: 2026, items: [] });
  dbMocks.listTransactions.mockResolvedValue([]);
  dbMocks.exportBackup.mockResolvedValue(SAMPLE_BACKUP);
  dbMocks.importBackup.mockResolvedValue(undefined);
  engineMocks.listDeadOutbox.mockResolvedValue([]);
  if (!(URL as { createObjectURL?: (b: Blob) => string }).createObjectURL) {
    (URL as { createObjectURL: (b: Blob) => string }).createObjectURL = () => "blob:test";
  }
  if (!(URL as { revokeObjectURL?: (u: string) => void }).revokeObjectURL) {
    (URL as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => undefined;
  }
});

afterEach(() => {
  cleanup();
});

describe("Settings data import vs recovery clarity", () => {
  it("shows distinct JSON import wording and local-replacement warning", async () => {
    renderSettings({ onOpenMigrate: vi.fn() });
    expect(await screen.findByText("Nhập file JSON")).toBeTruthy();
    expect(
      screen.getByText("Thay toàn bộ dữ liệu trên thiết bị bằng file backup đã chọn."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Lưu ý: thao tác này thay toàn bộ dữ liệu local trên iPhone. Dữ liệu trong tài khoản không được sửa trực tiếp ở bước này.",
      ),
    ).toBeTruthy();
  });

  it("shows recovery action with helper that forbids file pick", async () => {
    const onOpenMigrate = vi.fn();
    renderSettings({ onOpenMigrate });
    expect(await screen.findByText("Khôi phục dữ liệu đang có trên thiết bị")).toBeTruthy();
    expect(
      screen.getByText("Kiểm tra dữ liệu đang lưu trên iPhone và khôi phục an toàn vào tài khoản."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Không chọn file. Nếu dữ liệu trong tài khoản khác dữ liệu trên iPhone, ứng dụng sẽ yêu cầu bạn chọn; không tự ghi đè.",
      ),
    ).toBeTruthy();
  });

  it("recovery button only calls onOpenMigrate and never importBackup", async () => {
    const onOpenMigrate = vi.fn();
    renderSettings({ onOpenMigrate });
    const button = await screen.findByRole("button", {
      name: /Khôi phục dữ liệu đang có trên thiết bị/i,
    });
    fireEvent.click(button);
    expect(onOpenMigrate).toHaveBeenCalledTimes(1);
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(dbMocks.clearAllData).not.toHaveBeenCalled();
    expect(engineMocks.pushOutbox).not.toHaveBeenCalled();
    expect(engineMocks.reviveDeadOutbox).not.toHaveBeenCalled();
  });

  it("opens confirmation dialog with exact copy after selecting a JSON file", async () => {
    renderSettings({ onOpenMigrate: vi.fn() });
    await screen.findByText("Nhập file JSON");

    const fileInput = document.querySelector(
      'input[type="file"][accept="application/json,.json"]',
    ) as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const file = new File([JSON.stringify(SAMPLE_BACKUP)], "backup.json", {
      type: "application/json",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Thay dữ liệu trên thiết bị bằng file này?")).toBeTruthy();
    expect(
      within(dialog).getByText(
        /Dữ liệu local hiện có trên iPhone sẽ được thay bằng nội dung file JSON bạn đã chọn/,
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/Thao tác này không tự ghi đè dữ liệu trong tài khoản/),
    ).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Quay lại" })).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "Xác nhận thay dữ liệu trên thiết bị" }),
    ).toBeTruthy();
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
  });

  it("confirming import uses new auto-backup filename prefix and local-only importBackup", async () => {
    const onReload = vi.fn();
    const downloadSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    renderSettings({ onReload, onOpenMigrate: vi.fn() });
    await screen.findByText("Nhập file JSON");

    const fileInput = document.querySelector(
      'input[type="file"][accept="application/json,.json"]',
    ) as HTMLInputElement;
    const file = new File([JSON.stringify(SAMPLE_BACKUP)], "backup.json", {
      type: "application/json",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Xác nhận thay dữ liệu trên thiết bị" }),
    );

    await waitFor(() => {
      expect(dbMocks.exportBackup).toHaveBeenCalled();
      expect(dbMocks.importBackup).toHaveBeenCalledWith(
        expect.objectContaining({ schemaVersion: 3, exportedAt: SAMPLE_BACKUP.exportedAt }),
      );
    });

    const anchors = downloadSpy.mock.instances as HTMLAnchorElement[];
    const names = anchors.map((a) => a.download).filter(Boolean);
    expect(names.some((n) => String(n).startsWith("ban-sao-luu-truoc-khi-nhap-json-"))).toBe(true);
    expect(names.some((n) => String(n).startsWith("vwce-auto-before-import-"))).toBe(false);
    expect(names.some((n) => String(n) === "ban-sao-luu-truoc-khi-khoi-phuc.json")).toBe(false);

    expect(engineMocks.pushOutbox).not.toHaveBeenCalled();
    downloadSpy.mockRestore();
  });

  it("cancel returns without calling importBackup", async () => {
    renderSettings({ onOpenMigrate: vi.fn() });
    await screen.findByText("Nhập file JSON");

    const fileInput = document.querySelector(
      'input[type="file"][accept="application/json,.json"]',
    ) as HTMLInputElement;
    const file = new File([JSON.stringify(SAMPLE_BACKUP)], "backup.json", {
      type: "application/json",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Quay lại" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(dbMocks.importBackup).not.toHaveBeenCalled();
    expect(dbMocks.exportBackup).not.toHaveBeenCalled();
  });
});
