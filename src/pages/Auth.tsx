import { useState } from "react";
import { MIN_PASSWORD_LENGTH, passwordPolicyError, useAuth } from "../lib/auth";

type Mode = "login" | "forgot";

function Brand() {
  return (
    <div style={{ textAlign: "center", marginBottom: 8 }}>
      <div
        className="avatar"
        style={{ width: 56, height: 56, fontSize: "1.25rem", margin: "0 auto 12px" }}
        aria-hidden
      >
        VW
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Quỹ VWCE cho bé
      </p>
    </div>
  );
}

export default function AuthPage() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  if (!auth.configured) {
    return (
      <div className="app-shell auth-shell">
        <div className="card">
          <h1 className="page-title">Chưa cấu hình đăng nhập</h1>
          <p className="muted">
            Thiếu <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> trong build.
          </p>
        </div>
      </div>
    );
  }

  if (auth.user && auth.recoveryMode) {
    async function submitRecovery(event: React.FormEvent) {
      event.preventDefault();
      setError("");
      const policyError = passwordPolicyError(password);
      if (policyError) {
        setError(policyError);
        return;
      }
      if (password !== confirmPassword) {
        setError("Hai mật khẩu chưa khớp.");
        return;
      }
      setBusy(true);
      try {
        const result = await auth.updatePassword(password);
        if (result.error) setError(result.error);
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="app-shell auth-shell">
        <Brand />
        <div className="card auth-card">
          <h1 className="page-title">Đặt mật khẩu mới</h1>
          <p className="muted">Link recovery hợp lệ. Hãy đặt mật khẩu riêng cho kho gia đình.</p>
          <form onSubmit={submitRecovery}>
            <div className="field">
              <label htmlFor="new-password">Mật khẩu mới</label>
              <input
                id="new-password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="field-hint">Tối thiểu {MIN_PASSWORD_LENGTH} ký tự</p>
            </div>
            <div className="field">
              <label htmlFor="confirm-password">Nhập lại mật khẩu</label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            {error ? <div className="banner error" role="alert">{error}</div> : null}
            <button type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Đang cập nhật…" : "Lưu mật khẩu mới"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (auth.user && (auth.mfaRequired || auth.mfaError)) {
    async function submitMfa(event: React.FormEvent) {
      event.preventDefault();
      setError("");
      setBusy(true);
      try {
        const result = await auth.verifyMfa(mfaCode);
        if (result.error) setError(result.error);
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="app-shell auth-shell">
        <Brand />
        <div className="card auth-card">
          <h1 className="page-title">Xác minh hai bước</h1>
          <p className="muted">Nhập mã 6 chữ số từ ứng dụng authenticator để mở kho.</p>
          {auth.mfaError ? (
            <>
              <div className="banner error" role="alert">{auth.mfaError}</div>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await auth.refreshMfa();
                  setBusy(false);
                }}
                style={{ width: "100%" }}
              >
                {busy ? "Đang kiểm tra…" : "Thử lại"}
              </button>
            </>
          ) : (
            <form onSubmit={submitMfa}>
              <div className="field">
                <label htmlFor="mfa-code">Mã TOTP</label>
                <input
                  id="mfa-code"
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))}
                />
              </div>
              {error ? <div className="banner error" role="alert">{error}</div> : null}
              <button type="submit" disabled={busy} style={{ width: "100%" }}>
                {busy ? "Đang xác minh…" : "Mở kho"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (auth.user) {
    return (
      <div className="app-shell auth-shell">
        <p className="muted">Đang mở kho…</p>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "login") {
        const result = await auth.signIn(email.trim(), password);
        if (result.error) setError(result.error);
      } else {
        const result = await auth.resetPassword(email.trim());
        if (result.error) setError(result.error);
        else setInfo("Đã gửi email đặt lại mật khẩu nếu account tồn tại.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell auth-shell">
      <Brand />
      <div className="card auth-card">
        <h1 className="page-title">{mode === "login" ? "Đăng nhập" : "Quên mật khẩu"}</h1>
        <p className="muted">
          Kho gia đình riêng tư. Tài khoản mới chỉ do Owner tạo và xác minh trước.
        </p>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {mode === "login" ? (
            <div className="field">
              <label htmlFor="password">Mật khẩu</label>
              <input
                id="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="field-hint">Tối thiểu {MIN_PASSWORD_LENGTH} ký tự</p>
            </div>
          ) : null}

          {error ? <div className="banner error" role="alert">{error}</div> : null}
          {info ? <div className="banner success" role="status">{info}</div> : null}

          <button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Gửi email"}
          </button>
        </form>

        <div className="stack" style={{ marginTop: "1rem" }}>
          {mode === "forgot" ? (
            <button type="button" className="secondary" onClick={() => setMode("login")}>
              Về đăng nhập
            </button>
          ) : (
            <button type="button" className="ghost" onClick={() => setMode("forgot")}>
              Quên mật khẩu?
            </button>
          )}
        </div>
      </div>

      <p className="disclaimer" style={{ textAlign: "center", marginTop: 16 }}>
        Không phải tư vấn đầu tư. Dữ liệu trên thiết bị và đồng bộ khi đã đăng nhập.
      </p>
    </div>
  );
}
