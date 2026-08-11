// @vitest-environment jsdom
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ConflictRecord, OutboxItem, ResolveConflictResult } from "../lib/sync/types";

const engineMocks = vi.hoisted(() => ({
  listConflicts: vi.fn(),
  resolveConflict: vi.fn(),
  listDeadOutbox: vi.fn(),
  pushOutbox: vi.fn(),
  reviveDeadOutbox: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  clearAllData: vi.fn(),
  exportBackup: vi.fn(),
  getOrCreateChecklist: vi.fn(),
  getSettings: vi.fn(),
  importBackup: vi.fn(),
  listTransactions: vi.fn(),
  saveSettings: vi.fn(),
  metadataGet: vi.fn(),
  checklistPut: vi.fn(),
}));

vi.mock("../lib/sync/engine", () => engineMocks);
vi.mock("../lib/db", () => ({
  clearAllData: dbMocks.clearAllData,
  db: {
    appMetadata: { get: dbMocks.metadataGet },
    annualChecklists: { put: dbMocks.checklistPut },
  },
  exportBackup: dbMocks.exportBackup,
  getOrCreateChecklist: dbMocks.getOrCreateChecklist,
  getSettings: dbMocks.getSettings,
  importBackup: dbMocks.importBackup,
  listTransactions: dbMocks.listTransactions,
  saveSettings: dbMocks.saveSettings,
}));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({
    user: { id: "owner-1" },
    mfaEnrolled: true,
    startMfaEnrollment: vi.fn(),
    verifyMfaEnrollment: vi.fn(),
  }),
}));

import SyncConflictSection from "./SyncConflictSection";
import SettingsPage from "../pages/Settings";

const CANARY = "NOTFALLMAPPE_CONTACT_DOCUMENT_LOCATION_SECRET";

function conflict(overrides: Partial<ConflictRecord> = {}): ConflictRecord {
  return {
    id: "conflict-1",
    table: "settings",
    entityId: "settings-1",
    local: { emergencyContact: CANARY },
    remote: { documentLocation: CANARY },
    detectedAt: "2026-08-11T10:00:00.000Z",
    formatVersion: 2,
    remoteVersion: 3,
    remoteUpdatedAt: "2026-08-11T09:59:00.000Z",
    remoteDeletedAt: null,
    localUpdatedAt: "2026-08-11T09:58:00.000Z",
    ...overrides,
  };
}

function renderSection(onResolved = vi.fn(), focusRequest: string | null = null) {
  return render(
    createElement(SyncConflictSection, {
      userId: "owner-1",
      focusRequest,
      onResolved,
    }),
  );
}

async function openAndConfirm(actionName: string, confirmName: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name: actionName }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: confirmName }));
}

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  engineMocks.listConflicts.mockResolvedValue([conflict()]);
  engineMocks.resolveConflict.mockResolvedValue({ status: "resolved-local" });
  engineMocks.listDeadOutbox.mockResolvedValue([]);
  engineMocks.pushOutbox.mockResolvedValue({ pushed: 0, errors: 0, dead: 0 });
  engineMocks.reviveDeadOutbox.mockResolvedValue(0);
  dbMocks.getSettings.mockResolvedValue({});
  dbMocks.metadataGet.mockResolvedValue(undefined);
  dbMocks.getOrCreateChecklist.mockResolvedValue({ id: "2026", year: 2026, items: [] });
  dbMocks.listTransactions.mockResolvedValue([]);
  dbMocks.exportBackup.mockResolvedValue({ exportedAt: "2026-08-11T10:00:00.000Z" });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("SyncConflictSection confidentiality and explicit choices", () => {
  it("renders only allow-listed metadata and never exposes the Notfallmappe canary", async () => {
    renderSection();

    expect(await screen.findByRole("heading", { name: "1 xung đột cần xử lý" })).toBeTruthy();
    expect(screen.getByText("Cài đặt")).toBeTruthy();
    expect(document.body.textContent).not.toContain(CANARY);

    fireEvent.click(screen.getByRole("button", { name: "Giữ dữ liệu trên thiết bị này" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Bản trên thiết bị sẽ được giữ và gửi lại để đồng bộ.");
    expect(dialog.textContent).not.toContain(CANARY);
    expect(document.body.textContent).not.toContain(CANARY);
  });

  it("does not call the resolver during render, mount, focus navigation, or rerender", async () => {
    const view = renderSection(vi.fn(), "focus-once");
    await screen.findByRole("heading", { name: "1 xung đột cần xử lý" });
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
    expect(engineMocks.resolveConflict).not.toHaveBeenCalled();

    view.rerender(
      createElement(SyncConflictSection, {
        userId: "owner-1",
        focusRequest: "focus-once",
        onResolved: vi.fn(),
      }),
    );
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(engineMocks.resolveConflict).not.toHaveBeenCalled();
  });

  it.each([
    ["resolved-local", "Giữ dữ liệu trên thiết bị này", /Xác nhận giữ dữ liệu trên thiết bị này/, "local"],
    ["resolved-remote", "Dùng dữ liệu đã đồng bộ", /Xác nhận dùng dữ liệu đã đồng bộ/, "remote"],
    ["remote-deleted", "Dùng dữ liệu đã đồng bộ", /Xác nhận áp dụng bản đã xóa/, "remote"],
  ] as const)(
    "%s refreshes the list and parent state without any sign-out callback",
    async (status, actionName, confirmName, expectedChoice) => {
      const selectedConflict =
        status === "remote-deleted"
          ? conflict({ remoteDeletedAt: "2026-08-11T09:59:30.000Z" })
          : conflict();
      engineMocks.listConflicts
        .mockResolvedValueOnce([selectedConflict])
        .mockResolvedValueOnce([]);
      engineMocks.resolveConflict.mockResolvedValue({ status });
      const onResolved = vi.fn().mockResolvedValue(undefined);
      const signOut = vi.fn();
      renderSection(onResolved);

      await openAndConfirm(actionName, confirmName);

      await waitFor(() => {
        expect(engineMocks.resolveConflict).toHaveBeenCalledWith(
          "conflict-1",
          expectedChoice,
          "owner-1",
        );
        expect(onResolved).toHaveBeenCalledTimes(1);
      });
      expect(signOut).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain(CANARY);
    },
  );

  it.each([
    ["needs-network-verification", "Cần mạng để xác minh bản server."],
    ["failed", "Không thể áp dụng lựa chọn; dữ liệu được giữ nguyên."],
  ] as const)("keeps the card for %s and announces the safe reason", async (status, reason) => {
    engineMocks.resolveConflict.mockResolvedValue({ status, reason });
    const onResolved = vi.fn();
    renderSection(onResolved);

    await openAndConfirm(
      "Giữ dữ liệu trên thiết bị này",
      /Xác nhận giữ dữ liệu trên thiết bị này/,
    );

    expect((await screen.findByText(reason)).getAttribute("aria-live")).toBe("assertive");
    expect(screen.getByRole("article", { name: "Xung đột Cài đặt" })).toBeTruthy();
    expect(onResolved).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(CANARY);
  });

  it("guards double click per card while leaving another card enabled", async () => {
    let settle: ((result: ResolveConflictResult) => void) | undefined;
    const pendingResult = new Promise<ResolveConflictResult>((resolve) => {
      settle = resolve;
    });
    engineMocks.listConflicts
      .mockResolvedValueOnce([
        conflict(),
        conflict({ id: "conflict-2", table: "goals", entityId: "goal-1" }),
      ])
      .mockResolvedValueOnce([]);
    engineMocks.resolveConflict.mockReturnValue(pendingResult);
    renderSection();

    const cards = await screen.findAllByRole("article");
    fireEvent.click(within(cards[0]).getByRole("button", { name: "Giữ dữ liệu trên thiết bị này" }));
    const confirmButton = within(await screen.findByRole("dialog")).getByRole("button", {
      name: /Xác nhận giữ dữ liệu trên thiết bị này/,
    });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(engineMocks.resolveConflict).toHaveBeenCalledTimes(1);
      expect((within(cards[0]).getByRole("button", { name: "Đang xử lý…" }) as HTMLButtonElement).disabled).toBe(true);
      expect((within(cards[1]).getByRole("button", { name: "Giữ dữ liệu trên thiết bị này" }) as HTMLButtonElement).disabled).toBe(false);
      expect((within(cards[1]).getByRole("button", { name: "Dùng dữ liệu đã đồng bộ" }) as HTMLButtonElement).disabled).toBe(false);
    });

    settle?.({ status: "resolved-local" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the explicit server tombstone warning without raw content", async () => {
    engineMocks.listConflicts.mockResolvedValue([
      conflict({ remoteDeletedAt: "2026-08-11T09:59:30.000Z" }),
    ]);
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Dùng dữ liệu đã đồng bộ" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Bản trên server đang bị xóa");
    expect(dialog.textContent).not.toContain(CANARY);
  });
});

describe("Settings Data tab regression", () => {
  it("keeps the existing dead-outbox retry and non-conflict data controls", async () => {
    const deadItem: OutboxItem = {
      id: "dead-1",
      table: "transactions",
      entityId: "transaction-1",
      op: "upsert",
      payload: {},
      version: 1,
      createdAt: "2026-08-11T10:00:00.000Z",
      attempts: 8,
      dead: true,
    };
    engineMocks.listConflicts.mockResolvedValue([]);
    engineMocks.listDeadOutbox.mockResolvedValue([deadItem]);

    render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/settings?tab=data"] },
        createElement(SettingsPage, {
          onReload: vi.fn(),
          onConflictResolved: vi.fn(),
        }),
      ),
    );

    expect(await screen.findByRole("heading", { name: "1 thay đổi đang chờ" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Thử lại đồng bộ" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("heading", { name: "Xuất và nhập dữ liệu" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /xung đột cần xử lý/ })).toBeNull();
  });
});
