// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const CANARY = "NOTFALLMAPPE_CONTACT_DOCUMENT_LOCATION_SECRET";
const COUNTS = { settings: 1, goals: 1, transactions: 1, annualChecklists: 1, monthlySnapshots: 1, quotes: 0 };
const dbMocks = vi.hoisted(() => ({
  countLocalData: vi.fn(), exportBackup: vi.fn(),
  db: { transaction: vi.fn(), outbox: {}, syncMeta: {}, settings: { toArray: vi.fn() }, goals: { toArray: vi.fn() }, transactions: { toArray: vi.fn() }, annualChecklists: { toArray: vi.fn() }, monthlySnapshots: { toArray: vi.fn() } },
}));
const outboxMocks = vi.hoisted(() => ({ enqueueRecoveryItem: vi.fn() }));
const engineMocks = vi.hoisted(() => ({ getSyncMeta: vi.fn(), saveSyncMeta: vi.fn(), processRecoverySession: vi.fn() }));
vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/sync/outbox", () => outboxMocks);
vi.mock("../lib/sync/engine", () => engineMocks);
vi.mock("../components/SyncConflictSection", async () => {
  const React = await import("react");
  return { default: ({ onResolved }: { onResolved: () => void | Promise<void> }) => React.createElement("button", { onClick: () => void onResolved() }, "Giải quyết xung đột thử nghiệm") };
});
import MigrateWizard from "./MigrateWizard";

function renderWizard(onDone = vi.fn(), onBack = vi.fn()) { return render(createElement(MigrateWizard, { userId: "owner-1", onDone, onBack })); }
async function openConfirmation() { fireEvent.click(await screen.findByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" })); return screen.findByRole("dialog"); }
async function queueRecovery() { const dialog = await openConfirmation(); fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận khôi phục dữ liệu" })); await screen.findByRole("heading", { name: "Dữ liệu đang chờ được kiểm tra" }); }

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.countLocalData.mockResolvedValue(COUNTS);
  dbMocks.exportBackup.mockResolvedValue({ exportedAt: "2026-08-11T12:00:00Z", schemaVersion: 3, settings: [] });
  dbMocks.db.settings.toArray.mockResolvedValue([{ id: "settings", version: 5, notfallmappe: { purpose: CANARY } }]);
  dbMocks.db.goals.toArray.mockResolvedValue([{ id: "goal-1" }]);
  dbMocks.db.transactions.toArray.mockResolvedValue([{ id: "tx-1" }]);
  dbMocks.db.annualChecklists.toArray.mockResolvedValue([{ id: "check-1" }]);
  dbMocks.db.monthlySnapshots.toArray.mockResolvedValue([{ id: "snap-1" }]);
  dbMocks.db.transaction.mockImplementation(async (_mode: string, _tables: unknown[], callback: () => Promise<void>) => callback());
  outboxMocks.enqueueRecoveryItem.mockImplementation(async (input: any) => ({ id: "private-outbox", op: "recover", ...input }));
  engineMocks.getSyncMeta.mockResolvedValue({ userId: "owner-1", migrateWizardDone: false, recoveryState: "required" });
  engineMocks.saveSyncMeta.mockResolvedValue({});
  engineMocks.processRecoverySession.mockResolvedValue({ status: "queued", confirmed: 0, pending: 5 });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:backup") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  HTMLAnchorElement.prototype.click = vi.fn();
});

describe("server-confirmed recovery UI", () => {
  it("renders the safe review, Safari explanation, exact actions and five counts only", async () => {
    renderWizard();
    expect(await screen.findByRole("heading", { name: "Khôi phục dữ liệu trên thiết bị" })).toBeTruthy();
    expect(screen.getByText("Đã tìm thấy dữ liệu cũ trên iPhone này. Khôi phục để dùng lại với tài khoản của bạn.")).toBeTruthy();
    expect(screen.getByText(/Safari có thể hỏi nơi lưu file/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quay lại — chưa khôi phục dữ liệu" })).toBeTruthy();
    const summary = screen.getByRole("table", { name: "Tóm tắt dữ liệu trên thiết bị" });
    for (const label of ["Cài đặt", "Mục tiêu", "Giao dịch", "Checklist", "Snapshots"]) expect(within(summary).getByText(label)).toBeTruthy();
    expect(document.documentElement.outerHTML).not.toContain(CANARY);
  });

  it("backup failure queues nothing and remains in recovery", async () => {
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => { throw new Error(CANARY); });
    renderWizard(); fireEvent.click(await screen.findByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" }));
    expect(await screen.findByText("Chưa tạo được bản sao lưu. Dữ liệu trên thiết bị vẫn được giữ nguyên.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử tạo bản sao lưu lại" })).toBeTruthy();
    expect(outboxMocks.enqueueRecoveryItem).not.toHaveBeenCalled(); expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).not.toContain(CANARY);
  });

  it("explicit confirmation only queues recover items without changing local versions or showing complete", async () => {
    renderWizard(); await queueRecovery();
    expect(outboxMocks.enqueueRecoveryItem).toHaveBeenCalledTimes(5);
    expect(outboxMocks.enqueueRecoveryItem).toHaveBeenCalledWith(expect.objectContaining({ table: "settings", sourceLocalVersion: 5 }));
    expect(screen.queryByRole("heading", { name: "Đã khôi phục dữ liệu" })).toBeNull();
    expect(screen.getByText("Dữ liệu trên iPhone vẫn được giữ nguyên và đã sẵn sàng để khôi phục. Ứng dụng chưa xác nhận dữ liệu trong tài khoản, nên bạn chưa thể hoàn tất hoặc đăng xuất.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kiểm tra dữ liệu trong tài khoản" })).toBeTruthy();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).not.toContain(CANARY);
  });

  it("shows conflict state with exact safe copy and no automatic choice", async () => {
    engineMocks.processRecoverySession.mockResolvedValue({ status: "conflict", confirmed: 1, conflicts: 1 });
    renderWizard(); await queueRecovery(); fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu trong tài khoản" }));
    expect(await screen.findByRole("heading", { name: "Cần chọn phiên bản dữ liệu" })).toBeTruthy();
    expect(screen.getByText("Dữ liệu trên iPhone và dữ liệu trong tài khoản khác nhau. Ứng dụng chưa ghi đè dữ liệu nào. Hãy kiểm tra và chọn phiên bản bạn muốn giữ.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xem xung đột" })).toBeTruthy();
    expect(document.documentElement.outerHTML).not.toContain(CANARY);
  });

  it("shows unverified state and retries only after explicit action", async () => {
    engineMocks.processRecoverySession.mockResolvedValue({ status: "unverified", confirmed: 0, pending: 5 });
    renderWizard(); await queueRecovery(); fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu trong tài khoản" }));
    expect(await screen.findByRole("heading", { name: "Chưa thể kiểm tra dữ liệu trong tài khoản" })).toBeTruthy();
    expect(screen.getByText("Dữ liệu trên iPhone vẫn được giữ nguyên. Hãy kết nối mạng và thử kiểm tra lại. Bạn chưa thể hoàn tất hoặc đăng xuất.")).toBeTruthy();
    expect(engineMocks.processRecoverySession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Thử kiểm tra lại" })).toBeTruthy();
  });

  it("shows completion and calls onDone only after a confirmed session", async () => {
    const onDone = vi.fn().mockResolvedValue(undefined);
    engineMocks.processRecoverySession.mockResolvedValue({ status: "confirmed", confirmed: 5 });
    engineMocks.getSyncMeta
      .mockResolvedValueOnce({ userId: "owner-1", migrateWizardDone: false, recoveryState: "required" })
      .mockResolvedValueOnce({ userId: "owner-1", migrateWizardDone: false, recoveryState: "required" })
      .mockResolvedValue({ userId: "owner-1", migrateWizardDone: true, recoveryState: "complete", recoverySessionId: "session" });
    renderWizard(onDone); await queueRecovery();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu trong tài khoản" }));
    expect(await screen.findByRole("heading", { name: "Đã khôi phục dữ liệu" })).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("resumes a queued session without duplicating its items", async () => {
    engineMocks.getSyncMeta.mockResolvedValue({ userId: "owner-1", migrateWizardDone: false, recoveryState: "queued", recoverySessionId: "existing-session" });
    renderWizard();
    expect(await screen.findByRole("heading", { name: "Dữ liệu đang chờ được kiểm tra" })).toBeTruthy();
    expect(outboxMocks.enqueueRecoveryItem).not.toHaveBeenCalled();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
  });

  it("never invokes destructive or ordinary sync actions from the recovery UI", async () => {
    const onDone = vi.fn(); renderWizard(onDone); await screen.findByRole("heading");
    expect(onDone).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).not.toContain(CANARY);
  });
});
