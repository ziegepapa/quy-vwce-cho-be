// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// Device-recovery backup filename. Must never collide with the JSON-import
// backup filename (ban-sao-luu-truoc-khi-nhap-json-...), which lives in Settings.
const RECOVERY_BACKUP_FILENAME = "ban-sao-luu-truoc-khi-khoi-phuc.json";
const COUNTS = { settings: 1, goals: 1, transactions: 1, annualChecklists: 1, monthlySnapshots: 1, quotes: 0 };

const dbMocks = vi.hoisted(() => ({
  countLocalData: vi.fn(),
  exportBackup: vi.fn(),
  db: {
    transaction: vi.fn(),
    outbox: {},
    syncMeta: {},
    settings: { toArray: vi.fn() },
    goals: { toArray: vi.fn() },
    transactions: { toArray: vi.fn() },
    annualChecklists: { toArray: vi.fn() },
    monthlySnapshots: { toArray: vi.fn() },
  },
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

let clickedDownloads: string[] = [];

function renderWizard(onDone = vi.fn(), onBack = vi.fn()) {
  return render(createElement(MigrateWizard, { userId: "owner-1", onDone, onBack }));
}
async function openConfirmation() {
  fireEvent.click(await screen.findByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" }));
  return screen.findByRole("dialog");
}

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  clickedDownloads = [];
  dbMocks.countLocalData.mockResolvedValue(COUNTS);
  dbMocks.exportBackup.mockResolvedValue({ exportedAt: "2026-08-11T12:00:00Z", schemaVersion: 3, settings: [] });
  dbMocks.db.settings.toArray.mockResolvedValue([{ id: "settings", version: 5 }]);
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
  HTMLAnchorElement.prototype.click = vi.fn(function (this: HTMLAnchorElement) {
    clickedDownloads.push(this.download);
  });
});

describe("iPhone Safari recovery backup handoff", () => {
  it("transitions to the confirmation dialog once anchor.click() succeeds", async () => {
    renderWizard();
    const dialog = await openConfirmation();
    expect(within(dialog).getByRole("button", { name: "Quay lại" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Xác nhận khôi phục dữ liệu" })).toBeTruthy();
    // Backup was handed off with the device-recovery filename, not the import one.
    expect(clickedDownloads).toEqual([RECOVERY_BACKUP_FILENAME]);
    expect(clickedDownloads[0]).not.toContain("nhap-json");
    // Success must not surface the recovery-preparation failure copy.
    expect(screen.queryByText("Chưa thể chuẩn bị dữ liệu để khôi phục. Dữ liệu trên thiết bị vẫn được giữ nguyên.")).toBeNull();
    expect(screen.queryByText("Chưa tạo được bản sao lưu. Dữ liệu trên thiết bị vẫn được giữ nguyên.")).toBeNull();
  });

  it("keeps the confirmation dialog available after a simulated Safari return", async () => {
    renderWizard();
    await openConfirmation();
    // Simulate Safari overlaying its native download prompt and the user returning.
    fireEvent(document, new Event("visibilitychange"));
    fireEvent(window, new Event("pageshow"));
    fireEvent(window, new Event("focus"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Quay lại" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Xác nhận khôi phục dữ liệu" })).toBeTruthy();
    expect(outboxMocks.enqueueRecoveryItem).not.toHaveBeenCalled();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
  });

  it("queues no recover outbox items before explicit confirmation", async () => {
    renderWizard();
    await openConfirmation();
    expect(outboxMocks.enqueueRecoveryItem).not.toHaveBeenCalled();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
    expect(dbMocks.db.transaction).not.toHaveBeenCalled();
  });

  it("'Quay lại' from the dialog queues nothing and leaves local data untouched", async () => {
    renderWizard();
    const dialog = await openConfirmation();
    fireEvent.click(within(dialog).getByRole("button", { name: "Quay lại" }));
    expect(await screen.findByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(outboxMocks.enqueueRecoveryItem).not.toHaveBeenCalled();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
    expect(dbMocks.db.transaction).not.toHaveBeenCalled();
  });

  it("a genuine createObjectURL failure stays on recovery with a retry action", async () => {
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => { throw new Error("blob failed"); });
    renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" }));
    expect(await screen.findByText("Chưa tạo được bản sao lưu. Dữ liệu trên thiết bị vẫn được giữ nguyên.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử tạo bản sao lưu lại" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(outboxMocks.enqueueRecoveryItem).not.toHaveBeenCalled();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
  });

  it("a genuine exportBackup failure stays on recovery with a retry action", async () => {
    dbMocks.exportBackup.mockRejectedValueOnce(new Error("export failed"));
    renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" }));
    expect(await screen.findByText("Chưa tạo được bản sao lưu. Dữ liệu trên thiết bị vẫn được giữ nguyên.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử tạo bản sao lưu lại" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a best-effort revokeObjectURL failure never fails a successful handoff", async () => {
    vi.mocked(URL.revokeObjectURL).mockImplementationOnce(() => { throw new Error("revoke failed"); });
    renderWizard();
    const dialog = await openConfirmation();
    expect(within(dialog).getByRole("button", { name: "Xác nhận khôi phục dữ liệu" })).toBeTruthy();
    expect(screen.queryByText("Chưa tạo được bản sao lưu. Dữ liệu trên thiết bị vẫn được giữ nguyên.")).toBeNull();
    expect(clickedDownloads).toEqual([RECOVERY_BACKUP_FILENAME]);
  });

  it("does not run any recovery sync from the initial recovery screen", async () => {
    renderWizard();
    await screen.findByRole("heading", { name: "Khôi phục dữ liệu trên thiết bị" });
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    expect(outboxMocks.enqueueRecoveryItem).not.toHaveBeenCalled();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
    expect(dbMocks.db.transaction).not.toHaveBeenCalled();
  });
});
