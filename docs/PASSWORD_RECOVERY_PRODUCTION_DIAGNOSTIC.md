# Password recovery — production diagnostic checklist

**Status:** Diagnostic only. Do **not** rewrite the recovery callback until this checklist identifies a real failure step.  
**App:** 1.6.0+  
**Safety:** Never record access tokens, refresh tokens, codes, passwords, or session secrets.

## Before the test

- Use a **dedicated test account** (not family production data).
- Confirm Supabase **Redirect URLs** include the exact app origin + base path, e.g. `https://<host>/quy-vwce-cho-be/` (no `#` fragment in the allowlist entry).
- Prefer **iPhone Safari** (Mail → browser). Optionally repeat on desktop.

## Flow

1. Log out of the app.
2. Open **Forgot password** on the auth screen (or Settings → **Gửi link đặt lại mật khẩu** while signed in, then log out before opening the email).
3. Enter the test email → send.
4. Open the recovery email on the device.
5. Tap the recovery link.
6. Fill the observations below **immediately** after the app loads.
7. If **Đặt mật khẩu mới** appears: enter new password (≥14) + confirm → save.
8. Log out.
9. Login with **old** password → must **FAIL**.
10. Login with **new** password → must **SUCCEED**.

Stop at the first failed step and record it.

## After opening the recovery link (redacted)

Record **names only**, never values:

| Observation | Result |
|-------------|--------|
| `origin` | |
| `pathname` | |
| `search` parameter **names** only | |
| `hash` parameter **names** only | |
| `type=recovery` | PRESENT / ABSENT |
| `access_token` (name only) | PRESENT / ABSENT |
| `refresh_token` (name only) | PRESENT / ABSENT |
| `error` (name only) | PRESENT / ABSENT |
| `error_code` (name only) | PRESENT / ABSENT |

## Application state (no secrets)

| State | Result |
|-------|--------|
| Session | PRESENT / ABSENT |
| User | PRESENT / ABSENT |
| `recoveryMode` | TRUE / FALSE |
| **Đặt mật khẩu mới** visible | YES / NO |

## Password update proof

| Step | Result |
|------|--------|
| EMAIL SENT | ✓ / ✗ |
| RECOVERY LINK OPENED | ✓ / ✗ |
| RECOVERY SESSION | ✓ / ✗ / UNVERIFIED |
| NEW PASSWORD FORM | ✓ / ✗ |
| PASSWORD UPDATE API | ✓ / ✗ |
| LOGOUT | ✓ / ✗ |
| OLD PASSWORD REJECTED | ✓ / ✗ |
| NEW PASSWORD ACCEPTED | ✓ / ✗ |

If any step cannot be observed: mark **UNVERIFIED**. Do not claim “password recovery verified” without the full table.

## Notes for engineers

- App uses **HashRouter**. Recovery `redirectTo` must remain **fragment-free** so Supabase can place the session in the URL hash.
- AuthProvider registers `onAuthStateChange` **before** `auth.initialize()` (`skipAutoInitialize: true`).
- UI recovery form requires `user && recoveryMode`. Missing `PASSWORD_RECOVERY` without a valid session → no form.
- This document does **not** authorize callback rewrites; attach filled checklist to the recovery fix PR when evidence exists.
