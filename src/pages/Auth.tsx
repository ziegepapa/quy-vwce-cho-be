import { useState } from "react";
import { useAuth } from "../lib/auth";

type Mode = "login" | "register" | "forgot";

export default function AuthPage() {
  const { signIn, signUp, resetPassword, configured } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "login") {
        const r = await signIn(email.trim(), password);
        if (r.error) setError(r.error);
      } else if (mode === "register") {
        if (password.length < 6) {
          setError("Mật khẩu tối thiểu 6 ký tự.");
          return;
        }
        const r = await signUp(email.trim(), password, name.trim());
        if (r.error) setError(r.error);
        else setInfo("Đăng ký thành công. Kiểm tra email để xác nhận (nếu bật). Có thể đăng nhập ngay.");
      } else {
        const r = await resetPassword(email.trim());
        if (r.error) setError(r.error);
        else setInfo("Đã gửi email đặt lại mật khẩu (nếu email tồn tại).");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="app-shell">
        <div className="card">
          <h1 className="page-title">Chưa cấu hình đăng nhập</h1>
          <p className="muted">
            Thiếu <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> trong build.
            Thêm GitHub Secrets rồi chạy lại workflow deploy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell auth-shell">
      <div className="card auth-card">
        <p className="muted" style={{ marginTop: 0 }}>
          Quỹ VWCE cho bé
        </p>
        <h1 className="page-title">
          {mode === "login" && "Đăng nhập"}
          {mode === "register" && "Tạo tài khoản"}
          {mode === "forgot" && "Quên mật khẩu"}
        </h1>
        <p className="muted">
          Tài khoản thật qua Supabase. Dữ liệu được bảo vệ theo từng người dùng.
        </p>

        <form onSubmit={submit}>
          {mode === "register" && (
            <div className="field">
              <label htmlFor="name">Tên hiển thị</label>
              <input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {mode !== "forgot" && (
            <div className="field">
              <label htmlFor="password">Mật khẩu</label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {error && (
            <div className="banner" role="alert" style={{ background: "var(--red-bg)", color: "var(--red)" }}>
              {error}
            </div>
          )}
          {info && (
            <div className="banner" role="status" style={{ background: "var(--green-bg)", color: "var(--green)" }}>
              {info}
            </div>
          )}

          <button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : mode === "register" ? "Đăng ký" : "Gửi email"}
          </button>
        </form>

        <div className="stack" style={{ marginTop: "1rem" }}>
          {mode !== "login" && (
            <button type="button" className="secondary" onClick={() => setMode("login")}>
              Về đăng nhập
            </button>
          )}
          {mode === "login" && (
            <>
              <button type="button" className="secondary" onClick={() => setMode("register")}>
                Tạo tài khoản mới
              </button>
              <button type="button" className="secondary" onClick={() => setMode("forgot")}>
                Quên mật khẩu
              </button>
            </>
          )}
        </div>
      </div>
      <p className="disclaimer" style={{ textAlign: "center" }}>
        Không phải tư vấn đầu tư. Dữ liệu lưu trên thiết bị và đồng bộ Supabase khi đã đăng nhập.
      </p>
    </div>
  );
}
