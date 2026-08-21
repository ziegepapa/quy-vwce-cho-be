# ADR-H8 — Kế hoạch nâng dependency để khắc phục security advisory

**Trạng thái:** Accepted — đã triển khai qua các PR riêng; đây là record của kế hoạch và kết quả.
**Ngày:** 21-08-2026.  
**Phạm vi:** Vitest, Vite và React Router; không bao gồm UX, schema, sync hoặc logic tài chính.

## Bối cảnh

Tại H7 snapshot, `npm audit` báo **5 moderate, 1 high và 1 critical advisory**. Audit gợi ý Vitest `4.1.11`, Vite `8.2.2` và React Router DOM `7.18.2`. Kiểm tra peer dependency thực tế cho thấy Vitest `4.1.11` yêu cầu Vite `^6 || ^7 || ^8`, nên không thể là một Vitest-only PR trên baseline Vite 5. Vitest `3.2.6` vá critical advisory vì advisory ảnh hưởng `<3.2.6` và vẫn tương thích baseline; Vite 8 và Vitest 4 được nâng cùng nhau do peer coupling bắt buộc. Critical advisory của Vitest là file read/execute khi UI server lắng nghe; Vite có advisory high liên quan `server.fs.deny` trên Windows; React Router có advisory open redirect/hydration deserialization. [1] [2] [3]

Kế hoạch đã hoàn tất qua PR #236 (Vitest bridge), #237 (Vite 8 ecosystem), #238 (React Router 7) và #241 (GitHub Actions runtime). `npm audit --json` tại baseline hiện hành báo **0 total vulnerabilities**. Đây là resolution của dependency advisory, không phải resolution của H4/H5 hoặc P11.2. [4]

> Không dùng `npm audit fix --force` và không thực hiện blanket upgrade. Mỗi package được nâng riêng, có commit/PR/review/rollback độc lập để một regression không che khuất nguyên nhân hoặc làm thay đổi financial contract.

## Quyết định

Thực hiện theo thứ tự **Vitest security bridge → Vite + Vitest 4 peer-coupled → React Router**. Vitest 4 không bị gộp tùy tiện với Vite: coupling được audit/peer dependency bắt buộc và chỉ gồm hai package build-test liên quan. Một PR GitHub Actions runtime chỉ được mở sau ba dependency PR, và không được gộp vào chúng. Mỗi PR phải giữ các câu trả lời sau ở mức **NO**: financial semantics changed, schema/Dexie changed, backup compatibility changed, sync semantics changed, migration required, auth/RLS policy changed.

| Hạng mục | Baseline trước | Target | Kết quả đã chứng minh |
|---|---:|---:|---|
| H8.1 / PR #236 | Vitest `2.1.8` | `3.2.6` | Security bridge loại critical test-server advisory mà không kéo Vite major; config, mock, fake IndexedDB, DOM test và scripts `vite-node` pass. |
| H8.2 / PR #237 | Vite `5.4.11`, Vitest `3.2.6`, React plugin 4, PWA plugin `0.21.1` | Vite `8.2.2`, Vitest `4.1.11`, React SWC plugin `4.3.3`, PWA plugin `1.3.0`, direct `vite-node` `6.0.0` | Vite/esbuild advisory resolved; build, React transform, PWA/Workbox, artifact, base path và bundle matrix pass. |
| H8.3 / PR #238 | React Router DOM `6.28.0` | `7.18.2` | Router advisory resolved; route, locale, installed-PWA/browser regression pass. |
| H8.4 / PR #241 | GitHub Actions runtime | Chỉ action cần thiết | Node-runtime warnings removed mà không đổi permissions, secrets, branch publish hoặc deploy flow. |

## React transform compatibility

Vite 8 yêu cầu React plugin mới. `@vitejs/plugin-react` 6 là plugin Babel chính thức nhưng npm không peer-resolve sạch với Workbox/Babel 7 hiện hữu: optional Rolldown Babel peer dẫn tới yêu cầu Babel 8 release candidate. Không dùng `--force`, `--legacy-peer-deps` hoặc Babel prerelease để che resolution conflict. H8.2 dùng `@vitejs/plugin-react-swc` 4.3.3, official Vite React transform plugin có peer range hỗ trợ Vite 8; config chỉ đổi import plugin, còn JSX/application semantics không đổi. Preview giữ warning hiệu năng từ plugin về việc không có SWC plugin bổ sung; warning này không phải lỗi build/runtime và được ghi nhận để xem xét sau security baseline, không tự ý đưa Babel prerelease vào release.

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

H8.2 bổ sung kiểm tra VitePWA manifest/workbox, GitHub Pages `base`, deep-link fallback, public assets, CSP meta, Vitest 4 peer compatibility và direct `vite-node` benchmark executable. H8.3 bổ sung direct URL test cho bốn route chính cùng overlay/modal focus; không mở thêm route hay redesign navigation architecture. H8.1 phải kiểm tra environment Node/jsdom, test include patterns, `vite-node` benchmark và Playwright integration không bị drift.

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
[4]: ../LONG_TERM_READINESS.md "Current dependency audit and remaining readiness blockers"
