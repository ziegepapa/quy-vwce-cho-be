// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ConflictRecord } from "./lib/sync/types";

const engineMocks = vi.hoisted(() => ({
  getSyncMeta: vi.fn(),
  listConflicts: vi.fn(),
  listDeadOutbox: vi.fn(),
  resolveConflict: vi.fn(),
  reviveDeadOutbox: vi.fn(),
  runSync: vi.fn(),
}));

const outboxMocks = vi.hoisted(() => ({
  outboxCount: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  clearUserBusinessData: vi.fn(),
  countLocalData: vi.fn(),
  ensureInitialized: vi.fn(),
  getSettings: vi.fn(),
  ingestQuotesFeed: vi.fn(),
  runPendingMigrations: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  signOut: vi.fn(),
  signOutBeforeLocalClear: vi.fn(),
}));

vi.mock("./lib/sync/engine", () => engineMocks);
vi.mock("./lib/sync/outbox", () => outboxMocks);
vi.mock("./lib/db", () => dbMocks);
vi.mock("./lib/auth", () => ({
  useAuth: authMocks.useAuth,
  signOutBeforeLocalClear: authMocks.signOutBeforeLocalClear,
}));
vi.mock("./lib/navActions", async () => {
  const React = await import("react");
  return {
    NavActionsProvider: ({ children }: { children: ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useNavActionRegistry: () => ({ api: {}, navAction: () => undefined }),
  };
});
vi.mock("./components/CollapsingNavBar", async () => {
  const React = await import("react");
  return {
    default: ({ onSignOut }: { onSignOut: () => void | Promise<void> }) =>
      React.createElement(
        "button",
        { type: "button", onClick: () => void onSignOut() },
        "Đăng xuất",
      ),
  };
});
vi.mock("./components/BottomDock", () => ({ default: () => null }));
vi.mock("./pages/Overview", () => ({ default: () => null }));
vi.mock("./pages/Transactions", () => ({ default: () => null }));
vi.mock("./pages/Goals", () => ({ default: () => null }));
vi.mock("./pages/Simulation", () => ({ default: () => null }));
vi.mock("./pages/Notfallmappe", () => ({ default: () => null }));
vi.mock("./pages/Onboarding", () => ({ default: () => null }));
vi.mock("./pages/Auth", () => ({ default: () => null }));
vi.mock("./pages/MigrateWizard", () => ({ default: () => null }));
vi.mock("./pages/Settings", async () => {
  const React = await import("react");
  const { default: SyncConflictSection } = await import("./components/SyncConflictSection");
  return {
    default: ({ onConflictResolved }: { onConflictResolved?: () => void | Promise<void> }) =>
      React.createElement(SyncConflictSection, {
        userId: "owner-1",
        onResolved: async () => {
          await onConflictResolved?.();
        },
      }),
  };
});

import App from "./App";
import {
  SYNC_CONFLICT_FOCUS_STATE_KEY,
  SYNC_CONFLICTS_SECTION_ID,
  conflictCtaLabel,
  focusSyncConflictSection,
  openSyncConflictSection,
  readSyncConflictFocusToken,
  reconcileVisibleLogoutBlockers,
} from "./components/SyncConflictSection";

function conflict(overrides: Partial<ConflictRecord> = {}): ConflictRecord {
  return {
    id: "conflict-1",
    table: "settings",
    entityId: "settings-1",
    local: { privateValue: "local-canary" },
    remote: { privateValue: "remote-canary" },
    detectedAt: "2026-08-11T10:00:00.000Z",
    formatVersion: 2,
    remoteVersion: 3,
    remoteUpdatedAt: "2026-08-11T09:59:00.000Z",
    remoteDeletedAt: null,
    ...overrides,
  };
}

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.body.replaceChildren();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });

  authMocks.useAuth.mockReturnValue({
    ready: true,
    configured: false,
    user: {
      id: "owner-1",
      email: "owner@example.com",
      user_metadata: { display_name: "Owner" },
    },
    vaultReady: true,
    mfaReady: true,
    signOut: authMocks.signOut,
  });
  dbMocks.runPendingMigrations.mockResolvedValue(undefined);
  dbMocks.getSettings.mockResolvedValue({ onboardingDone: true, planName: "Quỹ VWCE" });
  dbMocks.ingestQuotesFeed.mockResolvedValue({ status: "skipped" });
  dbMocks.countLocalData.mockResolvedValue({ goals: 0, transactions: 0, settings: 0 });
  dbMocks.ensureInitialized.mockResolvedValue(undefined);
  dbMocks.clearUserBusinessData.mockResolvedValue(undefined);
  engineMocks.getSyncMeta.mockResolvedValue({
    migrateWizardDone: true,
    migrateWizardSkipped: false,
  });
  engineMocks.listConflicts.mockResolvedValue([]);
  engineMocks.listDeadOutbox.mockResolvedValue([]);
  engineMocks.resolveConflict.mockResolvedValue({ status: "resolved-local" });
  engineMocks.reviveDeadOutbox.mockResolvedValue(0);
  engineMocks.runSync.mockResolvedValue({
    status: "synced",
    pushed: 0,
    pulled: 0,
    conflicts: 0,
  });
  outboxMocks.outboxCount.mockResolvedValue(0);
  authMocks.signOutBeforeLocalClear.mockResolvedValue({ status: "ok" });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("App conflict banner routing and blocker state", () => {
  it("navigates from another route to the Data tab with a one-shot focus token", () => {
    const navigate = vi.fn();
    const focus = vi.fn();

    const action = openSyncConflictSection({
      pathname: "/",
      search: "",
      navigate,
      focus,
      token: "focus-once",
    });

    expect(action).toBe("navigated");
    expect(navigate).toHaveBeenCalledWith("/settings?tab=data", {
      state: { [SYNC_CONFLICT_FOCUS_STATE_KEY]: "focus-once" },
    });
    expect(focus).not.toHaveBeenCalled();
    expect(readSyncConflictFocusToken(navigate.mock.calls[0][1].state)).toBe("focus-once");
  });

  it("focuses and scrolls directly when already on the Data tab", async () => {
    const section = document.createElement("section");
    section.id = SYNC_CONFLICTS_SECTION_ID;
    section.tabIndex = -1;
    section.scrollIntoView = vi.fn();
    document.body.append(section);
    const navigate = vi.fn();

    const action = openSyncConflictSection({
      pathname: "/settings",
      search: "?tab=data",
      navigate,
    });

    expect(action).toBe("focused");
    await expect.poll(() => document.activeElement).toBe(section);
    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("fails silently after a bounded focus retry when the section is gone", async () => {
    await expect(focusSyncConflictSection({ attempts: 2, delayMs: 0 })).resolves.toBe(false);
  });

  it("uses explicit singular and plural conflict CTA labels", () => {
    expect(conflictCtaLabel(1)).toBe("Xử lý 1 xung đột");
    expect(conflictCtaLabel(3)).toBe("Xử lý 3 xung đột");
  });

  it("clears a visible conflict blocker only when every blocker is zero", () => {
    const current = { pending: 0, dead: 0, conflicts: 1 };
    expect(reconcileVisibleLogoutBlockers(current, { pending: 0, dead: 0, conflicts: 0 })).toBeNull();
  });

  it("keeps pending and dead outbox blockers independent after conflicts reach zero", () => {
    const current = { pending: 0, dead: 0, conflicts: 1 };
    expect(
      reconcileVisibleLogoutBlockers(current, { pending: 2, dead: 0, conflicts: 0 }),
    ).toEqual({ pending: 2, dead: 0, conflicts: 0 });
    expect(
      reconcileVisibleLogoutBlockers(current, { pending: 0, dead: 1, conflicts: 0 }),
    ).toEqual({ pending: 0, dead: 1, conflicts: 0 });
  });

  it("re-reads all blockers after a confirmed conflict callback and never signs out automatically", async () => {
    engineMocks.listConflicts.mockResolvedValue([conflict()]);
    outboxMocks.outboxCount.mockResolvedValue(1);

    render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/settings?tab=data"] },
        createElement(App),
      ),
    );

    await screen.findByRole("button", { name: "Giữ dữ liệu trên thiết bị này" });
    await waitFor(() => expect(engineMocks.listConflicts.mock.calls.length).toBeGreaterThanOrEqual(2));

    engineMocks.listConflicts.mockClear();
    engineMocks.listDeadOutbox.mockClear();
    outboxMocks.outboxCount.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("1 thay đổi đang chờ");
    expect(banner.textContent).toContain("1 xung đột chưa xử lý");
    expect(authMocks.signOut).not.toHaveBeenCalled();
    expect(authMocks.signOutBeforeLocalClear).not.toHaveBeenCalled();

    engineMocks.listConflicts.mockClear();
    engineMocks.listDeadOutbox.mockClear();
    outboxMocks.outboxCount.mockClear();
    engineMocks.listConflicts.mockResolvedValue([]);
    engineMocks.listDeadOutbox.mockResolvedValue([]);
    outboxMocks.outboxCount.mockResolvedValue(0);

    fireEvent.click(screen.getByRole("button", { name: "Giữ dữ liệu trên thiết bị này" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: /Xác nhận giữ dữ liệu trên thiết bị này/,
      }),
    );

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(engineMocks.resolveConflict).toHaveBeenCalledTimes(1);
    expect(outboxMocks.outboxCount).toHaveBeenCalledTimes(2);
    expect(engineMocks.listDeadOutbox).toHaveBeenCalledTimes(1);
    expect(engineMocks.listConflicts).toHaveBeenCalledTimes(3);
    expect(authMocks.signOut).not.toHaveBeenCalled();
    expect(authMocks.signOutBeforeLocalClear).not.toHaveBeenCalled();
  });

  it("keeps logout blocked after a pending replacement conflict and never auto signs out", async () => {
    const replacement = conflict({
      id: "replacement-1",
      remoteVersion: 7,
      reasonCategory: "server-version-changed",
      sourceOutboxId: "outbox-1",
      supersedesConflictId: "conflict-1",
    });
    engineMocks.listConflicts
      .mockResolvedValueOnce([conflict()])
      .mockResolvedValue([replacement]);
    engineMocks.resolveConflict.mockResolvedValue({
      status: "resolved-local-pending-conflict",
      reason: "server-version-changed",
    });
    outboxMocks.outboxCount.mockResolvedValue(1);

    render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/settings?tab=data"] },
        createElement(App),
      ),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Giữ dữ liệu trên thiết bị này" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /Xác nhận giữ dữ liệu trên thiết bị này/,
      }),
    );

    expect(
      await screen.findByText(
        "Đã lưu lựa chọn trên thiết bị, nhưng trạng thái server đã thay đổi hoặc chưa thể cập nhật an toàn. Không có dữ liệu bị ghi đè. Vui lòng xem xung đột mới.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Đã giữ dữ liệu trên thiết bị và đồng bộ thành công.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    await waitFor(() => {
      expect(
        screen.getAllByRole("alert").some((alert) =>
          alert.textContent?.includes("1 thay đổi đang chờ"),
        ),
      ).toBe(true);
    });
    const banner = screen
      .getAllByRole("alert")
      .find((alert) => alert.textContent?.includes("1 thay đổi đang chờ"));
    expect(banner?.textContent).toContain("1 xung đột chưa xử lý");
    expect(authMocks.signOut).not.toHaveBeenCalled();
    expect(authMocks.signOutBeforeLocalClear).not.toHaveBeenCalled();
  });
});
