// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";

const authMocks = vi.hoisted(() => ({
  current: {
    configured: true,
    user: null,
    recoveryMode: false,
    recoveryError: "invalid_or_expired" as "invalid_or_expired" | null,
    mfaRequired: false,
    mfaError: null as string | null,
    signIn: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    verifyMfa: vi.fn(),
    refreshMfa: vi.fn(),
  },
}));

vi.mock("../lib/auth", () => ({
  MIN_PASSWORD_LENGTH: 14,
  passwordPolicyError: (password: string) => password.length < 14 ? "Mật khẩu phải có ít nhất 14 ký tự." : undefined,
  useAuth: () => authMocks.current,
}));

import AuthPage from "./Auth";

function renderAuth(locale: "vi" | "de") {
  window.localStorage.setItem(LOCALE_KEY, locale);
  return render(createElement(LocaleProvider, null, createElement(AuthPage)));
}

beforeEach(() => {
  window.localStorage.clear();
  authMocks.current = {
    configured: true,
    user: null,
    recoveryMode: false,
    recoveryError: "invalid_or_expired",
    mfaRequired: false,
    mfaError: null,
    signIn: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    verifyMfa: vi.fn(),
    refreshMfa: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Auth password-recovery locale boundary", () => {
  it("renders only safe Vietnamese copy for an invalid or expired recovery callback", () => {
    renderAuth("vi");

    expect(screen.getByRole("alert").textContent).toBe(
      "Link khôi phục không hợp lệ hoặc đã hết hạn. Hãy yêu cầu một link mới.",
    );
    expect(screen.queryByText(/ungültig|abgelaufen|synthetic/i)).toBeNull();
  });

  it("renders only safe German copy for an invalid or expired recovery callback", () => {
    renderAuth("de");

    expect(screen.getByRole("alert").textContent).toBe(
      "Der Wiederherstellungslink ist ungültig oder abgelaufen. Fordern Sie einen neuen Link an.",
    );
    expect(screen.queryByText(/khôi phục|không hợp lệ|synthetic/i)).toBeNull();
  });

  it("does not surface a Vietnamese provider error in the German forgot-password form", async () => {
    authMocks.current.recoveryError = null;
    authMocks.current.resetPassword.mockResolvedValue({
      error: "Không thể thực hiện. Thử lại sau.",
    });
    renderAuth("de");

    fireEvent.click(screen.getByRole("button", { name: /Passwort vergessen/i }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.invalid" } });
    fireEvent.submit(screen.getByRole("button", { name: /E-Mail senden/i }).closest("form")!);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Die Anfrage konnte nicht ausgeführt werden. Bitte versuchen Sie es später erneut.",
    );
    expect(screen.queryByText(/Không thể thực hiện/i)).toBeNull();
  });
});
