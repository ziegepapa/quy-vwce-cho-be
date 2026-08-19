// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AppSettings } from "../lib/types";

/**
 * DELETE-TOMBSTONE-BACKUP-001 — cảnh báo phải hiện NGAY trong hộp xác nhận nhập
 * sao lưu, và ba hành động phải chạy đúng. Đây cũng là regression test nguyên văn
 * cho copy tiếng Việt trong khi chờ Owner chụp ảnh trên iPhone.
 *
 * PR3 — câu rủi ro đã đổi: gate bây giờ chặn cả khi việc còn treo là một `upsert`
 * bình thường, nên câu cũ (chỉ nói tới dòng đã xoá sống lại) là thiếu.
 */

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
  useAuth: () => ({ user: { id: "owner-1" }, mfaEnrolled: false }),
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

const FILE_JSON = JSON.stringify({
  schemaVersion: 3,
  exportedAt: "2026-08-14T06:00:00Z",
});

const CONFIRM_LABEL = "Xác nhận nhập";
const ACCEPT_LABEL = "Vẫn nhập (chấp nhận rủi ro)";
const PUSH_FIRST_LABEL = "Đẩy đồng bộ trước";
const WARNING_TITLE = "Còn thay đổi chưa đồng bộ xong";
const RISK_TEXT =
  "Nhập sao lưu sẽ xoá hàng đợi đồng bộ: thay đổi chưa đẩy sẽ mất, và dòng đã xoá có thể xuất hiện lại.";

function blocked(total: number, deletes: number, dead: number) {
  return {
    name: "PendingSyncImportBlockedError",
    message: WARNING_TITLE,
    pendingSync: { total, deletes, dead },
  };
}

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

function renderSettings(onReload = vi.fn()) {
  const view = render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/settings?tab=data"] },
      createElement(SettingsPage, { onReload }),
    ),
  );
  return { ...view, onReload };
}

async function selectBackupFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([FILE_JSON], "backup.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(FILE_JSON) });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText(/Thay dữ liệu bằng file backup\.json\?/);
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getSettings.mockResolvedValue(loadedSettings());
  dbMocks.db.appMetadata.get.mockResolvedValue({ lastBackupAt: "" });
  dbMocks.getOrCreateChecklist.mockResolvedValue({
    year: 2026,
    items: [],
    updatedAt: "2026-08-14T06:00:00Z",
  });
  dbMocks.exportBackup.mockResolvedValue({
    exportedAt: "2026-08-14T06:00:00Z",
    schemaVersion: 3,
  });
  dbMocks.importBackup.mockResolvedValue(undefined);
  dbMocks.listTransactions.mockResolvedValue([]);
  dbMocks.saveSettings.mockResolvedValue(undefined);
  syncMocks.listDeadOutbox.mockResolvedValue([]);
  syncMocks.pushOutbox.mockResolvedValue(undefined);
  syncMocks.reviveDeadOutbox.mockResolvedValue(undefined);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:test"),
  });
  HTMLAnchorElement.prototype.click = vi.fn();
  window.alert = vi.fn();
});

afterEach(() => cleanup());

describe("cảnh báo nhập sao lưu khi còn việc đồng bộ chưa xong", () => {
  it("hiện cảnh báo ngay trong hộp xác nhận và không nhập im lặng", async () => {
    dbMocks.importBackup.mockRejectedValueOnce(blocked(2, 1, 0));
    const { container, onReload } = renderSettings();
    await screen.findByText("Nhập sao lưu");
    await selectBackupFile(container);

    fireEvent.click(screen.getByRole("button", { name: CONFIRM_LABEL }));

    await screen.findByText(WARNING_TITLE);
    expect(
      screen.getByText("Còn 2 việc đồng bộ chưa xong (trong đó 1 việc xoá)."),
    ).toBeTruthy();
    expect(screen.getByText(RISK_TEXT)).toBeTruthy();

    // Hộp xác nhận PHẢI còn mở, và không có gì được nhập.
    expect(screen.getByText(/Thay dữ liệu bằng file backup\.json\?/)).toBeTruthy();
    expect(dbMocks.importBackup).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("hiện đúng cảnh báo khi việc còn treo chỉ là một upsert bình thường (PR3)", async () => {
    dbMocks.importBackup.mockRejectedValueOnce(blocked(1, 0, 0));
    const { container } = renderSettings();
    await screen.findByText("Nhập sao lưu");
    await selectBackupFile(container);

    fireEvent.click(screen.getByRole("button", { name: CONFIRM_LABEL }));

    await screen.findByText(WARNING_TITLE);
    expect(screen.getByText("Còn 1 việc đồng bộ chưa xong.")).toBeTruthy();
    expect(screen.getByText(RISK_TEXT)).toBeTruthy();
    expect(screen.getByRole("button", { name: ACCEPT_LABEL })).toBeTruthy();
  });

  it("đổi nút xác nhận thành nhãn chấp nhận rủi ro và truyền đúng cờ, không tải sao lưu hai lần", async () => {
    dbMocks.importBackup.mockRejectedValueOnce(blocked(1, 1, 0));
    const { container, onReload } = renderSettings();
    await screen.findByText("Nhập sao lưu");
    await selectBackupFile(container);

    fireEvent.click(screen.getByRole("button", { name: CONFIRM_LABEL }));
    await screen.findByText(WARNING_TITLE);

    fireEvent.click(screen.getByRole("button", { name: ACCEPT_LABEL }));

    await waitFor(() => expect(dbMocks.importBackup).toHaveBeenCalledTimes(2));
    expect(dbMocks.importBackup.mock.calls[0]).toHaveLength(1);
    expect(dbMocks.importBackup.mock.calls[1][1]).toEqual({ acceptPendingSyncRisk: true });
    expect(dbMocks.exportBackup).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Nhập backup thành công"),
    );
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
  });

  it("đẩy đồng bộ trước: gọi đúng engine, xoá cảnh báo và không nhập gì", async () => {
    dbMocks.importBackup.mockRejectedValueOnce(blocked(1, 1, 0));
    const { container, onReload } = renderSettings();
    await screen.findByText("Nhập sao lưu");
    await selectBackupFile(container);

    fireEvent.click(screen.getByRole("button", { name: CONFIRM_LABEL }));
    await screen.findByText(WARNING_TITLE);

    fireEvent.click(screen.getByRole("button", { name: PUSH_FIRST_LABEL }));

    await waitFor(() => expect(syncMocks.pushOutbox).toHaveBeenCalledWith("owner-1"));
    expect(syncMocks.reviveDeadOutbox).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText(WARNING_TITLE)).toBeNull());
    expect(screen.getByRole("button", { name: CONFIRM_LABEL })).toBeTruthy();
    expect(dbMocks.importBackup).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
  });

  it("báo lỗi rõ khi đẩy đồng bộ thất bại, không làm lọ thông tin kỹ thuật", async () => {
    dbMocks.importBackup.mockRejectedValueOnce(blocked(1, 1, 0));
    syncMocks.pushOutbox.mockRejectedValueOnce(new Error("PUSH_SECRET_CANARY"));
    const { container } = renderSettings();
    await screen.findByText("Nhập sao lưu");
    await selectBackupFile(container);

    fireEvent.click(screen.getByRole("button", { name: CONFIRM_LABEL }));
    await screen.findByText(WARNING_TITLE);

    fireEvent.click(screen.getByRole("button", { name: PUSH_FIRST_LABEL }));

    await screen.findByText(
      "Không đẩy được các thay đổi đang chờ. Dữ liệu trên thiết bị vẫn được giữ nguyên.",
    );
    expect(document.body.innerHTML).not.toContain("PUSH_SECRET_CANARY");
    // Cảnh báo PHẢI còn đó vì việc xoá vẫn chưa lên được máy chủ.
    expect(screen.getByText(WARNING_TITLE)).toBeTruthy();
    expect(screen.getByRole("button", { name: ACCEPT_LABEL })).toBeTruthy();
  });

  it("luồng bình thường không đổi khi không còn việc đồng bộ treo", async () => {
    const { container, onReload } = renderSettings();
    await screen.findByText("Nhập sao lưu");
    await selectBackupFile(container);

    fireEvent.click(screen.getByRole("button", { name: CONFIRM_LABEL }));

    await waitFor(() => expect(dbMocks.importBackup).toHaveBeenCalledTimes(1));
    expect(dbMocks.importBackup.mock.calls[0]).toHaveLength(1);
    expect(screen.queryByText(WARNING_TITLE)).toBeNull();
    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("Nhập backup thành công"),
    );
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
  });
});
