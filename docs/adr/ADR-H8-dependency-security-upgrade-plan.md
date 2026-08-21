# ADR-H8 — Kế hoạch nâng dependency để khắc phục security advisory

**Trạng thái:** Accepted — kế hoạch thực thi; từng upgrade vẫn cần PR riêng.  
**Ngày:** 21-08-2026.  
**Phạm vi:** Vitest, Vite và React Router; không bao gồm UX, schema, sync hoặc logic tài chính.

## Bối cảnh

`npm audit` trên lockfile H7 hiện báo **5 moderate, 1 high và 1 critical advisory**. Audit gợi ý Vitest `4.1.11`, Vite `8.2.2` và React Router DOM `7.18.2`. Kiểm tra peer dependency thực tế cho thấy Vitest `4.1.11` yêu cầu Vite `^6 || ^7 || ^8`, nên không thể là một Vitest-only PR trên baseline Vite 5. Vitest `3.2.6` vá critical advisory vì advisory ảnh hưởng `<3.2.6` và vẫn tương thích baseline; Vite 8 và Vitest 4 sẽ được nâng cùng nhau ở PR kế tiếp do peer coupling bắt buộc. Critical advisory của Vitest là file read/execute khi UI server lắng nghe; Vite có advisory high liên quan `server.fs.deny` trên Windows; React Router có advisory open redirect/hydration deserialization. [1] [2] [3]

> Không dùng `npm audit fix --force` và không thực hiện blanket upgrade. Mỗi package được nâng riêng, có commit/PR/review/rollback độc lập để một regression không che khuất nguyên nhân hoặc làm thay đổi financial contract.

## Quyết định

Thực hiện theo thứ tự **Vitest security bridge → Vite + Vitest 4 peer-coupled → React Router**. Vitest 4 không bị gộp tùy tiện với Vite: coupling được audit/peer dependency bắt buộc và chỉ gồm hai package build-test liên quan. Một PR GitHub Actions runtime chỉ được mở sau ba dependency PR, và không được gộp vào chúng. Mỗi PR phải giữ các câu trả lời sau ở mức **NO**: financial semantics changed, schema/Dexie changed, backup compatibility changed, sync semantics changed, migration required, auth/RLS policy changed.

| PR độc lập | Dependency hiện tại | Target audit | Mục tiêu và rủi ro chính |
|---|---:|---:|---|
| H8.1 | Vitest `2.1.8` | `3.2.6` | Security bridge loại critical test-server advisory (`<3.2.6`) mà không kéo Vite major; kiểm tra config, mock, fake IndexedDB, DOM test và scripts dùng `vite-node`. |
| H8.2 | Vite `5.4.11` + Vitest `3.2.6` | Vite `8.2.2` + Vitest `4.1.11` | Loại Vite/esbuild advisory và hoàn tất target Vitest 4; hai package nằm trong một PR duy nhất vì Vitest 4 yêu cầu Vite `^6 || ^7 || ^8`. Kiểm tra build, plugin React, PWA/Workbox, artifact, base path và bundle. |
| H8.3 | React Router DOM `6.28.0` | `7.18.2` | Loại router advisory; kiểm tra deep-link, `NavLink`, navigation state, locale và installed-PWA route boot. |
| H8.4 | GitHub Actions runtime | Chỉ action cần thiết | Loại cảnh báo Node-runtime mà không đổi permissions, secrets, branch publish hoặc deploy flow. |

## Breaking-change handling

Mỗi upgrade bắt đầu từ changelog/release note chính thức của package mục tiêu và một baseline local clean install. Chỉ sửa compatibility issue được chứng minh bởi test/build mới fail. Không đổi data model, transaction classifier, replay ordering, quote validation, backup import, recovery boundary hoặc sync conflict behavior để “làm cho upgrade qua được”. Nếu cần một trong các thay đổi đó, dừng PR đang xét và mở ADR riêng.

## Regression matrix bắt buộc cho từng PR

| Boundary | Evidence bắt buộc |
|---|---|
| Unit/UI/financial | `npm test`, bao gồm H2-B classifier/replay, policy, locale, operational-posture và data-health regressions. |
| Type/build/release | `npm run build`, `npm run check:bundle`, `npm run test:release`. |
| Ledger scale | `npm run benchmark:ledger:check`; giữ windowing và deterministic display behavior. |
| Browser/PWA | `npm run test:preview`; kiểm tra boot, German keyboard path, manifest, service worker/cache và offline shell. |
| Edge/sync boundary | `npm run test:edge-smoke`; không thêm production caller hay provider secret. |
| Production | Sau merge CI green/deploy, chạy `npm run verify:production`; kiểm tra version, shell PWA và quote feed. |
| Audit | Lưu output `npm audit` trước/sau; không gọi advisory đã được giải quyết là “fixed” nếu audit còn báo nó. |

H8.2 bổ sung kiểm tra VitePWA manifest/workbox, GitHub Pages `base`, deep-link fallback, public assets, CSP meta và Vitest 4 peer compatibility. H8.3 bổ sung direct URL test cho bốn route chính cùng overlay/modal focus; không mở thêm route hay redesign navigation architecture. H8.1 phải kiểm tra environment Node/jsdom, test include patterns, `vite-node` benchmark và Playwright integration không bị drift.

## Rollback

Rollback là revert **một PR dependency duy nhất** và chạy lại lockfile/quality gates trên commit revert. Không restore database, backup hoặc financial history vì H8 không được phép thay đổi chúng. Nếu deployment có regression browser/PWA, revert PR gây lỗi, chờ deploy thành công và chạy production verification lại trước khi mở PR kế tiếp.

## H4, H5 và P11.2

H8 không đóng H4 behavioral RLS proof hoặc H5 migration reproducibility. Không được coi dependency upgrade là bằng chứng RLS hay migration. P11.2 FIFO/Vorabpauschale tiếp tục bị khóa chờ independent German tax expert review; không có tax formula, tax export hoặc lời khuyên đầu tư trong H8.

## Hệ quả

Nếu cả H8.1–H8.3 pass và audit không còn các advisory đã nêu, blocker dependency H7 có thể được cập nhật bằng evidence sau cùng. Readiness vẫn là `CONDITIONAL — NOT READY` cho đến khi H4 và H5 có proof độc lập; không có PR dependency nào được quyền nâng claim đó một mình.

## References

[1]: https://github.com/advisories/GHSA-5xrq-8626-4rwp "Vitest arbitrary file read and execution advisory"
[2]: https://github.com/advisories/GHSA-fx2h-pf6j-xcff "Vite server.fs.deny bypass advisory"
[3]: https://github.com/advisories/GHSA-wrjc-x8rr-h8h6 "React Router open redirect advisory"
