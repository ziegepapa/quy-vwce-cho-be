// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ConflictRecord } from "./lib/sync/types";

const engineMocks = vi.hoisted(() => ({
  getSyncMeta: vi.fn(), listConflicts: vi.fn(), listDeadOutbox: vi.fn(),
  resolveConflict: vi.fn(), reviveDeadOutbox: vi.fn(), runSync: vi.fn(), saveSyncMeta: vi.fn(),
}));
const outboxMocks = vi.hoisted(() => ({ outboxCount: vi.fn() }));
const dbMocks = vi.hoisted(() => ({
  clearUserBusinessData: vi.fn(), countLocalData: vi.fn(), ensureInitialized: vi.fn(),
  getSettings: vi.fn(), ingestQuotesFeed: vi.fn(), runPendingMigrations: vi.fn(),
}));
const authMocks = vi.hoisted(() => ({ useAuth: vi.fn(), signOut: vi.fn(), signOutBeforeLocalClear: vi.fn() }));

vi.mock("./lib/sync/engine", () => engineMocks);
vi.mock("./lib/sync/outbox", () => outboxMocks);
vi.mock("./lib/db", () => dbMocks);
vi.mock("./lib/auth", () => ({ useAuth: authMocks.useAuth, signOutBeforeLocalClear: authMocks.signOutBeforeLocalClear }));
vi.mock("./lib/navActions", async () => {
  const React = await import("react");
  return {
    NavActionsProvider: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    useNavActionRegistry: () => ({ api: {}, navAction: () => undefined }),
  };
});
vi.mock("./components/CollapsingNavBar", async () => {
  const React = await import("react");
  return { default: ({ onSignOut }: { onSignOut: () => void | Promise<void> }) =>
    React.createElement("button", { type: "button", onClick: () => void onSignOut() }, "Đăng xuất") };
});
vi.mock("./components/BottomDock", () => ({ default: () => null }));
vi.mock("./pages/Overview", () => ({ default: () => null }));
vi.mock("./pages/Transactions", () => ({ default: () => null }));
vi.mock("./pages/Goals", () => ({ default: () => null }));
vi.mock("./pages/Simulation", () => ({ default: () => null }));
vi.mock("./pages/Notfallmappe", () => ({ default: () => null }));
vi.mock("./pages/Auth", () => ({ default: () => null }));
vi.mock("./pages/Onboarding", async () => {
  const React = await import("react");
  return { default: () => React.createElement("div", null,
    React.createElement("button", null, "Bắt đầu với kế hoạch mẫu"),
    React.createElement("button", null, "Bắt đầu với dữ liệu trống")) };
});
vi.mock("./pages/MigrateWizard", async () => {
  const React = await import("react");
  return { default: ({ onDone, onBack }: { userId: string; onDone: () => void | Promise<void>; onBack: () => void }) =>
    React.createElement("div", { "data-testid": "recovery-screen" },
      React.createElement("h1", null, "Khôi phục dữ liệu trên thiết bị"),
      React.createElement("button", { onClick: () => onBack() }, "Quay lại — chưa khôi phục dữ liệu"),
      React.createElement("button", { onClick: () => void onDone() }, "Kiểm tra dữ liệu")) };
});
vi.mock("./pages/Settings", async () => {
  const React = await import("react");
  return { default: () => React.createElement("div", { "data-testid": "settings-data" }, "Cài đặt → Dữ liệu") };
});

import App from "./App";

const ZERO_COUNTS = { settings: 0, goals: 0, transactions: 0, annualChecklists: 0, monthlySnapshots: 0, quotes: 0 };
const LOCAL_SETTINGS = { ...ZERO_COUNTS, settings: 1 };
const BLOCKED_COPY = "Bạn còn dữ liệu chưa đồng bộ hoặc chưa khôi phục. Hãy khôi phục hoặc sao lưu trước khi đăng xuất.";

function conflict(): ConflictRecord {
  return { id: "conflict-1", table: "settings", entityId: "settings", local: {}, remote: {}, detectedAt: "2026-08-11T10:00:00.000Z" };
}

function renderApp(path = "/") {
  return render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(App)));
}

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  authMocks.useAuth.mockReturnValue({
    ready: true, configured: false,
    user: { id: "owner-1", email: "owner@example.com", user_metadata: { display_name: "Owner" } },
    vaultReady: true, mfaReady: true, signOut: authMocks.signOut,
  });
  dbMocks.runPendingMigrations.mockResolvedValue(undefined);
  dbMocks.getSettings.mockResolvedValue({ onboardingDone: true, planName: "Quỹ VWCE" });
  dbMocks.ingestQuotesFeed.mockResolvedValue({ status: "skipped" });
  dbMocks.countLocalData.mockResolvedValue(ZERO_COUNTS);
  dbMocks.clearUserBusinessData.mockResolvedValue(undefined);
  engineMocks.getSyncMeta.mockResolvedValue({ migrateWizardDone: true, migrateWizardSkipped: false });
  engineMocks.listConflicts.mockResolvedValue([]);
  engineMocks.listDeadOutbox.mockResolvedValue([]);
  engineMocks.runSync.mockResolvedValue({ status: "synced", pushed: 0, pulled: 0, conflicts: 0 });
  engineMocks.saveSyncMeta.mockResolvedValue({});
  engineMocks.reviveDeadOutbox.mockResolvedValue(0);
  outboxMocks.outboxCount.mockResolvedValue(0);
  authMocks.signOutBeforeLocalClear.mockResolvedValue({ status: "success" });
});

describe("fresh fail-closed logout", () => {
  it.each([
    ["conflict", () => engineMocks.listConflicts.mockResolvedValue([conflict()])],
    ["pending outbox", () => outboxMocks.outboxCount.mockResolvedValue(2)],
    ["dead outbox", () => { outboxMocks.outboxCount.mockResolvedValue(1); engineMocks.listDeadOutbox.mockResolvedValue([{ id: "dead-1", dead: true }]); }],
  ])("blocks %s without sign-out or clear", async (_label, arrange) => {
    arrange();
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Đăng xuất" }));
    expect(await screen.findByText(BLOCKED_COPY)).toBeTruthy();
    expect(authMocks.signOutBeforeLocalClear).not.toHaveBeenCalled();
    expect(authMocks.signOut).not.toHaveBeenCalled();
    expect(dbMocks.clearUserBusinessData).not.toHaveBeenCalled();
  });

  it("blocks when the visible state was clean but the fresh read finds a conflict", async () => {
    renderApp();
    await screen.findByRole("button", { name: "Đăng xuất" });
    engineMocks.listConflicts.mockResolvedValue([conflict()]);
    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(await screen.findByText(BLOCKED_COPY)).toBeTruthy();
    expect(authMocks.signOutBeforeLocalClear).not.toHaveBeenCalled();
    expect(dbMocks.clearUserBusinessData).not.toHaveBeenCalled();
  });

  it("fails closed when any fresh read fails", async () => {
    renderApp();
    await screen.findByRole("button", { name: "Đăng xuất" });
    outboxMocks.outboxCount.mockRejectedValueOnce(new Error("PRIVATE_BROWSER_ERROR"));
    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(await screen.findByText(BLOCKED_COPY)).toBeTruthy();
    expect(document.body.textContent).not.toContain("PRIVATE_BROWSER_ERROR");
    expect(authMocks.signOutBeforeLocalClear).not.toHaveBeenCalled();
    expect(dbMocks.clearUserBusinessData).not.toHaveBeenCalled();
  });

  it("blocks local recovery data that is not complete", async () => {
    renderApp();
    await screen.findByRole("button", { name: "Đăng xuất" });
    dbMocks.countLocalData.mockResolvedValue(LOCAL_SETTINGS);
    engineMocks.getSyncMeta.mockResolvedValue({ migrateWizardDone: false });
    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(await screen.findByText(BLOCKED_COPY)).toBeTruthy();
    expect(authMocks.signOutBeforeLocalClear).not.toHaveBeenCalled();
  });

  it("preserves explicit logout when all fresh blockers are zero", async () => {
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Đăng xuất" }));
    await waitFor(() => expect(authMocks.signOutBeforeLocalClear).toHaveBeenCalledTimes(1));
    expect(authMocks.signOutBeforeLocalClear.mock.calls[0][0]).toBe(authMocks.signOut);
    expect(authMocks.signOutBeforeLocalClear.mock.calls[0][1]).toBe(dbMocks.clearUserBusinessData);
  });
});

describe("mandatory recovery routing", () => {
  beforeEach(() => {
    dbMocks.countLocalData.mockResolvedValue(LOCAL_SETTINGS);
    engineMocks.getSyncMeta.mockResolvedValue({ migrateWizardDone: false, migrateWizardSkipped: true });
    dbMocks.getSettings.mockResolvedValue({ onboardingDone: false, planName: "" });
  });

  it.each(["/", "/settings?tab=data", "/goals"])("keeps %s behind recovery and never renders onboarding", async (path) => {
    renderApp(path);
    expect(await screen.findByTestId("recovery-screen")).toBeTruthy();
    expect(screen.queryByText("Bắt đầu với kế hoạch mẫu")).toBeNull();
    expect(screen.queryByText("Bắt đầu với dữ liệu trống")).toBeNull();
    expect(engineMocks.runSync).not.toHaveBeenCalled();
  });

  it("secondary action preserves the mandatory recovery gate", async () => {
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Quay lại — chưa khôi phục dữ liệu" }));
    expect(screen.getByTestId("recovery-screen")).toBeTruthy();
    expect(engineMocks.saveSyncMeta).not.toHaveBeenCalled();
    expect(dbMocks.clearUserBusinessData).not.toHaveBeenCalled();
  });

  it("completion routes to Settings Data, then marks done, without auto sync or clear", async () => {
    dbMocks.getSettings.mockResolvedValue({ onboardingDone: true, planName: "Quỹ VWCE" });
    renderApp();
    await screen.findByTestId("recovery-screen");
    engineMocks.runSync.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu" }));

    expect(await screen.findByTestId("settings-data")).toBeTruthy();
    expect(engineMocks.saveSyncMeta).toHaveBeenCalledWith({
      userId: "owner-1", migrateWizardDone: true, migrateWizardSkipped: false,
    });
    expect(engineMocks.runSync).not.toHaveBeenCalled();
    expect(authMocks.signOutBeforeLocalClear).not.toHaveBeenCalled();
    expect(dbMocks.clearUserBusinessData).not.toHaveBeenCalled();
    expect(screen.queryByText("Bắt đầu với kế hoạch mẫu")).toBeNull();
  });

  it("allows normal onboarding only when local business data is zero", async () => {
    dbMocks.countLocalData.mockResolvedValue(ZERO_COUNTS);
    renderApp();
    expect(await screen.findByText("Bắt đầu với kế hoạch mẫu")).toBeTruthy();
    expect(screen.queryByTestId("recovery-screen")).toBeNull();
  });
});
