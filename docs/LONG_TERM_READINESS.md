# Long-Term Stable Baseline v1 — Báo cáo Readiness

**Tác giả:** Manus AI

**Phiên bản ứng dụng:** `1.6.0`

**Commit phát hành mới nhất đã kiểm chứng:** `ff3f1b6458cbddc940b470db8fbc6ceb1de5d2e5` (merge PR #251) [22]

**Ngày đánh giá evidence:** 21-08-2026 (GMT+2)

**Đối tượng sử dụng:** Gia đình sở hữu vault và người bảo trì kế tiếp.

> **Trạng thái baseline 23/08/2026: `CONDITIONAL — NOT READY` cho vai trò sổ cái tài chính duy nhất, có thẩm quyền tuyệt đối.**
>
> VWCE Vault có đủ evidence để tiếp tục vận hành như một **tracker local-first** có kiểm soát, khi owner lưu sao kê/chứng từ broker độc lập và diễn tập backup. Security dependency audit nay sạch; client release, UX mobile-first, recovery runbook/drill, password-reset callback và release gates đã được harden. Tuy nhiên H4 chưa có request-level behavioral RLS proof và H5 chưa có ordered migration baseline cùng controlled upgrade/rollback proof. P11.2 vẫn tuyệt đối bị khóa chờ independent German tax expert review. Các điểm này không được che khuất bởi CI xanh.

| Phạm vi sử dụng | Kết luận | Điều kiện vận hành |
|---|---|---|
| Theo dõi danh mục local-first hằng ngày | **Có thể sử dụng** | Owner chủ động export backup, xem Sync Health/Data Health và giữ sao kê broker độc lập. |
| Bản ghi duy nhất để quyết định hoặc tái tạo toàn bộ lịch sử tài chính | **Không sẵn sàng** | H4 và H5 còn blocker độc lập; không bỏ qua chúng vì dependency audit đã sạch. |
| Tính thuế, FIFO hoặc Vorabpauschale | **Không được hỗ trợ** | P11.2 bị khóa; không dùng output để khai thuế. |

## 1. Mục đích sản phẩm

VWCE Vault là PWA mobile-first để gia đình ghi nhận giao dịch, khoản góp, giá trị danh mục, backup và trạng thái đồng bộ theo mô hình local-first. Đây là công cụ ghi nhận và rà soát dữ liệu do owner kiểm soát, **không phải** broker, công cụ thực hiện lệnh, tư vấn đầu tư hay dịch vụ lập/khai thuế. Các boundary này được khóa trong policy và regression contract H0–H2-B. [2]

## 2. Vòng đời vô thời hạn

Hệ thống có **vòng đời vô thời hạn**. Mốc 2042, nếu có trong kế hoạch gia đình, là mốc mục tiêu tài chính; không phải ngày hết hạn phần mềm, mốc xóa dữ liệu hay giới hạn hoạt động được hard-code. Mọi thay đổi tương lai phải ưu tiên tính đúng, toàn vẹn dữ liệu và khả năng khôi phục hơn tính năng mới. [3]

## 3. Kiến trúc và release hiện tại

Release hiện tại dùng React 18, TypeScript, Vite `8.2.2`, Dexie/IndexedDB cho vault local-first, Supabase chỉ cho auth/sync contract hiện hữu, và GitHub Pages cho static PWA. PR #251 đã deploy thành công trên `main`; production verification không-invasive sau deploy xác nhận app version `1.6.0`, app shell, PWA và quote feed công khai hoạt động, với VWCE `166.3 EUR` tại lần kiểm tra ngày 21-08-2026. [22] [23]

| Thành phần | Trách nhiệm | Ranh giới đã khóa |
|---|---|---|
| React/TypeScript/Vite | UI song ngữ, build và runtime client | Không đưa secret/service-role vào client. |
| Dexie/IndexedDB | Vault local-first và replay dữ liệu | Giữ `DEXIE_DB_VERSION=4`; không có migration trong baseline này. |
| Supabase | Auth/sync contract hiện hữu | Không tạo migration, không auto-resolve conflict. |
| PWA/GitHub Pages | Shell cài đặt/offline và static hosting | CSP là meta CSP; chưa là HTTP response-header CSP. |

## 4. Hoàn tất H0–H2-B: nền tảng toàn vẹn tài chính

H0 và H0.1 đặt policy boundary: không có tax estimate public hoặc glide-path prescriptive. H1 dùng `package.json` làm nguồn version chuẩn. H2-A lập ADR và inventory evidence; H2-B đưa classifier canonical vào mọi đường ghi mới và replay, đồng thời tạo quarantine **derived** cho evidence legacy không an toàn. [2]

H2-B không sửa raw historical transaction, không nâng Dexie/schema backup, không thay sync semantics và không auto-repair. Golden persistence/replay, UI path và benchmark deterministic ở quy mô ledger lớn bảo đảm một record thiếu thông tin được giữ làm evidence thay vì bị “đoán” là hợp lệ. [2]

## 5. Financial invariants

| Invariant | Hành vi bắt buộc | Hành vi bị cấm |
|---|---|---|
| Oversell | Bán vượt lượng nắm giữ là **`INVALID`** và bị từ chối khi new ingestion. | Không âm holdings, không tự điều chỉnh quantity. |
| Missing quantity | Giao dịch thiếu quantity là **`INCOMPLETE`**. | Không gán số lượng mặc định hoặc giả định FIFO. |
| Legacy unsafe evidence | Giữ raw record nhưng không tạo financial effect qua derived quarantine. | Không xóa, rewrite hay “sửa” quá khứ im lặng. |
| Replay | Sắp xếp/replay xác định qua contract canonical. | Không phụ thuộc thứ tự ngẫu nhiên của storage/UI. |
| Conflict | Owner tự xem và chọn từng xung đột. | Không auto-merge, auto-select local/server hoặc ghi đè tự động. |

Các invariant này là cơ sở để Data Health báo fact có nguồn thay vì health score tổng hợp, forecast hoặc action đầu tư. Regression gates trên PR #242/#243 tiếp tục bao gồm financial policy, H2-B oversell, ledger benchmark 10.000 giao dịch và contracts của saved views/filter. [1] [2]

## 6. Bằng chứng backup và recovery: H3

H3 giữ `schemaVersion: 4` và bổ sung optional metadata envelope: app release, nhãn Dexie, portable domain allowlist và exact record count. Nếu metadata hiện diện nhưng sai shape/identity/count, import fail-closed trước restore destructive; backup v1–v4 không có metadata vẫn đọc được. [2]

Synthetic restore drill kiểm tra calculate → export → JSON boundary → wipe → import → reopen → canonical replay → compare, gồm settings, goals, quote evidence, transactions live/tombstone và legacy row quarantine. PR #246 mở rộng drill bằng metadata/version/domain/count exact contract và corruption matrix gồm malformed root, unsupported schema, duplicate identity, invalid domain, missing collection, invalid number, live/deleted conflict và metadata count mismatch; mọi case bị từ chối phải giữ vault fixture không đổi. Đây là evidence fixture tổng hợp, **không** chứng minh backup gia đình đang an toàn ngoài thiết bị. Owner vẫn cần export định kỳ, kiểm tra file và diễn tập trên vault/profile thử nghiệm. [2] [5] [18]

## 7. Bằng chứng RLS và security: H4

H4 có **static policy evidence**: catalog/source policy định nghĩa RLS owner-only cho `profiles`, `app_settings`, `goals`, `transactions`, `annual_checklists` và `monthly_snapshots`; static scan không thấy client TypeScript/TSX surface chứa service-role secret. Điều đó xác nhận intended boundary, không thay thế request thực bằng JWT của từng principal. [6]

Đánh giá local-only ngày 21-08 không thể tạo proof behavioral hợp lệ. Supabase local yêu cầu Docker-compatible runtime với Auth, API và Postgres; documentation hiện hành nêu stack local miễn phí nhưng yêu cầu Docker và tối thiểu 7 GB RAM. Sandbox evaluation có 3.8 GiB RAM tổng, 2.3 GiB available, không có Docker/Supabase CLI; vì vậy không cài/chạy một stack có khả năng thiếu tài nguyên. Re-evaluation post-baseline xác nhận không có Supabase CLI, Docker, PostgreSQL server hay remote target được xác nhận non-production/isolated; plain PostgreSQL không được dùng làm surrogate vì nó không kiểm chứng Supabase Auth/JWT/PostgREST request path. [7] [19]

| Matrix H4 bắt buộc | Trạng thái | Lý do |
|---|---|---|
| User A đọc/sửa/xóa record của chính mình | Chưa chạy | Không có full controlled Supabase local stack. |
| User B đọc/sửa/xóa record của User A bị từ chối | Chưa chạy | Không dùng production family data, account hay branch/project trả phí. |
| Anonymous read/write bị từ chối | Chưa chạy | Cần auth/token/API request path thực trong môi trường isolated. |
| Deleted-user cleanup/foreign-key behavior | Chưa chạy | Cần fixture identity synthetic trong stack đầy đủ. |
| Client flow qua published auth/token path | Chưa chạy | Catalog/RLS static proof không thay thế token-level request. |

**Trạng thái H4 cuối:** **`PARTIAL — STATIC POLICY EVIDENCE ONLY`**. Không có production shortcut, service-role simulation hoặc remote write/delete fixture.

## 8. Bằng chứng đồng bộ

Outbox, tombstone, recovery và conflict contracts hiện hữu được giữ nguyên qua toàn bộ hardening/UX PRs. Sync vận hành fail-closed: pending/retry/offline không được diễn giải thành server acceptance; recovery chưa hoàn tất chặn write; logout bị chặn khi còn pending/outbox error/conflict/recovery blocker; và conflict dừng để owner chọn rõ ràng. [5]

Đây là evidence contract source/test và vận hành có kiểm soát, không phải behavioral RLS multi-user. Không thay đổi sync namespace, conflict resolution hoặc tombstone trong baseline này. [2]

## 9. Toàn vẹn quote

Quote feed có provenance validation cho shape/envelope, date, currency, ISIN, provider URL, duplicate key và future-date trước write. Offline/error/partial hoặc giá stale/missing giữ nguyên trạng thái không hoàn chỉnh; app không bịa giá lịch sử, không biến missing price thành zero và không suy ra performance từ một quote hiện tại. [5]

Production verification sau PR #243 xác nhận shell/PWA/quote feeds tại thời điểm kiểm tra. Nó không biến một lần quote trả về thành đảm bảo availability liên tục hay khuyến nghị mua/bán/giữ. [4]

## 10. Provenance và migration reproducibility: H5

Trade Republic execution PDF giữ contract source-specific `source`, `sourceVersion` và document-derived `externalRef`, với validation/dedupe trước persistence. Depot statement chỉ là evidence đối soát read-only; manual entry cố ý không nhận generic auto-dedupe vì không có broker-document identity đáng tin cậy. [8]

Đánh giá controlled local ngày 21-08 chứng minh `supabase/migrations/` chỉ có `002_soft_delete_and_triggers.sql`. Khi áp dụng file này lên blank PostgreSQL database synthetic, replay fail tại `public.app_settings` không tồn tại: repository không có ordered initial migration baseline. Khi thử manual `schema.sql` trước `002`, plain PostgreSQL dừng tại managed Supabase function `auth.uid()` không tồn tại. Re-evaluation post-baseline xác nhận tree này không đổi và không có Supabase local stack/full database server controlled. Không thêm function giả, không sửa schema/migration, không pull schema từ production và không chạy destructive remote drill; một harness như vậy sẽ không chứng minh Supabase-compatible upgrade/rollback. [7] [8] [19]

| Chứng cứ H5 yêu cầu | Trạng thái | Kết luận |
|---|---|---|
| Ordered baseline cho blank apply | Không có | Migration tree không standalone/replayable từ DB trống. |
| Representative upgrade | Chưa chạy | Không có full controlled Supabase stack và baseline migration. |
| Backup/sync compatibility trong environment mới | Chưa chạy | H3 client restore evidence không suy rộng thành database/sync migration evidence. |
| Rollback drill | Chưa chạy | Không làm migration/DDL/rollback trên production hoặc data gia đình. |

**Trạng thái H5 cuối:** **`BLOCKED — NO ORDERED BASELINE; NO FULL CONTROLLED SUPABASE UPGRADE/ROLLBACK ENVIRONMENT`**.

## 11. Data Health và UX information architecture: H6

H6 cung cấp Portfolio Data Health read-only, deterministic, gồm reason/source/severity/count/link từ canonical transaction health, quote snapshot và backup bookkeeping facts. Unknown vẫn là unknown; không có numeric health score, background repair, forecast hay action đầu tư. Transaction inbox chỉ mở đường chỉnh sửa hiện hữu để owner tự xem/ra quyết định. [9]

PR #242 chuyển Overview thành compact portfolio-state surface: hero, price, holdings/Sparplan, rhythm, Data Health summary, current goal và yearly review compact; loại bỏ streak/performance dashboard dư thừa. PR #243 chuyển Transactions sang ledger-first: factual summary, Data Quality entry gọn, search, mobile filter sheet, active chips, instrument/status display lens, saved views/PDF disclosure và mobile safe-area clearance. Các thay đổi này không sửa classifier/replay, holdings/cost basis/P&L semantics, quote, Dexie/schema, backup, sync/auth/RLS hay migration. [1] [10] [11]

## 12. Dependency, reproducibility và client security: H7–H8

H7 thêm `package-lock.json` v3, chuẩn hóa workflow sang `npm ci`, exact-pin Playwright `1.62.1`, đồng bộ browser image và kiểm tra lockfile/workflow/client-image parity. GitHub Actions runtime được cập nhật lên `checkout@v5`, `setup-node@v5`, `upload-artifact@v7` và `download-artifact@v8`, loại bỏ warnings Node 20. [12] [13]

H8 được triển khai qua PR nhỏ độc lập: Vitest security bridge `3.2.6` (PR #236), Vite build ecosystem gồm Vite `8.2.2`, Vitest `4.1.11`, React SWC plugin và PWA plugin (PR #237), rồi React Router `7.18.2` (PR #238). `npm audit --json` ở commit release hiện hành trả về **0 total vulnerabilities**: 0 info, low, moderate, high và critical. Không dùng `npm audit fix --force`. [14] [15] [16]

Static shell có meta CSP; source-level guard từ chối service-role references, dynamic evaluation và raw HTML sinks dưới `src/**`. Đây là defense-in-depth phù hợp static GitHub Pages, không thay RLS behavioral proof, penetration test hoặc HTTP response-header CSP. [12]

## 13. Post-baseline maintenance evidence

PR #245 thêm runbook bảo trì/khôi phục khẩn cấp với release sequence, stop conditions, synthetic restore drill, dependency-update discipline và handover status. PR #246 mở rộng synthetic recovery evidence có tính xác định. PR #247 sửa password-recovery callback cho GitHub Pages HashRouter: callback redirect không còn chiếm token fragment; listener `PASSWORD_RECOVERY` được đăng ký trước initialization; link invalid/expired chỉ hiển thị locale copy an toàn, không raw error/token. PR #248 đồng bộ README/ADR với audit sạch, vòng đời vô thời hạn và các readiness blocker còn lại. PR #251 hoàn thiện UX recovery: intent token-free, tab-scoped chỉ khôi phục form khi provider session còn hợp lệ; màn hình thành công buộc owner chủ động mở vault; link invalid/expired có đường yêu cầu link mới hoặc quay lại đăng nhập, không render provider error/token. Cùng PR này, Cài đặt được rút gọn thành Account & Security → Sync → Data → App → Advanced, bỏ Berlin clock, dùng `last_sign_in_at` chỉ-đọc, hiển thị timestamp đồng bộ cục bộ theo fact và đặt chẩn đoán chi tiết sau disclosure. PR #251 không thay database schema, Dexie version, backup/import, sync semantics, financial core hoặc RLS. Tất cả năm PR được merge sau ba required CI gates xanh, deploy `main` và production verification. [20] [18] [21] [1] [22] [23]

Production verification #251 chỉ kiểm tra public app shell/PWA/quote feeds. Mailbox delivery và real-browser password-recovery E2E không được chạy vì không sử dụng credentials hay mailbox production; do đó hai phần này vẫn **chưa được kiểm chứng**, không được diễn giải thành evidence auth-provider end-to-end.

Các cải thiện này nâng correctness của recovery/handover/auth, độ rõ ràng Cài đặt và documentation provenance, nhưng không là behavioral RLS proof, migration reproducibility proof hoặc P11.2 tax review. Vì vậy không đủ điều kiện đổi decision readiness.

## 14. Known limitations

| Hạn chế | Hệ quả thực tế | Cách vận hành an toàn hiện tại |
|---|---|---|
| H4 thiếu behavioral RLS matrix | Không independent-verify user isolation bằng real auth/API principal. | Không dùng app làm sole authoritative record; giữ broker statements. |
| H5 thiếu migration reproducibility drill | Không chứng minh upgrade/rollback path của database/sync. | Không đổi schema/migration/importer; giữ portable backup. |
| Meta CSP trên GitHub Pages | Không có CSP HTTP response header. | Giữ policy meta + guard source; chỉ nâng claim khi có hosting evidence. |
| Backup local owner-controlled | Export không tự là off-device backup/tamper proof. | Lưu một bản ngoài thiết bị và diễn tập restore fixture. |
| Lazy PDF HMR resolution | Vite dev HMR có thể không resolve Lazy PDF importer, dù production build/preview đúng. | Không dùng dev-only error làm release blocker; giữ CI production preview smoke. |

## 15. Giới hạn P11.2 về thuế

P11.2 về FIFO/Vorabpauschale bị **khóa tuyệt đối** cho đến khi có independent German tax expert review. P11.1 chỉ là UI lot evidence read-only với fixture tổng hợp; không có tax engine, FIFO engine, Vorabpauschale, report nộp thuế hoặc lời khuyên thuế. [17]

Nếu scope mở lại, từng pha cần data manifest, broker evidence/version/date, trạng thái “chưa đủ dữ liệu/không xác định”, negative tests và ADR/migration plan riêng trước khi đụng data/sync/auth/schema. Không dùng output release này cho filing, tính nghĩa vụ thuế hay thay đổi savings plan.

## 16. Chính sách merge và vận hành

Mọi PR liên quan financial semantics, schema/Dexie, backup compatibility, sync semantics, migration, quote economics hoặc tax scope phải nêu rõ YES/NO, có ADR nếu bất kỳ field nào là YES, có rollback strategy và chạy full gates. Không cho phép auto-repair, auto conflict resolution, destructive migration hay raw-evidence rewrite dưới danh nghĩa maintenance. [2]

Cổng bắt buộc trước merge là `test-build`, `edge-smoke` và `preview-smoke`; deploy chạy sau merge vào `main`. Run #32514368955 của PR #251 trên `main` pass cả ba gates và deploy; run này cũng thực hiện `npm test`, operational posture, ledger benchmark, locale policy, build/bundle budget và release artifact validation trong `test-build`. Local matrix trước merge tiếp tục pass `npm test`, ledger benchmark 10.000, build/bundle budget, release, preview `14/14` và edge smoke. [22] [23]

## 17. Chính sách phát triển tương lai

Hướng phát triển chỉ được mở khi không hạ thấp thứ tự ưu tiên: **correctness → data integrity → recovery → security → compatibility → maintainability → release reliability → UX → new features**. Vòng đời vô thời hạn yêu cầu compatibility được lập kế hoạch bằng ADR/migration evidence thay vì hard-code ngày kết thúc hoặc thay dữ liệu lịch sử để “dọn sạch”. [3]

AI không có trong production critical path. Bất cứ proposal AI/API nào phải opt-in, có consent/data contract/cost/fallback local/negative tests riêng, và không thay owner quyết định giao dịch, backup, conflict, đầu tư hoặc thuế. [5]

## 18. Trạng thái baseline ngày 23/08/2026

**Quyết định cuối:** **`CONDITIONAL — NOT READY`** cho vai trò sole authoritative financial record.

Baseline v1.6.0 đã đạt tiến bộ cụ thể: dependency audit sạch, release/build/PWA/quote feeds được production-verified; Overview/Transactions có information architecture mobile-first rõ ràng hơn; recovery runbook/corruption drill và password-reset flow đều có regression evidence; financial core, sync, backup format, Dexie schema và historical data đều không đổi. Tuy nhiên chính sách quyết định không được hạ chuẩn: **`SAFE AFTER HARDENING` chỉ khả dụng khi đồng thời có H4 behavioral RLS proof và H5 migration reproducibility proof.** Cả hai điều kiện vẫn không được chứng minh trong no-cost controlled environment hiện tại; P11.2 vẫn là tax boundary độc lập. [18] [19] [21]

Vì vậy hệ thống phù hợp trong phạm vi **local-first tracker, owner-controlled backup và broker statement độc lập**. Nó chưa được quảng bá là security-complete, RLS-behavioral-verified, migration-reproducible hoặc thay thế hoàn toàn chứng từ broker.

## References

[1]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/248 "PR #248 — post-baseline documentation consistency"
[2]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/HARDENING_IMPLEMENTATION_PLAN.md "H0–H7 implementation evidence and boundaries"
[3]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/235 "PR #235 — indefinite product lifecycle wording"
[4]: https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/32505921557 "Main CI and GitHub Pages deploy after PR #248"
[5]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/OPERATIONS_RUNBOOK.md "Owner operation, recovery, PWA and release runbook"
[6]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/H4-RLS-EVIDENCE.md "Existing H4 static RLS evidence"
[7]: https://supabase.com/docs/guides/local-development "Supabase Local Development & CLI"
[8]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/supabase/migrations/002_soft_delete_and_triggers.sql "Current migration tree"
[9]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/231 "PR #231 — factual portfolio data health"
[10]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/242 "PR #242 — Overview information architecture"
[11]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/243 "PR #243 — Transactions information architecture"
[12]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/232 "PR #232 — reproducible release/client security baseline"
[13]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/241 "PR #241 — GitHub Actions runtime upgrade"
[14]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/236 "PR #236 — Vitest security bridge"
[15]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/237 "PR #237 — Vite build ecosystem upgrade"
[16]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/238 "PR #238 — React Router security baseline"
[17]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/p11-tax-lot-scope.md "P11 tax/lot scope and expert review gate"
[18]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/246 "PR #246 — deterministic synthetic recovery corruption drill"
[19]: ./H4-H5-POST_BASELINE_REEVALUATION.md "Post-baseline local/isolated H4-H5 re-evaluation evidence"
[20]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/245 "PR #245 — post-baseline maintenance runbook"
[21]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/247 "PR #247 — harden password recovery callback"
[22]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/251 "PR #251 — streamline settings and complete password recovery UX"
[23]: https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/32514368955 "Main CI and GitHub Pages deploy after PR #251"
