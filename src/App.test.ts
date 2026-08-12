// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("./pages/Auth", () => ({ default: () => null }));
vi.mock("./pages/Onboarding", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement(
        "div",
        null,
        React.createElement("button", null, "Bắt đầu với kế hoạch mẫu"),
        React.createElement("button", null, "Bắt đầu với dữ liệu trống"),
      ),
  };
});
vi.mock("./pages/MigrateWizard", async () => {
  const React = await import("react");
  return {
    default: ({
      onDone,
      onBack,
    }: {
      onDone: () => void | Promise<void>;
      onBack: () => void;
    }) =>
      React.createElement(
        "div",
        { "data-testid": "recovery-screen" },
        React.createElement("h1", null, "Khôi phục dữ liệu trên thiết bị"),
        React.createElement(
          "button",
          { onClick: onBack },
          "Quay lại — chưa khôi phục dữ liệu",
        ),
        React.createElement(
          "button",
          {
            onClick: () => {
              void Promise.resolve(onDone()).catch(() => undefined);
            },
          },
          "Kiểm tra dữ liệu",
        ),
      ),
  };
});
vi.mock("./pages/Settings", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.createElement(
        "div",
        { "data-testid": "settings-data" },
        "Cài đặt → Dữ liệu",
      ),
  };
});

import App from "./App";

const ZERO = {
  settings: 0,
  goals: 0,
  transactions: 0,
  annualChecklists: 0,
  monthlySnapshots: 0,
  quotes: 0,
};
const LOCAL = { ...ZERO, settings: 1 };
const COMPLETE = {
  userId: "owner-1",
  migrateWizardDone: true,
  migrateWizardSkipped: false,
  recoveryState: "complete" as const,
};
const PENDING = {
  ...COMPLETE,
  migrateWizardDone: false,
  recoveryState: "queued" as const,
};
const BLOCKED =
  "Bạn còn dữ liệu chưa đồng bộ hoặc chưa khôi phục. Hãy khôi phục hoặc sao lưu trước khi đăng xuất.";
const RECOVERY_BANNER = "Khôi phục dữ liệu chưa hoàn tất";
const CONTINUE_RECOVERY = "Tiếp tục khôi phục dữ liệu";

function conflict(): ConflictRecord {
  return {
    id: "c1",
    table: "settings",
    entityId: "settings",
    local: {},
    remote: {},
    detectedAt: "2026-08-11T10:00:00Z",
  };
}

function renderApp(path = "/") {
  return render(
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(App)),
  );
}

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true,
  });
  authMocks.useAuth.mockReturnValue({
    ready: true,
    configured: false,
    user: {
      id: "owner-1",
      email: "owner@example.com",
      user_metadata: {},
    },
    vaultReady: true,
    mfaReady: true,
    signOut: authMocks.signOut,
  });
  dbMocks.runPendingMigrations.mockResolvedValue(undefined);
  dbMocks.getSettings.mockResolvedValue({
    onboardingDone: true,
    planName: "Quỹ VWCE",
  });
  dbMocks.ingestQuotesFeed.mockResolvedValue({ status: "skipped" });
  dbMocks.countLocalData.mockResolvedValue(ZERO);
  dbMocks.clearUserBusinessData.mockResolvedValue(undefined);
  engineMocks.getSyncMeta.mockResolvedValue(COMPLETE);
  engineMocks.listConflicts.mockResolvedValue([]);
  engineMocks.listDeadOutbox.mockResolvedValue([]);
  engineMocks.runSync.mockResolvedValue({
    status: "synced",
    pushed: 0,
    pulled: 0,
    conflicts: 0,
  });
  engineMocks.reviveDeadOutbox.mockResolvedValue(0);
  outboxMocks.outboxCount.mockResolvedValue(0);
  authMocks.signOutBeforeLocalClear.mockResolvedValue({ status: "success" });
});

describe("fresh fail-closed logout", () => {
  it.each([
    [
      "conflict",
      () => {
        engineMocks.listConflicts.mockResolvedValue([conflict()]);
      },
    ],
    [
      "pending",
      () => {
        outboxMocks.outboxCount.mockResolvedValue(2);
      },
    ],
    [
      "dead",
      () => {
        outboxMocks.outboxCount.mockResolvedValue(1);
        engineMocks.listDeadOutbox.mockResolvedValue([{ id: "dead", dead: true }]);
      },
    ],
  ])("blocks %s without sign-out or clear", async (_label, arrange) => {
    arrange();
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Đăng xuất" }));
    expect(await screen.findByText(BLOCKED)).toBeTruthy();
    expect(authMocks.signOutBeforeLocalClear).not.toHaveBeenCalled();
    expect(dbMocks.clearUserBusinessData).not.toHaveBeenCalled();
  });

  it.each(["required", "queued", "verifying", "conflict"])(
    "blocks logout while recovery state %s is pending",
    async (state) => {
      dbMocks.countLocalData.mockResolvedValue(LOCAL);
      engineMocks.getSyncMeta.mockResolvedValue({
        ...COMPLETE,
        migrateWizardDone: false,
        recoveryState: state,
      });
      renderApp();
      expect(await screen.findByText(RECOVERY_BANNER)).toBeTruthy();
      expect(screen.queryByTestId("recovery-screen")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
      expect(await screen.findByText(BLOCKED)).toBeTruthy();
      expect(authMocks.signOutBeforeLocalClear).not.toHaveBeenCalled();
      expect(dbMocks.clearUserBusinessData).not.toHaveBeenCalled();
    },
  );

  it("blocks stale-clean UI when a fresh recovery read becomes queued", async () => {
    renderApp();
    await screen.findByRole("button", { name: "Đăng xuất" });
    dbMocks.countLocalData.mockResolvedValue(LOCAL);
    engineMocks.getSyncMeta.mockResolvedValue({
      ...COMPLETE,
      migrateWizardDone: false,
      recoveryState: "queued",
    });
    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(await screen.findByText(BLOCKED)).toBeTruthy();
    expect(authMocks.signOutBeforeLocalClear).not.toHaveBeenCalled();
  });

  it("fails closed on read failure without leaking raw errors", async () => {
    renderApp();
    await screen.findByRole("button", { name: "Đăng xuất" });
    outboxMocks.outboxCount.mockRejectedValueOnce(new Error("PRIVATE"));
    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(await screen.findByText(BLOCKED)).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("PRIVATE");
  });

  it("preserves explicit logout only when recovery is complete and blockers are zero", async () => {
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "Đăng xuất" }));
    await waitFor(() =>
      expect(authMocks.signOutBeforeLocalClear).toHaveBeenCalledTimes(1),
    );
    expect(authMocks.signOutBeforeLocalClear.mock.calls[0][1]).toBe(
      dbMocks.clearUserBusinessData,
    );
  });
});

describe("recovery read-only shell (menu access)", () => {
  beforeEach(() => {
    dbMocks.countLocalData.mockResolvedValue(LOCAL);
    engineMocks.getSyncMeta.mockResolvedValue(PENDING);
    dbMocks.getSettings.mockResolvedValue({
      onboardingDone: true,
      planName: "Quỹ VWCE",
    });
  });

  it("renders the normal app shell with the logout control, not the wizard", async () => {
    renderApp();
    expect(await screen.findByText(RECOVERY_BANNER)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeTruthy();
    expect(screen.queryByTestId("recovery-screen")).toBeNull();
  });

  it.each([
    "/",
    "/transactions",
    "/goals",
    "/simulation",
    "/notfallmappe",
    "/settings?tab=data",
  ])("shows the recovery banner on %s", async (path) => {
    renderApp(path);
    expect(await screen.findByText(RECOVERY_BANNER)).toBeTruthy();
    expect(screen.queryByTestId("recovery-screen")).toBeNull();
  });

  it("does not auto-sync while recovery is pending", async () => {
    renderApp();
    await screen.findByText(RECOVERY_BANNER);
    await waitFor(() => {
      expect(engineMocks.runSync).not.toHaveBeenCalled();
    });
  });

  it("skips onboarding while recovery is pending even when onboarding is not done", async () => {
    dbMocks.getSettings.mockResolvedValue({ onboardingDone: false, planName: "" });
    renderApp();
    expect(await screen.findByText(RECOVERY_BANNER)).toBeTruthy();
    expect(screen.queryByText("Bắt đầu với kế hoạch mẫu")).toBeNull();
    expect(screen.queryByText("Bắt đầu với dữ liệu trống")).toBeNull();
    expect(screen.queryByTestId("recovery-screen")).toBeNull();
  });

  it("opens the wizard only via the banner action and does not sync or clear", async () => {
    renderApp();
    await screen.findByText(RECOVERY_BANNER);
    expect(screen.queryByTestId("recovery-screen")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: CONTINUE_RECOVERY }));
    expect(await screen.findByTestId("recovery-screen")).toBeTruthy();
    expect(engineMocks.runSync).not.toHaveBeenCalled();
    expect(dbMocks.clearUserBusinessData).not.toHaveBeenCalled();
  });
});

describe("recovery completion", () => {
  beforeEach(() => {
    dbMocks.countLocalData.mockResolvedValue(LOCAL);
    dbMocks.getSettings.mockResolvedValue({
      onboardingDone: true,
      planName: "Quỹ VWCE",
    });
  });

  it("removes the banner and restrictions after fresh complete metadata", async () => {
    engineMocks.getSyncMeta
      .mockResolvedValueOnce(PENDING)
      .mockResolvedValue(COMPLETE);
    renderApp();
    await screen.findByText(RECOVERY_BANNER);
    fireEvent.click(screen.getByRole("button", { name: CONTINUE_RECOVERY }));
    fireEvent.click(await screen.findByRole("button", { name: "Kiểm tra dữ liệu" }));
    expect(await screen.findByTestId("settings-data")).toBeTruthy();
    expect(screen.queryByText(RECOVERY_BANNER)).toBeNull();
    expect(dbMocks.clearUserBusinessData).not.toHaveBeenCalled();
  });

  it("does not release the gate when fresh metadata is still pending", async () => {
    engineMocks.getSyncMeta.mockResolvedValue(PENDING);
    renderApp();
    await screen.findByText(RECOVERY_BANNER);
    fireEvent.click(screen.getByRole("button", { name: CONTINUE_RECOVERY }));
    fireEvent.click(await screen.findByRole("button", { name: "Kiểm tra dữ liệu" }));
    await waitFor(() => {
      expect(screen.getByTestId("recovery-screen")).toBeTruthy();
    });
    expect(screen.queryByTestId("settings-data")).toBeNull();
  });
});

describe("onboarding", () => {
  it("allows onboarding only when local business data is zero", async () => {
    dbMocks.countLocalData.mockResolvedValue(ZERO);
    engineMocks.getSyncMeta.mockResolvedValue(COMPLETE);
    dbMocks.getSettings.mockResolvedValue({ onboardingDone: false, planName: "" });
    renderApp();
    expect(await screen.findByText("Bắt đầu với kế hoạch mẫu")).toBeTruthy();
    expect(screen.queryByTestId("recovery-screen")).toBeNull();
    expect(screen.queryByText(RECOVERY_BANNER)).toBeNull();
  });
});
