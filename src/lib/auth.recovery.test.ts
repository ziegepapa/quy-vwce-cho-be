// @vitest-environment jsdom
import { createElement } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const authMocks = vi.hoisted(() => {
  let listener: ((event: AuthChangeEvent, session: Session | null) => void) | undefined;
  const calls: string[] = [];
  return {
    calls,
    setListener: (next: (event: AuthChangeEvent, session: Session | null) => void) => {
      listener = next;
    },
    emit: (event: AuthChangeEvent, session: Session | null) => listener?.(event, session),
    initialize: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    getAuthenticatorAssuranceLevel: vi.fn(),
    listFactors: vi.fn(),
  };
});

vi.mock("./supabase", () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      initialize: authMocks.initialize,
      getSession: authMocks.getSession,
      onAuthStateChange: authMocks.onAuthStateChange,
      resetPasswordForEmail: authMocks.resetPasswordForEmail,
      updateUser: authMocks.updateUser,
      signInWithPassword: authMocks.signInWithPassword,
      signOut: authMocks.signOut,
      mfa: {
        getAuthenticatorAssuranceLevel: authMocks.getAuthenticatorAssuranceLevel,
        listFactors: authMocks.listFactors,
      },
    },
  },
}));

import { AuthProvider, useAuth } from "./auth";

const RECOVERY_SESSION = {
  access_token: "synthetic-access-token",
  refresh_token: "synthetic-refresh-token",
  expires_in: 3600,
  expires_at: 1_800_000_000,
  token_type: "bearer",
  user: { id: "synthetic-user", email: "recovery@example.invalid" },
} as unknown as Session;

let latestAuth: ReturnType<typeof useAuth> | null = null;

function Probe() {
  const auth = useAuth();
  latestAuth = auth;
  return createElement("output", null, JSON.stringify({
    ready: auth.ready,
        recoveryMode: auth.recoveryMode,
        recoveryError: auth.recoveryError,
        userId: auth.user?.id ?? null,
  }));
}

function renderProvider() {
  return render(createElement(AuthProvider, null, createElement(Probe)));
}

beforeEach(() => {
  latestAuth = null;
  authMocks.calls.length = 0;
  window.localStorage.clear();
  authMocks.onAuthStateChange.mockImplementation((callback) => {
    authMocks.calls.push("subscribe");
    authMocks.setListener(callback);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  authMocks.initialize.mockImplementation(async () => {
    authMocks.calls.push("initialize");
    authMocks.emit("PASSWORD_RECOVERY", RECOVERY_SESSION);
    return { error: null };
  });
  authMocks.getSession.mockImplementation(async () => {
    authMocks.calls.push("getSession");
    return { data: { session: RECOVERY_SESSION }, error: null };
  });
  authMocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
  authMocks.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
  authMocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  authMocks.updateUser.mockResolvedValue({ error: null });
  authMocks.signInWithPassword.mockResolvedValue({ error: null });
  authMocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.location.hash = "";
});

describe("password-recovery callback startup", () => {
  it("subscribes before initialization and preserves PASSWORD_RECOVERY into the recovery session state", async () => {
    renderProvider();

    await waitFor(() => {
      expect(latestAuth?.ready).toBe(true);
      expect(latestAuth?.recoveryMode).toBe(true);
      expect(latestAuth?.user?.id).toBe("synthetic-user");
    });

    expect(authMocks.calls).toEqual(["subscribe", "initialize", "getSession"]);
    // The application never manually writes a recovery token. The real
    // Supabase SDK owns normal session persistence in its configured storage.
    expect(window.localStorage.length).toBe(0);
    expect(screen.getByText(/"recoveryMode":true/)).toBeTruthy();
  });

  it("keeps an invalid recovery callback out of session state and exposes only a safe error code", async () => {
    window.location.hash = "error=access_denied&error_description=synthetic-secret";
    authMocks.initialize.mockResolvedValueOnce({ error: { message: "synthetic-secret" } });
    authMocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    renderProvider();

    await waitFor(() => {
      expect(latestAuth?.ready).toBe(true);
      expect(latestAuth?.recoveryError).toBe("invalid_or_expired");
      expect(latestAuth?.user).toBeNull();
    });

    expect(screen.getByText(/"recoveryError":"invalid_or_expired"/)).toBeTruthy();
    expect(screen.queryByText(/synthetic-secret/)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("sends the forgot-password request to a fragment-free application callback", async () => {
    renderProvider();
    await waitFor(() => expect(latestAuth?.ready).toBe(true));

    await act(async () => {
      await latestAuth?.resetPassword("owner@example.invalid");
    });

    expect(authMocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "owner@example.invalid",
      { redirectTo: "http://localhost:3000/" },
    );
  });

  it("updates only with a valid recovery session and exits recovery mode after success", async () => {
    renderProvider();
    await waitFor(() => expect(latestAuth?.recoveryMode).toBe(true));

    await act(async () => {
      await expect(latestAuth?.updatePassword("x".repeat(14))).resolves.toEqual({});
    });

    expect(authMocks.updateUser).toHaveBeenCalledWith({ password: "x".repeat(14) });
    await waitFor(() => expect(latestAuth?.recoveryMode).toBe(false));
    expect(window.localStorage.length).toBe(0);
  });

  it("keeps recovery mode active and reports a failure when password update is rejected", async () => {
    authMocks.updateUser.mockResolvedValueOnce({ error: { message: "network failure" } });
    renderProvider();
    await waitFor(() => expect(latestAuth?.recoveryMode).toBe(true));

    await act(async () => {
      await expect(latestAuth?.updatePassword("x".repeat(14))).resolves.toEqual({
        error: "Không thể thực hiện. Thử lại sau.",
      });
    });

    expect(latestAuth?.recoveryMode).toBe(true);
  });
});
