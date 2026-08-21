import { describe, expect, it, vi } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  buildAuthRedirectUrl,
  passwordPolicyError,
  requiresMfaChallenge,
  signOutBeforeLocalClear,
} from "./auth";

describe("private-vault auth helpers", () => {
  it("builds a fragment-free GitHub Pages recovery callback", () => {
    expect(
      buildAuthRedirectUrl("https://ziegepapa.github.io", "/quy-vwce-cho-be/"),
    ).toBe("https://ziegepapa.github.io/quy-vwce-cho-be/");
    expect(
      buildAuthRedirectUrl("https://ziegepapa.github.io/", "quy-vwce-cho-be"),
    ).toBe("https://ziegepapa.github.io/quy-vwce-cho-be/");
  });

  it("keeps the client password rule aligned at fourteen characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(14);
    expect(passwordPolicyError("x".repeat(13))).toContain("14");
    expect(passwordPolicyError("x".repeat(14))).toBeUndefined();
  });

  it("gates only accounts with a verified factor that still need AAL2", () => {
    expect(requiresMfaChallenge("aal1", "aal1", false)).toBe(false);
    expect(requiresMfaChallenge("aal1", "aal2", true)).toBe(true);
    expect(requiresMfaChallenge("aal2", "aal2", true)).toBe(false);
  });

  it("never clears local business data when cloud sign-out fails", async () => {
    const clearLocal = vi.fn(async () => undefined);

    const result = await signOutBeforeLocalClear(
      async () => ({ error: "sign-out failed" }),
      clearLocal,
    );

    expect(result).toEqual({ status: "sign_out_failed", error: "sign-out failed" });
    expect(clearLocal).not.toHaveBeenCalled();
  });

  it("clears local business data only after cloud sign-out succeeds", async () => {
    const calls: string[] = [];

    const result = await signOutBeforeLocalClear(
      async () => {
        calls.push("sign-out");
        return {};
      },
      async () => {
        calls.push("clear-local");
      },
    );

    expect(result).toEqual({ status: "success" });
    expect(calls).toEqual(["sign-out", "clear-local"]);
  });
});
