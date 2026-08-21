// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  signOut: vi.fn(),
  signOutBeforeLocalClear: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  runPendingMigrations: vi.fn(),
  getSettings: vi.fn(),
  ingestQuotesFeed: vi.fn(),
  countLocalData: vi.fn(),
  clearUserBusinessData: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  clearRecoveryItems: vi.fn(),
  getSyncMeta: vi.fn(),
  listConflicts: vi.fn(),
  listDeadOutbox: vi.fn(),
  runSync: vi.fn(),
  reviveDeadOutbox: vi.fn(),
  saveSyncMeta: vi.fn(),
}));

const outboxMocks = vi.hoisted(() => ({
  outboxCount: vi.fn(),
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
vi.mock("./components/CollapsingNavBar", () => ({ default: () => null }));
vi.mock("./components/BottomDock", () => ({ default: () => null }));
vi.mock("./pages/Overview", () => ({ default: () => "OVERVIEW_APP" }));
vi.mock("./pages/Transactions", () => ({ default: () => null }));
vi.mock("./pages/Goals", () => ({ default: () => null }));
vi.mock("./pages/Simulation", () => ({ default: () => null }));
vi.mock("./pages/Notfallmappe", () => ({ default: () => null }));
vi.mock("./pages/Settings", () => ({ default: () => null }));
vi.mock("./pages/Onboarding", () => ({ default: () => null }));
vi.mock("./pages/MigrateWizard", () => ({ default: () => null }));
vi.mock("./pages/Auth", () => ({
  default: () => createElement("div", { "data-testid": "auth-page" }, "AUTH_PAGE"),
}));

import App from "./App";

function renderApp() {
  return render(createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(App)));
}

const baseAuth = {
  ready: true,
  configured: true,
  user: { id: "owner-1", email: "owner@example.com", user_metadata: {} },
  session: { access_token: "x" },
  recoveryMode: false,
  recoveryCompleted: false,
  recoveryError: null,
  dismissRecoveryError: vi.fn(),
  mfaReady: false,
  mfaRequired: false,
  mfaEnrolled: false,
  mfaError: null,
  vaultReady: false,
  signIn: vi.fn(),
  signOut: authMocks.signOut,
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
  continueAfterRecovery: vi.fn(),
  refreshMfa: vi.fn(),
  verifyMfa: vi.fn(),
  startMfaEnrollment: vi.fn(),
  verifyMfaEnrollment: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  dbMocks.runPendingMigrations.mockResolvedValue(undefined);
  dbMocks.getSettings.mockResolvedValue({ onboardingDone: true, planName: "Quỹ VWCE" });
  dbMocks.ingestQuotesFeed.mockResolvedValue({ status: "skipped" });
  dbMocks.countLocalData.mockResolvedValue({
    settings: 0,
    goals: 0,
    transactions: 0,
    annualChecklists: 0,
    monthlySnapshots: 0,
    quotes: 0,
  });
  engineMocks.getSyncMeta.mockResolvedValue({
    userId: "owner-1",
    migrateWizardDone: true,
    migrateWizardSkipped: false,
    recoveryState: "complete",
  });
  engineMocks.listConflicts.mockResolvedValue([]);
  engineMocks.listDeadOutbox.mockResolvedValue([]);
  engineMocks.runSync.mockResolvedValue({ status: "synced", pushed: 0, pulled: 0, conflicts: 0 });
  outboxMocks.outboxCount.mockResolvedValue(0);
});

afterEach(() => cleanup());

describe("App password-recovery render gate", () => {
  it("renders AuthPage during recoveryMode even when vaultReady and recoveryChecked are false", () => {
    authMocks.useAuth.mockReturnValue({
      ...baseAuth,
      recoveryMode: true,
      vaultReady: false,
      mfaReady: false,
    });

    renderApp();

    expect(screen.getByTestId("auth-page").textContent).toBe("AUTH_PAGE");
    expect(document.body.textContent ?? "").not.toMatch(/Đang tải/);
  });

  it("renders AuthPage for recoveryCompleted success before vault opens", () => {
    authMocks.useAuth.mockReturnValue({
      ...baseAuth,
      recoveryMode: false,
      recoveryCompleted: true,
      vaultReady: false,
      mfaReady: true,
    });

    renderApp();

    expect(screen.getByTestId("auth-page").textContent).toBe("AUTH_PAGE");
    expect(document.body.textContent ?? "").not.toMatch(/Đang tải/);
  });

  it("renders the normal application when vault is ready and recovery is idle", async () => {
    authMocks.useAuth.mockReturnValue({
      ...baseAuth,
      recoveryMode: false,
      recoveryCompleted: false,
      vaultReady: true,
      mfaReady: true,
    });

    renderApp();

    expect(await screen.findByText("OVERVIEW_APP")).toBeTruthy();
    expect(screen.queryByTestId("auth-page")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/Đang tải/);
  });
});
