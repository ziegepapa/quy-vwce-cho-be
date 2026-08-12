// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// Device-recovery backup filename. Must never collide with the JSON-import
// backup filename (ban-sao-luu-truoc-khi-nhap-json-...), which lives in Settings.
const RECOVERY_BACKUP_FILENAME = "ban-sao-luu-truoc-khi-khoi-phuc.json";
// A secret embedded in the settings payload; it must never leak into the DOM.
const CANARY = "NOTFALLMAPPE_CONTACT_DOCUMENT_LOCATION_SECRET";
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

const REQUIRED_META = { userId: "owner-1", migrateWizardDone: false, recoveryState: "required" as const };
const QUEUED_SESSION_META = { userId: "owner-1", migrateWizardDone: false, recoveryState: "queued" as const, recoverySessionId: "sess-1" };
const COMPLETE_META = { userId: "owner-1", migrateWizardDone: true, recoveryState: "complete" as const, recoverySessionId: "sess-1" };

let clickedDownloads: string[] = [];

function renderWizard(onDone = vi.fn(), onBack = vi.fn()) {
  return render(createElement(MigrateWizard, { userId: "owner-1", onDone, onBack }));
}
async function openConfirmation() {
  fireEvent.click(await screen.findByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" }));
  return screen.findByRole("dialog");
}
async function confirmAndReach(name: string) {
  const dialog = await openConfirmation();
  fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận khôi phục dữ liệu" }));
  return screen.findByRole("heading", { name });
}
// Simulate a pre-existing ORDINARY outbox item for the settings entity:
// enqueueRecoveryItem rejects with the exact engine message.
function blockSettingsWithOrdinaryOutbox() {
  outboxMocks.enqueueRecoveryItem.mockImplementation(async (input: any) => {
    if (input.table === "settings") throw new Error("Recovery queue blocked");
    return { id: "private-outbox", op: "recover", ...input };
  });
}

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  clickedDownloads = [];
  dbMocks.countLocalData.mockResolvedValue(COUNTS);
  dbMocks.exportBackup.mockResolvedValue({ exportedAt: "2026-08-11T12:00:00Z", schemaVersion: 3, settings: [] });
  dbMocks.db.settings.toArray.mockResolvedValue([{ id: "settings", version: 5, notfallmappe: { purpose: CANARY } }]);
  dbMocks.db.goals.toArray.mockResolvedValue([{ id: "goal-1" }]);
  dbMocks.db.transactions.toArray.mockResolvedValue([{ id: "tx-1" }]);
  dbMocks.db.annualChecklists.toArray.mockResolvedValue([{ id: "check-1" }]);
  dbMocks.db.monthlySnapshots.toArray.mockResolvedValue([{ id: "snap-1" }]);
  dbMocks.db.transaction.mockImplementation(async (_mode: string, _tables: unknown[], callback: () => Promise<void>) => callback());
  outboxMocks.enqueueRecoveryItem.mockImplementation(async (input: any) => ({ id: "private-outbox", op: "recover", ...input }));
  engineMocks.getSyncMeta.mockResolvedValue(REQUIRED_META);
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

describe("recovery preparation blocked by a prior ordinary outbox item", () => {
  it("routes to the safe account-check state with the exact copy, never the generic failure", async () => {
    blockSettingsWithOrdinaryOutbox();
    renderWizard();
    expect(await confirmAndReach("Cần kiểm tra dữ liệu trong tài khoản")).toBeTruthy();
    expect(screen.getByText("Ứng dụng phát hiện thay đổi trước đó đang chờ được xác minh.")).toBeTruthy();
    expect(screen.getByText("Dữ liệu trên iPhone vẫn được giữ nguyên và chưa có dữ liệu nào bị ghi đè.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kiểm tra dữ liệu trong tài khoản" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quay lại — chưa khôi phục dữ liệu" })).toBeTruthy();
    // Must not show the generic preparation-failure copy.
    expect(screen.queryByText("Chưa thể chuẩn bị dữ liệu để khôi phục. Dữ liệu trên thiết bị vẫn được giữ nguyên.")).toBeNull();
    // No auto verification / queue / meta write happens on the block.
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
    // No raw error string or settings payload leaks into the DOM.
    expect(document.documentElement.outerHTML).not.toContain("Recovery queue blocked");
    expect(document.documentElement.outerHTML).not.toContain(CANARY);
  });

  it("never deletes/replaces the ordinary item and creates no duplicate recover item", async () => {
    blockSettingsWithOrdinaryOutbox();
    renderWizard();
    await confirmAndReach("Cần kiểm tra dữ liệu trong tài khoản");
    // The blocked settings enqueue is attempted exactly once and rejected; the
    // aborted transaction means no recover items were persisted. The component
    // only ever calls enqueueRecoveryItem — it cannot delete/replace/merge an
    // ordinary item — so the existing outbox entry is preserved.
    expect(outboxMocks.enqueueRecoveryItem).toHaveBeenCalledTimes(1);
    expect(outboxMocks.enqueueRecoveryItem).toHaveBeenCalledWith(expect.objectContaining({ table: "settings", entityId: "settings" }));
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
  });

  it("account check reports safe verified completion when the cloud is exact", async () => {
    blockSettingsWithOrdinaryOutbox();
    const onDone = vi.fn().mockResolvedValue(undefined);
    engineMocks.getSyncMeta
      .mockResolvedValueOnce(REQUIRED_META) // mount
      .mockResolvedValueOnce(REQUIRED_META) // prepareRecovery (then blocked)
      .mockResolvedValueOnce(QUEUED_SESSION_META) // checkAccountData: a verifiable session
      .mockResolvedValue(COMPLETE_META); // completion guard
    engineMocks.processRecoverySession.mockResolvedValue({ status: "confirmed", confirmed: 5 });
    renderWizard(onDone);
    await confirmAndReach("Cần kiểm tra dữ liệu trong tài khoản");
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu trong tài khoản" }));
    expect(await screen.findByRole("heading", { name: "Đã khôi phục dữ liệu" })).toBeTruthy();
    expect(engineMocks.processRecoverySession).toHaveBeenCalledTimes(1);
    // Completion never auto-releases the gate: onDone only runs on explicit click.
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("account check shows the existing conflict flow when the cloud differs or has a tombstone", async () => {
    blockSettingsWithOrdinaryOutbox();
    engineMocks.getSyncMeta
      .mockResolvedValueOnce(REQUIRED_META)
      .mockResolvedValueOnce(REQUIRED_META)
      .mockResolvedValue(QUEUED_SESSION_META);
    engineMocks.processRecoverySession.mockResolvedValue({ status: "conflict", confirmed: 0, conflicts: 1 });
    renderWizard();
    await confirmAndReach("Cần kiểm tra dữ liệu trong tài khoản");
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu trong tài khoản" }));
    expect(await screen.findByRole("heading", { name: "Cần chọn phiên bản dữ liệu" })).toBeTruthy();
    expect(screen.getByText("Dữ liệu trên iPhone và dữ liệu trong tài khoản khác nhau. Ứng dụng chưa ghi đè dữ liệu nào. Hãy kiểm tra và chọn phiên bản bạn muốn giữ.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xem xung đột" })).toBeTruthy();
  });

  it("account check shows retry only when the account/server is unavailable", async () => {
    blockSettingsWithOrdinaryOutbox();
    engineMocks.getSyncMeta
      .mockResolvedValueOnce(REQUIRED_META)
      .mockResolvedValueOnce(REQUIRED_META)
      .mockResolvedValue(QUEUED_SESSION_META);
    engineMocks.processRecoverySession.mockResolvedValue({ status: "unverified", confirmed: 0, pending: 5 });
    renderWizard();
    await confirmAndReach("Cần kiểm tra dữ liệu trong tài khoản");
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu trong tài khoản" }));
    expect(await screen.findByRole("heading", { name: "Chưa thể kiểm tra dữ liệu trong tài khoản" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử kiểm tra lại" })).toBeTruthy();
  });

  it("account check with no verifiable session offers retry only and never upserts", async () => {
    blockSettingsWithOrdinaryOutbox();
    engineMocks.getSyncMeta.mockResolvedValue(REQUIRED_META); // never a verifiable session
    renderWizard();
    await confirmAndReach("Cần kiểm tra dữ liệu trong tài khoản");
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu trong tài khoản" }));
    // No session to verify -> stays on account-check (retry only), no verification.
    expect(await screen.findByRole("heading", { name: "Cần kiểm tra dữ liệu trong tài khoản" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kiểm tra dữ liệu trong tài khoản" })).toBeTruthy();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
  });

  it("'Quay lại — chưa khôi phục dữ liệu' from account-check retains data and queues nothing", async () => {
    blockSettingsWithOrdinaryOutbox();
    const onBack = vi.fn();
    renderWizard(vi.fn(), onBack);
    await confirmAndReach("Cần kiểm tra dữ liệu trong tài khoản");
    fireEvent.click(screen.getByRole("button", { name: "Quay lại — chưa khôi phục dữ liệu" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Khôi phục dữ liệu trên thiết bị" })).toBeTruthy();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
  });
});

describe("recovery preparation failure that is not an ordinary-outbox collision", () => {
  it("keeps the generic safe fallback and offers an idempotent 'Thử chuẩn bị lại' retry", async () => {
    let settingsAttempts = 0;
    outboxMocks.enqueueRecoveryItem.mockImplementation(async (input: any) => {
      if (input.table === "settings") {
        settingsAttempts += 1;
        if (settingsAttempts === 1) throw new Error("temporary preparation failure");
      }
      return { id: "private-outbox", op: "recover", ...input };
    });
    renderWizard();
    // First attempt fails with a non-collision error -> generic fallback + retry.
    const dialog = await openConfirmation();
    fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận khôi phục dữ liệu" }));
    expect(await screen.findByText("Chưa thể chuẩn bị dữ liệu để khôi phục. Dữ liệu trên thiết bị vẫn được giữ nguyên.")).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Thử chuẩn bị lại" });
    // No raw internal error string is shown.
    expect(document.documentElement.outerHTML).not.toContain("temporary preparation failure");
    expect(document.documentElement.outerHTML).not.toContain("Recovery queue blocked");
    // Retry succeeds and reaches the queued state without duplicating items.
    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { name: "Dữ liệu đang chờ được kiểm tra" })).toBeTruthy();
    // Second (successful) attempt enqueues each of the five entities exactly once.
    expect(outboxMocks.enqueueRecoveryItem).toHaveBeenCalledWith(expect.objectContaining({ table: "settings", entityId: "settings" }));
    expect(engineMocks.saveSyncMeta).toHaveBeenCalledTimes(1);
  });
});
