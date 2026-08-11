import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  buildAuthRedirectUrl,
  passwordPolicyError,
  requiresMfaChallenge,
} from "./auth";

describe("private-vault auth helpers", () => {
  it("builds exact GitHub Pages recovery redirects", () => {
    expect(
      buildAuthRedirectUrl(
        "https://ziegepapa.github.io",
        "/quy-vwce-cho-be/",
        "/settings",
      ),
    ).toBe("https://ziegepapa.github.io/quy-vwce-cho-be/#/settings");
    expect(
      buildAuthRedirectUrl("https://ziegepapa.github.io", "/quy-vwce-cho-be/", "/"),
    ).toBe("https://ziegepapa.github.io/quy-vwce-cho-be/#/");
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
});
