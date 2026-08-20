import { useState } from "react";
import { MIN_PASSWORD_LENGTH, passwordPolicyError, useAuth } from "../lib/auth";
import { useLocale } from "../lib/locale";

type Mode = "login" | "forgot";

function Brand({ label }: { label: string }) {
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
        {label}
      </p>
    </div>
  );
}

function authCopy(locale: "vi" | "de") {
  return locale === "de" ? {
    brand: "VWCE-Fonds für das Kind", missingConfig: "Anmeldung nicht konfiguriert", missingConfigBody: "Im Build fehlen VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.", passwordsMismatch: "Die beiden Passwörter stimmen nicht überein.", passwordPolicy: "Das Passwort erfüllt nicht die Sicherheitsanforderungen.", newPassword: "Neues Passwort", recoveryBody: "Der Wiederherstellungslink ist gültig. Legen Sie ein eigenes Passwort für den Familien-Vault fest.", password: "Passwort", confirmPassword: "Passwort wiederholen", minimum: (count: number) => `Mindestens ${count} Zeichen`, updating: "Wird aktualisiert…", savePassword: "Neues Passwort speichern", mfa: "Zwei-Faktor-Bestätigung", mfaBody: "Geben Sie den sechsstelligen Code Ihrer Authenticator-App ein, um den Vault zu öffnen.", checking: "Wird geprüft…", retry: "Erneut versuchen", totp: "TOTP-Code", verifying: "Wird bestätigt…", openVault: "Vault öffnen", openingVault: "Vault wird geöffnet…", resetSent: "Falls das Konto existiert, wurde eine E-Mail zum Zurücksetzen gesendet.", login: "Anmelden", forgot: "Passwort vergessen", privateVault: "Privater Familien-Vault. Neue Konten werden ausschließlich vom Owner angelegt und bestätigt.", processing: "Wird verarbeitet…", sendEmail: "E-Mail senden", backToLogin: "Zur Anmeldung", disclaimer: "Keine Anlageberatung. Daten verbleiben auf diesem Gerät und werden erst nach Anmeldung synchronisiert.",
  } : {
    brand: "Quỹ VWCE cho bé", missingConfig: "Chưa cấu hình đăng nhập", missingConfigBody: "Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong build.", passwordsMismatch: "Hai mật khẩu chưa khớp.", passwordPolicy: "Mật khẩu chưa đáp ứng yêu cầu bảo mật.", newPassword: "Đặt mật khẩu mới", recoveryBody: "Link recovery hợp lệ. Hãy đặt mật khẩu riêng cho kho gia đình.", password: "Mật khẩu", confirmPassword: "Nhập lại mật khẩu", minimum: (count: number) => `Tối thiểu ${count} ký tự`, updating: "Đang cập nhật…", savePassword: "Lưu mật khẩu mới", mfa: "Xác minh hai bước", mfaBody: "Nhập mã 6 chữ số từ ứng dụng authenticator để mở kho.", checking: "Đang kiểm tra…", retry: "Thử lại", totp: "Mã TOTP", verifying: "Đang xác minh…", openVault: "Mở kho", openingVault: "Đang mở kho…", resetSent: "Đã gửi email đặt lại mật khẩu nếu account tồn tại.", login: "Đăng nhập", forgot: "Quên mật khẩu", privateVault: "Kho gia đình riêng tư. Tài khoản mới chỉ do Owner tạo và xác minh trước.", processing: "Đang xử lý…", sendEmail: "Gửi email", backToLogin: "Về đăng nhập", disclaimer: "Không phải tư vấn đầu tư. Dữ liệu trên thiết bị và đồng bộ khi đã đăng nhập.",
  };
}

export default function AuthPage() {
  const { locale } = useLocale();
  const text = authCopy(locale);
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
          <h1 className="page-title">{text.missingConfig}</h1>
          <p className="muted">
            {text.missingConfigBody}
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
        setError(locale === "de" ? text.passwordPolicy : policyError);
        return;
      }
      if (password !== confirmPassword) {
        setError(text.passwordsMismatch);
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
        <Brand label={text.brand} />
        <div className="card auth-card">
          <h1 className="page-title">{text.newPassword}</h1>
          <p className="muted">{text.recoveryBody}</p>
          <form onSubmit={submitRecovery}>
            <div className="field">
              <label htmlFor="new-password">{text.newPassword}</label>
              <input
                id="new-password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="field-hint">{text.minimum(MIN_PASSWORD_LENGTH)}</p>
            </div>
            <div className="field">
              <label htmlFor="confirm-password">{text.confirmPassword}</label>
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
              {busy ? text.updating : text.savePassword}
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
        <Brand label={text.brand} />
        <div className="card auth-card">
          <h1 className="page-title">{text.mfa}</h1>
          <p className="muted">{text.mfaBody}</p>
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
                {busy ? text.checking : text.retry}
              </button>
            </>
          ) : (
            <form onSubmit={submitMfa}>
              <div className="field">
                <label htmlFor="mfa-code">{text.totp}</label>
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
                {busy ? text.verifying : text.openVault}
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
        <p className="muted">{text.openingVault}</p>
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
        else setInfo(text.resetSent);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell auth-shell">
      <Brand label={text.brand} />
      <div className="card auth-card">
        <h1 className="page-title">{mode === "login" ? text.login : text.forgot}</h1>
        <p className="muted">
          {text.privateVault}
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
              <label htmlFor="password">{text.password}</label>
              <input
                id="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="field-hint">{text.minimum(MIN_PASSWORD_LENGTH)}</p>
            </div>
          ) : null}

          {error ? <div className="banner error" role="alert">{error}</div> : null}
          {info ? <div className="banner success" role="status">{info}</div> : null}

          <button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? text.processing : mode === "login" ? text.login : text.sendEmail}
          </button>
        </form>

        <div className="stack" style={{ marginTop: "1rem" }}>
          {mode === "forgot" ? (
            <button type="button" className="secondary" onClick={() => setMode("login")}>
              {text.backToLogin}
            </button>
          ) : (
            <button type="button" className="ghost" onClick={() => setMode("forgot")}>
              {text.forgot}?
            </button>
          )}
        </div>
      </div>

      <p className="disclaimer" style={{ textAlign: "center", marginTop: 16 }}>
        {text.disclaimer}
      </p>
    </div>
  );
}
