// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

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
    outbox: { toArray: vi.fn() },
    syncMeta: {},
    settings: { toArray: vi.fn() },
    goals: { toArray: vi.fn() },
    transactions: { toArray: vi.fn() },
    annualChecklists: { toArray: vi.fn() },
    monthlySnapshots: { toArray: vi.fn() },
  },
}));
const outboxMocks = vi.hoisted(() => ({ enqueueRecoveryItem: vi.fn() }));
const engineMocks = vi.hoisted(() => ({
  getSyncMeta: vi.fn(),
  saveSyncMeta: vi.fn(),
  processRecoverySession: vi.fn(),
  fetchCurrentRemote: vi.fn(),
}));
vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/sync/outbox", () => outboxMocks);
vi.mock("../lib/sync/engine", () => engineMocks);
vi.mock("../components/SyncConflictSection", async () => {
  const React = await import("react");
  return { default: ({ onResolved }: { onResolved: () => void | Promise<void> }) => React.createElement("button", { onClick: () => void onResolved() }, "Giải quyết xung đột thử nghiệm") };
});
import MigrateWizard from "./MigrateWizard";

// The real collision path never has a recoverySessionId: the confirmRestore
// transaction (which includes saveSyncMeta) rolls back. Every collision test
// uses REQUIRED_META with NO recoverySessionId and asserts no session/meta is
// created. No QUEUED_SESSION_META is injected anywhere.
const REQUIRED_META = { userId: "owner-1", migrateWizardDone: false, recoveryState: "required" as const };

let clickedDownloads: string[] = [];

function renderWizard(onDone = vi.fn(), onBack = vi.fn()) {
  return render(createElement(MigrateWizard, { userId: "owner-1", onDone, onBack }));
}
async function openConfirmation() {
  fireEvent.click(await screen.findByRole("button", { name: /Khôi phục dữ liệu trên thiết bị/ }));
  return screen.findByRole("dialog");
}
async function confirmAndReach(name: RegExp) {
  const dialog = await openConfirmation();
  fireEvent.click(within(dialog).getByRole("button", { name: /Xác nhận khôi phục dữ liệu/ }));
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
  dbMocks.db.outbox.toArray.mockResolvedValue([]);
  dbMocks.db.transaction.mockImplementation(async (_mode: string, _tables: unknown[], callback: () => Promise<void>) => callback());
  outboxMocks.enqueueRecoveryItem.mockImplementation(async (input: any) => ({ id: "private-outbox", op: "recover", ...input }));
  engineMocks.getSyncMeta.mockResolvedValue(REQUIRED_META);
  engineMocks.saveSyncMeta.mockResolvedValue({});
  engineMocks.processRecoverySession.mockResolvedValue({ status: "queued", confirmed: 0, pending: 5 });
  engineMocks.fetchCurrentRemote.mockResolvedValue({ state: "unavailable", reason: "unavailable" });
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
    expect(within(dialog).getByRole("button", { name: /^Quay lại$/ })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Xác nhận khôi phục dữ liệu/ })).toBeTruthy();
    expect(clickedDownloads).toEqual([RECOVERY_BACKUP_FILENAME]);
    expect(clickedDownloads[0]).not.toContain("nhap-json");
    expect(screen.queryByText(/Chưa thể chuẩn bị dữ liệu để khôi phục/)).toBeNull();
    expect(screen.queryByText(/Chưa tạo được bản sao lưu/)).toBeNull();
  });

  it("keeps the confirmation dialog available after a simulated Safari return", async () => {
    renderWizard();
    await openConfirmation();
    fireEvent(document, new Event("visibilitychange"));
    fireEvent(window, new Event("pageshow"));
    fireEvent(window, new Event("focus"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /^Quay lại$/ })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Xác nhận khôi phục dữ liệu/ })).toBeTruthy();
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

  it("back from the dialog queues nothing and leaves local data untouched", async () => {
    renderWizard();
    const dialog = await openConfirmation();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Quay lại$/ }));
    expect(await screen.findByRole("button", { name: /Khôi phục dữ liệu trên thiết bị/ })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(outboxMocks.enqueueRecoveryItem).not.toHaveBeenCalled();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
    expect(dbMocks.db.transaction).not.toHaveBeenCalled();
  });

  it("a genuine createObjectURL failure stays on recovery with a retry action", async () => {
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => { throw new Error("blob failed"); });
    renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: /Khôi phục dữ liệu trên thiết bị/ }));
    expect(await screen.findByText(/Chưa tạo được bản sao lưu/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Thử tạo bản sao lưu lại/ })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(outboxMocks.enqueueRecoveryItem).not.toHaveBeenCalled();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
  });

  it("a genuine exportBackup failure stays on recovery with a retry action", async () => {
    dbMocks.exportBackup.mockRejectedValueOnce(new Error("export failed"));
    renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: /Khôi phục dữ liệu trên thiết bị/ }));
    expect(await screen.findByText(/Chưa tạo được bản sao lưu/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Thử tạo bản sao lưu lại/ })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a best-effort revokeObjectURL failure never fails a successful handoff", async () => {
    vi.mocked(URL.revokeObjectURL).mockImplementationOnce(() => { throw new Error("revoke failed"); });
    renderWizard();
    const dialog = await openConfirmation();
    expect(within(dialog).getByRole("button", { name: /Xác nhận khôi phục dữ liệu/ })).toBeTruthy();
    expect(screen.queryByText(/Chưa tạo được bản sao lưu/)).toBeNull();
    expect(clickedDownloads).toEqual([RECOVERY_BACKUP_FILENAME]);
  });

  it("does not run any recovery sync from the initial recovery screen", async () => {
    renderWizard();
    await screen.findByRole("button", { name: /Khôi phục dữ liệu trên thiết bị/ });
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    expect(outboxMocks.enqueueRecoveryItem).not.toHaveBeenCalled();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
    expect(dbMocks.db.transaction).not.toHaveBeenCalled();
  });
});

describe("recovery preparation blocked by a prior ordinary outbox item (real no-session path)", () => {
  // A pre-existing ORDINARY outbox item for settings. enqueueRecoveryItem
  // rejects, the confirmRestore transaction rolls back, and NO recovery session
  // or recover items are created.
  const ORDINARY_SETTINGS_ITEM = {
    id: "ob-settings-1",
    table: "settings",
    entityId: "settings",
    op: "upsert" as const,
    payload: { id: "settings", version: 5, notfallmappe: { purpose: CANARY } },
    version: 5,
    createdAt: "2026-08-10T00:00:00Z",
    attempts: 0,
  };

  beforeEach(() => {
    blockSettingsWithOrdinaryOutbox();
    engineMocks.getSyncMeta.mockResolvedValue(REQUIRED_META); // never a session
    dbMocks.db.outbox.toArray.mockResolvedValue([ORDINARY_SETTINGS_ITEM]);
  });

  it("routes to the safe account-check state with exact copy and creates no session", async () => {
    renderWizard();
    expect(await confirmAndReach(/Cần kiểm tra dữ liệu trong tài khoản/)).toBeTruthy();
    expect(screen.getByText(/Ứng dụng phát hiện thay đổi trước đó đang chờ được xác minh/)).toBeTruthy();
    expect(screen.getByText(/chưa có dữ liệu nào bị ghi đè/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Kiểm tra dữ liệu trong tài khoản/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Quay lại.*chưa khôi phục dữ liệu/ })).toBeTruthy();
    expect(screen.queryByText(/Chưa thể chuẩn bị dữ liệu để khôi phục/)).toBeNull();
    // Transaction rolled back: NO session, NO meta write, NO verification yet.
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    expect(engineMocks.fetchCurrentRemote).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).not.toContain("Recovery queue blocked");
    expect(document.documentElement.outerHTML).not.toContain(CANARY);
  });

  it("never deletes/replaces the ordinary item and creates no duplicate recover item", async () => {
    renderWizard();
    await confirmAndReach(/Cần kiểm tra dữ liệu trong tài khoản/);
    // Blocked settings enqueue attempted exactly once and rejected; the aborted
    // transaction persisted nothing. The component only ever calls
    // enqueueRecoveryItem, so it cannot delete/replace/merge the ordinary item.
    expect(outboxMocks.enqueueRecoveryItem).toHaveBeenCalledTimes(1);
    expect(outboxMocks.enqueueRecoveryItem).toHaveBeenCalledWith(expect.objectContaining({ table: "settings", entityId: "settings" }));
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
  });

  it("primary action verifies read-only and reports a safe no-op when the cloud is exact", async () => {
    engineMocks.fetchCurrentRemote.mockResolvedValue({
      state: "present",
      data: { id: "settings", version: 5, notfallmappe: { purpose: CANARY } },
      version: 5, updatedAt: "2026-08-10T00:00:00Z", deletedAt: null,
    });
    const onDone = vi.fn().mockResolvedValue(undefined);
    renderWizard(onDone);
    await confirmAndReach(/Cần kiểm tra dữ liệu trong tài khoản/);
    fireEvent.click(screen.getByRole("button", { name: /Kiểm tra dữ liệu trong tài khoản/ }));
    expect(await screen.findByRole("heading", { name: /Dữ liệu đã khớp với tài khoản/ })).toBeTruthy();
    // Real read-only verification of the pending ordinary item; no session.
    expect(engineMocks.fetchCurrentRemote).toHaveBeenCalledWith("owner-1", "settings", "settings");
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    // No mutation of any kind; the gate is never released.
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
    expect(outboxMocks.enqueueRecoveryItem).toHaveBeenCalledTimes(1); // only the blocked settings attempt
    expect(onDone).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).not.toContain(CANARY);
  });

  it("primary action routes to the conflict flow when the cloud data diverges", async () => {
    engineMocks.fetchCurrentRemote.mockResolvedValue({
      state: "present",
      data: { id: "settings", version: 9, notfallmappe: { purpose: "different-cloud-value" } },
      version: 9, updatedAt: "2026-08-11T00:00:00Z", deletedAt: null,
    });
    renderWizard();
    await confirmAndReach(/Cần kiểm tra dữ liệu trong tài khoản/);
    fireEvent.click(screen.getByRole("button", { name: /Kiểm tra dữ liệu trong tài khoản/ }));
    expect(await screen.findByRole("heading", { name: /Cần chọn phiên bản dữ liệu/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Xem xung đột/ })).toBeTruthy();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
  });

  it("primary action routes to the conflict flow when the cloud has a tombstone", async () => {
    engineMocks.fetchCurrentRemote.mockResolvedValue({
      state: "deleted", data: null, version: 7, updatedAt: "2026-08-11T00:00:00Z", deletedAt: "2026-08-11T00:00:00Z",
    });
    renderWizard();
    await confirmAndReach(/Cần kiểm tra dữ liệu trong tài khoản/);
    fireEvent.click(screen.getByRole("button", { name: /Kiểm tra dữ liệu trong tài khoản/ }));
    expect(await screen.findByRole("heading", { name: /Cần chọn phiên bản dữ liệu/ })).toBeTruthy();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
  });

  it("primary action stays retry-only when the account is unavailable, and re-verifies on retry", async () => {
    engineMocks.fetchCurrentRemote.mockResolvedValue({ state: "unavailable", reason: "unavailable" });
    renderWizard();
    await confirmAndReach(/Cần kiểm tra dữ liệu trong tài khoản/);
    fireEvent.click(screen.getByRole("button", { name: /Kiểm tra dữ liệu trong tài khoản/ }));
    // Stays on account-check (real retry re-runs verification); no fictional session.
    expect(await screen.findByText(/Chưa thể kiểm tra dữ liệu trong tài khoản lúc này/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Cần kiểm tra dữ liệu trong tài khoản/ })).toBeTruthy();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
    // Retry: a second click re-runs real verification (not a no-session loop).
    engineMocks.fetchCurrentRemote.mockResolvedValue({
      state: "present", data: { id: "settings", version: 5, notfallmappe: { purpose: CANARY } }, version: 5, updatedAt: "x", deletedAt: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /Kiểm tra dữ liệu trong tài khoản/ }));
    expect(await screen.findByRole("heading", { name: /Dữ liệu đã khớp với tài khoản/ })).toBeTruthy();
    expect(engineMocks.fetchCurrentRemote).toHaveBeenCalledTimes(2);
  });

  it("back from account-check retains data and queues nothing", async () => {
    const onBack = vi.fn();
    renderWizard(vi.fn(), onBack);
    await confirmAndReach(/Cần kiểm tra dữ liệu trong tài khoản/);
    fireEvent.click(screen.getByRole("button", { name: /Quay lại.*chưa khôi phục dữ liệu/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: /Khôi phục dữ liệu trên thiết bị/ })).toBeTruthy();
    expect(engineMocks.processRecoverySession).not.toHaveBeenCalled();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
    expect(engineMocks.fetchCurrentRemote).not.toHaveBeenCalled();
  });
});

describe("recovery preparation failure that is not an ordinary-outbox collision", () => {
  it("keeps the generic safe fallback and offers an idempotent retry", async () => {
    let settingsAttempts = 0;
    outboxMocks.enqueueRecoveryItem.mockImplementation(async (input: any) => {
      if (input.table === "settings") {
        settingsAttempts += 1;
        if (settingsAttempts === 1) throw new Error("temporary preparation failure");
      }
      return { id: "private-outbox", op: "recover", ...input };
    });
    renderWizard();
    const dialog = await openConfirmation();
    fireEvent.click(within(dialog).getByRole("button", { name: /Xác nhận khôi phục dữ liệu/ }));
    expect(await screen.findByText(/Chưa thể chuẩn bị dữ liệu để khôi phục/)).toBeTruthy();
    const retry = screen.getByRole("button", { name: /Thử chuẩn bị lại/ });
    expect(document.documentElement.outerHTML).not.toContain("temporary preparation failure");
    expect(document.documentElement.outerHTML).not.toContain("Recovery queue blocked");
    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { name: /Dữ liệu đang chờ được kiểm tra/ })).toBeTruthy();
    expect(outboxMocks.enqueueRecoveryItem).toHaveBeenCalledWith(expect.objectContaining({ table: "settings", entityId: "settings" }));
    expect(engineMocks.saveSyncMeta).toHaveBeenCalledTimes(1);
  });
});
