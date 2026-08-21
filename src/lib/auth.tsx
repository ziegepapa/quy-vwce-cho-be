import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";

export const MIN_PASSWORD_LENGTH = 14;
const RECOVERY_INTENT_KEY = "vwce:password-recovery-intent:v1";

type AssuranceLevel = string | null;

type AuthActionResult<T = undefined> = {
  data?: T;
  error?: string;
};

export type MfaEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export type LogoutSequenceResult =
  | { status: "success" }
  | { status: "sign_out_failed"; error: string }
  | { status: "cleanup_failed" };

type AuthState = {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  user: User | null;
  recoveryMode: boolean;
  recoveryCompleted: boolean;
  recoveryError: "invalid_or_expired" | null;
  dismissRecoveryError: () => void;
  mfaReady: boolean;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  mfaError: string | null;
  vaultReady: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
  resetPassword: (email: string) => Promise<AuthActionResult>;
  updatePassword: (password: string) => Promise<AuthActionResult>;
  continueAfterRecovery: () => void;
  refreshMfa: () => Promise<void>;
  verifyMfa: (code: string) => Promise<AuthActionResult>;
  startMfaEnrollment: () => Promise<AuthActionResult<MfaEnrollment>>;
  verifyMfaEnrollment: (factorId: string, code: string) => Promise<AuthActionResult>;
};

const AuthContext = createContext<AuthState | null>(null);

export function buildAuthRedirectUrl(origin: string, basePath: string): string {
  const normalizedBase = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const withTrailingSlash = normalizedBase.endsWith("/") ? normalizedBase : `${normalizedBase}/`;
  const normalizedOrigin = origin.replace(/\/+$/, "");
  // Supabase implicit recovery returns its session in the URL fragment. A
  // HashRouter destination here would consume the only fragment slot before
  // detectSessionInUrl can process the callback.
  return new URL(withTrailingSlash, `${normalizedOrigin}/`).toString();
}

export function passwordPolicyError(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  }
  return undefined;
}

export function requiresMfaChallenge(
  currentLevel: AssuranceLevel,
  nextLevel: AssuranceLevel,
  hasVerifiedFactor: boolean,
): boolean {
  if (!hasVerifiedFactor) return false;
  return currentLevel !== "aal2" || nextLevel !== "aal2";
}

export async function signOutBeforeLocalClear(
  signOut: () => Promise<{ error?: string }>,
  clearLocal: () => Promise<void>,
): Promise<LogoutSequenceResult> {
  let signOutResult: { error?: string };
  try {
    signOutResult = await signOut();
  } catch {
    return {
      status: "sign_out_failed",
      error: "Không kết thúc được phiên đăng nhập. Hãy thử lại.",
    };
  }
  if (signOutResult.error) {
    return { status: "sign_out_failed", error: signOutResult.error };
  }

  try {
    await clearLocal();
    return { status: "success" };
  } catch {
    return { status: "cleanup_failed" };
  }
}

function isRecoveryCallbackError(): boolean {
  if (typeof window === "undefined") return false;
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  // Inspect keys only; never parse, persist, render or log callback tokens.
  return fragment.has("error") || fragment.has("error_code");
}

function readRecoveryIntent(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.sessionStorage.getItem(RECOVERY_INTENT_KEY) === "1"; }
  catch { return false; }
}

function persistRecoveryIntent(active: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (active) window.sessionStorage.setItem(RECOVERY_INTENT_KEY, "1");
    else window.sessionStorage.removeItem(RECOVERY_INTENT_KEY);
  } catch {
    // The in-memory recovery state remains available if session storage is unavailable.
  }
}

function redirectTo(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return buildAuthRedirectUrl(
    window.location.origin,
    import.meta.env.BASE_URL || window.location.pathname,
  );
}

function mapError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Email hoặc mật khẩu không đúng.";
  if (m.includes("email not confirmed")) return "Email chưa được xác nhận. Kiểm tra hộp thư.";
  if (m.includes("password")) return `Mật khẩu không hợp lệ (tối thiểu ${MIN_PASSWORD_LENGTH} ký tự).`;
  if (m.includes("rate limit")) return "Quá nhiều lần thử. Vui lòng đợi vài phút.";
  return "Không thể thực hiện. Thử lại sau.";
}

function normalizeMfaCode(code: string): string {
  return code.replace(/\s+/g, "");
}

function validMfaCode(code: string): boolean {
  return /^\d{6}$/.test(normalizeMfaCode(code));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCompleted, setRecoveryCompleted] = useState(false);
  const [recoveryError, setRecoveryError] = useState<"invalid_or_expired" | null>(null);
  const [mfaReady, setMfaReady] = useState(!supabaseConfigured);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setReady(true);
      setMfaReady(true);
      return;
    }
    let mounted = true;
    const { data: sub } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        // Persist only a token-free, tab-scoped UI intent. The Supabase SDK remains
        // the sole owner of the provider session and any callback tokens.
        persistRecoveryIntent(true);
        setRecoveryCompleted(false);
        setRecoveryError(null);
        setRecoveryMode(true);
      }
      if (event === "SIGNED_OUT") {
        persistRecoveryIntent(false);
        setRecoveryMode(false);
        setRecoveryCompleted(false);
      }
    });
    // `skipAutoInitialize` in supabase.ts lets this subscription exist before
    // Supabase consumes a password-recovery callback and emits PASSWORD_RECOVERY.
    void client.auth.initialize().then(({ error }) => {
      if (mounted && error && isRecoveryCallbackError()) {
        persistRecoveryIntent(false);
        setRecoveryMode(false);
        setRecoveryError("invalid_or_expired");
      }
      return client.auth.getSession();
    }).then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      // A browser refresh can occur after Supabase consumed the fragment. Restore
      // only the token-free intent and only while the provider still has a session.
      if (data.session && readRecoveryIntent()) {
        setRecoveryCompleted(false);
        setRecoveryError(null);
        setRecoveryMode(true);
      } else if (!data.session) {
        persistRecoveryIntent(false);
      }
    }).catch(() => {
      if (mounted && isRecoveryCallbackError()) {
        persistRecoveryIntent(false);
        setRecoveryMode(false);
        setRecoveryError("invalid_or_expired");
      }
    }).finally(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshMfa = useCallback(async () => {
    if (!supabase || !session) {
      setMfaRequired(false);
      setMfaEnrolled(false);
      setMfaError(null);
      setMfaReady(true);
      return;
    }

    setMfaReady(false);
    try {
      const [assurance, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (assurance.error || factors.error) throw assurance.error || factors.error;

      const verifiedTotp = factors.data.totp.filter((factor) => factor.status === "verified");
      const enrolled = verifiedTotp.length > 0;
      setMfaEnrolled(enrolled);
      setMfaRequired(
        requiresMfaChallenge(
          assurance.data.currentLevel,
          assurance.data.nextLevel,
          enrolled,
        ),
      );
      setMfaError(null);
    } catch {
      setMfaEnrolled(false);
      setMfaRequired(false);
      setMfaError("Không xác minh được trạng thái bảo mật hai bước. Kho vẫn bị khóa.");
    } finally {
      setMfaReady(true);
    }
  }, [session]);

  useEffect(() => {
    void refreshMfa();
  }, [refreshMfa]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: "Chưa cấu hình Supabase." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: mapError(error.message) };
    return {};
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return {};
    const { error } = await supabase.auth.signOut();
    if (error) return { error: "Không kết thúc được phiên đăng nhập. Hãy thử lại." };
    return {};
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return { error: "Chưa cấu hình Supabase." };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo(),
    });
    if (error) return { error: mapError(error.message) };
    return {};
  }, []);

  const updatePassword = useCallback(
    async (password: string) => {
      const policyError = passwordPolicyError(password);
      if (policyError) return { error: policyError };
      if (!supabase || !session) return { error: "Phiên khôi phục không còn hợp lệ." };
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { error: mapError(error.message) };
      persistRecoveryIntent(false);
      setRecoveryMode(false);
      setRecoveryCompleted(true);
      await refreshMfa();
      return {};
    },
    [refreshMfa, session],
  );

  const challengeAndVerify = useCallback(
    async (factorId: string, code: string): Promise<AuthActionResult> => {
      if (!supabase || !session) return { error: "Bạn cần đăng nhập lại." };
      if (!validMfaCode(code)) return { error: "Mã xác minh phải gồm đúng 6 chữ số." };

      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) return { error: "Không tạo được thử thách TOTP. Hãy thử lại." };
      const verification = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: normalizeMfaCode(code),
      });
      if (verification.error) return { error: "Mã TOTP không đúng hoặc đã hết hạn." };

      const current = await supabase.auth.getSession();
      setSession(current.data.session);
      await refreshMfa();
      return {};
    },
    [refreshMfa, session],
  );

  const verifyMfa = useCallback(
    async (code: string) => {
      if (!supabase || !session) return { error: "Bạn cần đăng nhập lại." };
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) return { error: "Không đọc được TOTP factor. Hãy thử lại." };
      const factor = factors.data.totp.find((item) => item.status === "verified");
      if (!factor) return { error: "Tài khoản chưa có TOTP factor đã xác minh." };
      return challengeAndVerify(factor.id, code);
    },
    [challengeAndVerify, session],
  );

  const startMfaEnrollment = useCallback(async (): Promise<AuthActionResult<MfaEnrollment>> => {
    if (!supabase || !session) return { error: "Bạn cần đăng nhập lại." };
    if (mfaEnrolled) return { error: "TOTP đã được bật cho tài khoản này." };
    const enrollment = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Quy VWCE Owner",
    });
    if (enrollment.error) return { error: "Không bắt đầu được thiết lập TOTP." };
    return {
      data: {
        factorId: enrollment.data.id,
        qrCode: enrollment.data.totp.qr_code,
        secret: enrollment.data.totp.secret,
      },
    };
  }, [mfaEnrolled, session]);

  const verifyMfaEnrollment = useCallback(
    async (factorId: string, code: string) => challengeAndVerify(factorId, code),
    [challengeAndVerify],
  );

  const dismissRecoveryError = useCallback(() => {
    setRecoveryError(null);
  }, []);

  const continueAfterRecovery = useCallback(() => {
    setRecoveryCompleted(false);
    setRecoveryError(null);
  }, []);

  const vaultReady =
    !session || (mfaReady && !mfaRequired && !mfaError && !recoveryMode && !recoveryCompleted);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      configured: supabaseConfigured,
      session,
      user: session?.user ?? null,
      recoveryMode,
      recoveryCompleted,
      recoveryError,
      dismissRecoveryError,
      mfaReady,
      mfaRequired,
      mfaEnrolled,
      mfaError,
      vaultReady,
      signIn,
      signOut,
      resetPassword,
      updatePassword,
      continueAfterRecovery,
      refreshMfa,
      verifyMfa,
      startMfaEnrollment,
      verifyMfaEnrollment,
    }),
    [
      ready,
      session,
      recoveryMode,
      recoveryCompleted,
      recoveryError,
      dismissRecoveryError,
      mfaReady,
      mfaRequired,
      mfaEnrolled,
      mfaError,
      vaultReady,
      signIn,
      signOut,
      resetPassword,
      updatePassword,
      continueAfterRecovery,
      refreshMfa,
      verifyMfa,
      startMfaEnrollment,
      verifyMfaEnrollment,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
