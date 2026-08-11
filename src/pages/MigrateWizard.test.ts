// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const CANARY = "NOTFALLMAPPE_CONTACT_DOCUMENT_LOCATION_SECRET";
const COUNTS = { settings: 1, goals: 1, transactions: 1, annualChecklists: 1, monthlySnapshots: 1, quotes: 0 };

const dbMocks = vi.hoisted(() => ({
  countLocalData: vi.fn(), exportBackup: vi.fn(),
  db: {
    transaction: vi.fn(), outbox: {},
    settings: { toArray: vi.fn(), put: vi.fn() },
    goals: { toArray: vi.fn(), put: vi.fn() },
    transactions: { toArray: vi.fn(), put: vi.fn() },
    annualChecklists: { toArray: vi.fn(), put: vi.fn() },
    monthlySnapshots: { toArray: vi.fn(), put: vi.fn() },
  },
}));
const outboxMocks = vi.hoisted(() => ({ enqueueOutbox: vi.fn(), outboxCount: vi.fn() }));
const engineMocks = vi.hoisted(() => ({ listConflicts: vi.fn(), listDeadOutbox: vi.fn() }));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/sync/outbox", () => outboxMocks);
vi.mock("../lib/sync/engine", () => engineMocks);

import MigrateWizard from "./MigrateWizard";

function renderWizard(onDone = vi.fn(), onBack = vi.fn()) {
  return render(createElement(MigrateWizard, { userId: "owner-1", onDone, onBack }));
}

async function openConfirmation() {
  fireEvent.click(await screen.findByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" }));
  return screen.findByRole("dialog");
}

async function confirmRecovery() {
  const dialog = await openConfirmation();
  fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận khôi phục dữ liệu" }));
}

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.countLocalData.mockResolvedValue(COUNTS);
  dbMocks.exportBackup.mockResolvedValue({ exportedAt: "2026-08-11T12:00:00.000Z", schemaVersion: 3, settings: [] });
  dbMocks.db.settings.toArray.mockResolvedValue([{ id: "settings", version: 5, notfallmappe: { purpose: CANARY } }]);
  dbMocks.db.goals.toArray.mockResolvedValue([{ id: "goal-1" }]);
  dbMocks.db.transactions.toArray.mockResolvedValue([{ id: "tx-1" }]);
  dbMocks.db.annualChecklists.toArray.mockResolvedValue([{ id: "check-1" }]);
  dbMocks.db.monthlySnapshots.toArray.mockResolvedValue([{ id: "snap-1" }]);
  for (const table of [dbMocks.db.settings, dbMocks.db.goals, dbMocks.db.transactions, dbMocks.db.annualChecklists, dbMocks.db.monthlySnapshots]) {
    table.put.mockResolvedValue(undefined);
  }
  dbMocks.db.transaction.mockImplementation(async (_mode: string, _tables: unknown[], callback: () => Promise<void>) => callback());
  outboxMocks.enqueueOutbox.mockResolvedValue(undefined);
  outboxMocks.outboxCount.mockResolvedValue(5);
  engineMocks.listDeadOutbox.mockResolvedValue([]);
  engineMocks.listConflicts.mockResolvedValue([]);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:backup") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  HTMLAnchorElement.prototype.click = vi.fn();
});

describe("complete recovery journey", () => {
  it("renders exact iPhone copy, primary/secondary actions, and only five safe counts", async () => {
    renderWizard();
    expect(await screen.findByRole("heading", { name: "Khôi phục dữ liệu trên thiết bị" })).toBeTruthy();
    expect(screen.getByText("Đã tìm thấy dữ liệu cũ trên iPhone này. Khôi phục để dùng lại với tài khoản của bạn.")).toBeTruthy();
    expect(screen.getByText("Để an toàn, ứng dụng sẽ tạo một bản sao lưu trên iPhone trước khi khôi phục. Safari có thể hỏi nơi lưu file. Hãy chọn ‘Tải về’." )).toBeTruthy();
    expect(screen.getByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quay lại — chưa khôi phục dữ liệu" })).toBeTruthy();
    const summary = screen.getByRole("table", { name: "Tóm tắt dữ liệu trên thiết bị" });
    for (const label of ["Cài đặt", "Mục tiêu", "Giao dịch", "Checklist", "Snapshots"]) {
      expect(within(summary).getByText(label)).toBeTruthy();
    }
    expect(document.documentElement.outerHTML).not.toContain(CANARY);
    expect(document.body.textContent).not.toMatch(/Vốn đã đóng|VWCE SL|Khoảng giao dịch/);
  });

  it("initiates a friendly backup before showing the explicit in-app dialog", async () => {
    const dialog = await openConfirmation();
    expect(dbMocks.exportBackup).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("heading", { name: "Khôi phục dữ liệu vào tài khoản?" })).toBeTruthy();
    expect(within(dialog).getByText("Dữ liệu tìm thấy trên iPhone sẽ được đưa vào tài khoản này. Nếu bản trên server khác, ứng dụng sẽ dừng để hỏi bạn; không tự ghi đè dữ liệu.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Quay lại" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Xác nhận khôi phục dữ liệu" })).toBeTruthy();
    expect(outboxMocks.enqueueOutbox).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).not.toContain(CANARY);
  });

  it("backup failure remains on recovery, uses fixed copy, and offers retry without import", async () => {
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => { throw new Error(`browser ${CANARY}`); });
    renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" }));
    expect(await screen.findByText("Chưa tạo được bản sao lưu. Dữ liệu trên thiết bị vẫn được giữ nguyên.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử tạo bản sao lưu lại" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(outboxMocks.enqueueOutbox).not.toHaveBeenCalled();
    expect(dbMocks.db.transaction).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).not.toContain(CANARY);
  });

  it("Quay lại from confirmation performs no import or completion", async () => {
    const onDone = vi.fn();
    renderWizard(onDone);
    const dialog = await openConfirmation();
    fireEvent.click(within(dialog).getByRole("button", { name: "Quay lại" }));
    expect(screen.getByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" })).toBeTruthy();
    expect(outboxMocks.enqueueOutbox).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("queues all local rows atomically with version guards and never auto syncs", async () => {
    const onDone = vi.fn();
    renderWizard(onDone);
    await confirmRecovery();
    expect(await screen.findByRole("heading", { name: "Đã khôi phục dữ liệu" })).toBeTruthy();
    expect(dbMocks.db.transaction).toHaveBeenCalledTimes(1);
    expect(outboxMocks.enqueueOutbox).toHaveBeenCalledTimes(5);
    expect(outboxMocks.enqueueOutbox).toHaveBeenCalledWith(
      "settings", "settings", "upsert", expect.objectContaining({ version: 6 }), 6,
      { expectedRemoteVersion: 5 },
    );
    for (const call of outboxMocks.enqueueOutbox.mock.calls) {
      expect(call[5]).toEqual(expect.objectContaining({ expectedRemoteVersion: expect.any(Number) }));
    }
    expect(onDone).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).not.toContain(CANARY);
  });

  it("shows completion and pending-sync copy, then checks data only after explicit CTA", async () => {
    const onDone = vi.fn().mockResolvedValue(undefined);
    renderWizard(onDone);
    await confirmRecovery();
    expect(await screen.findByText("Dữ liệu trên thiết bị đã được đưa vào tài khoản. Hãy kiểm tra Cài đặt → Dữ liệu trước khi đăng xuất.")).toBeTruthy();
    expect(screen.getByText("Cần hoàn tất đồng bộ trước khi đăng xuất.")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("secondary action preserves local data and recovery requirement", async () => {
    const onDone = vi.fn();
    const onBack = vi.fn();
    renderWizard(onDone, onBack);
    fireEvent.click(await screen.findByRole("button", { name: "Quay lại — chưa khôi phục dữ liệu" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(outboxMocks.enqueueOutbox).not.toHaveBeenCalled();
    expect(dbMocks.db.transaction).not.toHaveBeenCalled();
    expect(screen.getByText("Dữ liệu trên thiết bị vẫn được giữ nguyên và sẽ chờ bạn khôi phục.")).toBeTruthy();
  });
});
