# ADR-PB1 — Password-recovery callback trên GitHub Pages HashRouter

**Trạng thái:** Được chấp nhận và đã triển khai qua PR #247.  
**Ngày:** 21-08-2026.  
**Phạm vi:** Callback đặt lại mật khẩu Supabase trong PWA client-only; không bao gồm RLS, identity model, email template, MFA policy, storage backend hoặc Supabase project configuration.

## Bối cảnh và nguyên nhân gốc

VWCE Vault chạy bằng `HashRouter` trên GitHub Pages. Password recovery implicit flow của Supabase trả access/refresh token vào **URL fragment**; Supabase client tự nhận fragment, lưu session theo storage đã cấu hình và phát sự kiện `PASSWORD_RECOVERY`. [1] [2]

Trước PR #247, `resetPasswordForEmail()` dùng redirect URL `.../#/settings`. Hash route này đã chiếm fragment duy nhất trước khi Supabase có thể nhận callback fragment. Ngoài ra, client module-scoped có thể tự initialize trước khi `AuthProvider` đăng ký listener React, tạo race khiến sự kiện recovery không được UI nhận một cách chắc chắn.

> Token callback không được parse, log, render, đưa vào diagnostics hoặc tự lưu bởi application code. Supabase client giữ session theo cấu hình chuẩn hiện hữu; đây không phải recovery-token store riêng của ứng dụng. [1]

## Quyết định

PR #247 thay redirect destination bằng root URL fragment-free của GitHub Pages, ví dụ `https://ziegepapa.github.io/quy-vwce-cho-be/`. Root callback để Supabase giữ fragment token riêng, theo implicit flow chính thức. [1]

Supabase client dùng `skipAutoInitialize: true`, và `AuthProvider` thực hiện theo thứ tự **subscribe `onAuthStateChange` → `initialize()` → `getSession()`**. Sự kiện `PASSWORD_RECOVERY` vì thế được listener UI nhận trước khi readiness/session state được quyết định. Đây vẫn là API chuẩn public của Supabase Auth, không dùng private SDK API hoặc parser token tùy biến. [2] [3]

| Tình huống | Hành vi đã khóa | Không được làm |
|---|---|---|
| Link recovery hợp lệ | Hiển thị form mật khẩu mới sau `PASSWORD_RECOVERY`; chỉ gọi `updateUser` khi có recovery session. | Điều hướng hash trước callback, tự lưu token, tự cập nhật mật khẩu. |
| Link hết hạn/sai | Chỉ tạo mã state `invalid_or_expired` và thông báo an toàn theo locale. | Hiển thị token, `error_description` raw, stack trace hoặc provider error. |
| Cập nhật mật khẩu lỗi | Giữ recovery mode để người dùng có thể thử lại. | Bỏ qua lỗi và mở vault như thể recovery đã hoàn tất. |
| UI tiếng Đức | Chỉ hiển thị German safe copy cho provider error. | Rò rỉ Vietnamese provider copy hoặc language mixing. |

## Evidence

Regression local deterministic trong PR #247 chứng minh root callback không có hash route; subscriber được đăng ký trước initialize; synthetic `PASSWORD_RECOVERY` tạo recovery state; invalid callback không tạo session/không render raw error; success/failure password update có state đúng; và copy Việt/Đức không lẫn. Các tests được thêm vào normal Vitest release gate.

PR #247 đã pass `test-build`, `preview-smoke`, `edge-smoke`, deploy `main` và `npm run verify:production`. Đây là evidence application-level; test email-link với provider thật vẫn cần một Supabase environment isolated có redirect allow-list và email configuration rõ ràng. Không dùng production family account/data để thực hiện test này. [4]

## Non-goals và rollback

Không thay RLS policy, auth identity, recovery email template, MFA factor, session persistence policy, Dexie/schema, backup, sync, financial classifier/replay hoặc route architecture. Nếu cần đổi bất kỳ phần nào, phải có ADR và PR riêng.

Rollback là revert PR #247. Không có migration, data rewrite, credential rotation hoặc backup-format change.

## References

[1]: https://supabase.com/docs/guides/auth/sessions/implicit-flow "Supabase Auth implicit flow"
[2]: https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail "Supabase JavaScript resetPasswordForEmail"
[3]: https://supabase.com/docs/reference/javascript/auth-initialize "Supabase JavaScript initialize"
[4]: https://supabase.com/docs/guides/auth/redirect-urls "Supabase Auth redirect URLs"
