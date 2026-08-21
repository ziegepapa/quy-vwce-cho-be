# Long-Term Stable Baseline v1 — Báo cáo Readiness

**Tác giả:** Manus AI
**Phiên bản ứng dụng:** 1.6.0
**Commit phát hành đã kiểm chứng:** `a06b0fa234ca7f0db3c88a6c759c0e7cab654bfd` (merge PR #232) [1]
**Ngày đánh giá evidence:** 21-08-2026 (GMT+2)
**Đối tượng sử dụng:** Gia đình sở hữu vault và người bảo trì kế tiếp.

> **Trạng thái baseline 23/08/2026: `CONDITIONAL — NOT READY` cho vai trò sổ cái tài chính duy nhất, có thẩm quyền tuyệt đối.**
>
> Có đủ evidence để vận hành VWCE Vault như một **tracker local-first** có kiểm soát, với sao kê/chứng từ broker độc lập vẫn được lưu giữ. Chưa có đủ evidence để tuyên bố hệ thống là security-complete, RLS-behavioral-verified, migration-reproducible hoặc thay thế hoàn toàn chứng từ broker. Quyết định này là cố ý thận trọng, không phải sự cố phát hành.

| Phạm vi sử dụng | Kết luận | Điều kiện vận hành |
|---|---|---|
| Theo dõi danh mục local-first hằng ngày | **Có thể sử dụng** | Owner chủ động export backup, xem Sync Health và giữ sao kê broker độc lập. |
| Bản ghi duy nhất để quyết định/tái tạo toàn bộ lịch sử tài chính | **Không sẵn sàng** | H4, H5 và dependency audit còn blocker độc lập. |
| Tính thuế, FIFO hoặc Vorabpauschale | **Không được hỗ trợ** | P11.2 bị khóa; không dùng output để khai thuế. |

## 1. Mục đích sản phẩm

VWCE Vault là PWA mobile-first giúp gia đình theo dõi giao dịch, khoản góp, giá trị danh mục, backup và trạng thái đồng bộ theo mô hình dữ liệu cục bộ trước. Đây là công cụ ghi nhận và rà soát dữ liệu do owner kiểm soát, **không phải** broker, công cụ thực hiện lệnh, tư vấn đầu tư hay dịch vụ lập/khai thuế. Các boundary không suy diễn này được khóa trong policy và regression contract H0–H2-B. [3]

## 2. Vòng đời vô thời hạn

Hệ thống được xem là có **vòng đời vô thời hạn**. Mốc 2042, nếu có trong kế hoạch gia đình, chỉ là một mốc mục tiêu tài chính; nó không phải ngày hết hạn phần mềm, không phải mốc xóa dữ liệu và không được hard-code thành giới hạn hoạt động của ứng dụng. Mọi thay đổi tương lai phải ưu tiên tính đúng, toàn vẹn dữ liệu và khả năng khôi phục hơn tính năng mới. [3]

## 3. Kiến trúc hiện tại

Bản phát hành hiện tại sử dụng React 18, TypeScript và Vite ở client; Dexie/IndexedDB làm vault local-first; Supabase chỉ phục vụ contract đăng nhập/đồng bộ hiện hữu; PWA cung cấp app shell offline; GitHub Pages nhận artifact sau merge vào `main`. Production verification sau deploy H7 xác nhận app version 1.6.0, shell PWA và quote feeds công khai hoạt động. [1] [2]

| Thành phần | Trách nhiệm | Ranh giới đã khóa |
|---|---|---|
| React/TypeScript/Vite | UI song ngữ, build và runtime client | Không đưa secret/service-role vào client. |
| Dexie/IndexedDB | Vault local-first và replay dữ liệu | Không đổi `DEXIE_DB_VERSION=4` trong H0–H7. |
| Supabase | Auth/sync contract hiện hữu | Không tạo migration, không auto-resolve conflict. |
| PWA/GitHub Pages | Shell cài đặt/offline và static hosting | CSP hiện là meta CSP; chưa phải HTTP response-header CSP. |

## 4. Hoàn tất H0–H2-B: nền tảng toàn vẹn tài chính

H0 và H0.1 đặt boundary chính sách: không có tax estimate public hoặc hướng dẫn glide-path mang tính prescriptive. H1 thiết lập một nguồn version chuẩn từ `package.json`. H2-A lập ADR và inventory evidence; H2-B đưa classifier canonical vào mọi đường ghi mới và replay, đồng thời tạo quarantine **derived** cho chứng cứ legacy không an toàn. [3]

Điểm quan trọng là H2-B không sửa raw historical transaction, không nâng Dexie/schema backup, không thay sync semantics và không auto-repair. Các thay đổi được thử qua golden persistence/replay, path UI và benchmark deterministic ở quy mô ledger lớn; một record không đủ dữ liệu được giữ lại như evidence thay vì bị “đoán” cho hợp lệ. [3]

## 5. Financial invariants

| Invariant | Hành vi bắt buộc | Hành vi bị cấm |
|---|---|---|
| Oversell | Bán vượt lượng nắm giữ là **`INVALID`** và bị từ chối khi new ingestion. | Không âm holdings, không tự điều chỉnh số lượng. |
| Missing quantity | Giao dịch thiếu quantity là **`INCOMPLETE`**. | Không gán số lượng mặc định hoặc giả định FIFO. |
| Legacy unsafe evidence | Vẫn giữ raw record, nhưng không tạo financial effect qua derived quarantine. | Không xóa, rewrite hay “sửa” quá khứ im lặng. |
| Replay | Sắp xếp/replay xác định qua contract canonical. | Không phụ thuộc thứ tự tình cờ của storage hoặc UI. |
| Conflict | Owner tự xem và chọn từng xung đột. | Không auto-merge, auto-select local/server hoặc ghi đè tự động. |

Các invariant trên là cơ sở để giao diện Data Health chỉ báo cáo fact có nguồn, thay vì tạo điểm “chất lượng” tổng hợp, forecast hay action đầu tư. [3] [7]

## 6. Bằng chứng backup và recovery: H3

H3 giữ `schemaVersion: 4` và bổ sung metadata envelope **tùy chọn**: app release, nhãn Dexie, portable domain allowlist và exact record count. Nếu metadata có mặt nhưng sai shape/identity/count, import fail-closed trước khi đi vào restore destructive; backup v1–v4 không có metadata vẫn đọc được. [3]

Synthetic restore drill đã kiểm tra chuỗi calculate → export → JSON boundary → wipe → import → reopen → canonical replay → compare, bao gồm settings, goals, quote evidence, transactions live/tombstone và một legacy row quarantine. Đây là evidence fixture tổng hợp, không phải bằng chứng rằng backup gia đình đang lưu an toàn ngoài thiết bị. Owner vẫn phải export định kỳ, kiểm tra file và diễn tập trong vault/profile thử nghiệm. [3] [4]

## 7. Bằng chứng RLS và security: H4

H4 có evidence **một phần**: catalog policy read-only cho thấy RLS bật và policy owner-only được định nghĩa cho collection sync hiện hữu; static scan cũng không thấy TypeScript/TSX client surface chứa service-role secret. Điều đó củng cố intended boundary, nhưng không thay thế một test behavioral thực tế. [5]

User-A allow, User-B deny và anonymous deny chưa được chạy trên môi trường disposable không chứa dữ liệu gia đình. Theo ràng buộc no-cost hiện tại, không tạo Supabase branch/project trả phí và tuyệt đối không dùng production family data làm fixture. Vì vậy H4 vẫn là blocker chính thức và không được mô tả là đã đóng. [3] [5]

## 8. Bằng chứng đồng bộ

Outbox, tombstone, recovery và conflict contract hiện hữu được giữ nguyên qua toàn bộ H0–H7. Sync vận hành fail-closed: pending/retry/offline không được diễn giải thành server acceptance; recovery chưa hoàn tất chặn write; logout bị chặn khi còn pending/outbox error/conflict/recovery blocker; và conflict dừng để owner chọn rõ ràng. [4]

Đây là bằng chứng về contract source/test và vận hành có kiểm soát, không phải bằng chứng behavioral RLS multi-user. Bất cứ công việc nào thay đổi sync namespace, conflict resolution hoặc tombstone phải có ADR, test compatibility và review riêng. [3] [4]

## 9. Toàn vẹn quote

Quote feed lưu provenance có kiểm tra: shape/envelope, date, currency, ISIN, provider URL, duplicate key và future-date được validate trước write. Trạng thái offline/error/partial hoặc giá stale/missing giữ nguyên tính không hoàn chỉnh; app không bịa giá lịch sử, không biến missing price thành zero và không suy ra performance từ một quote hiện tại. [4]

Production verification H7 xác nhận shell/PWA/quote feeds hoạt động ở thời điểm kiểm tra, nhưng không biến một quote trả về thành bảo đảm availability liên tục hay khuyến nghị mua/bán/giữ. [2]

## 10. Provenance và import: H5

Trade Republic execution PDF giữ contract source-specific `source`, `sourceVersion` và document-derived `externalRef`, có validation/dedupe trước persistence. Depot statement chỉ là evidence đối soát read-only. Manual entry cố ý không nhận generic auto-dedupe vì không có broker-document identity đáng tin cậy. [3] [6]

H5 chưa có ordered baseline migration history: `schema.sql` là bootstrap thủ công và repository chỉ có migration muộn hơn. Không tạo DDL, data backfill, importer batch, generic migration hoặc upgrade drill trên production data. Một controlled no-family-data environment cùng migration/backup/sync/rollback proof là điều kiện bắt buộc trước khi thay đổi trạng thái H5. [3] [6]

## 11. Data Health: H6

H6 cung cấp Portfolio Data Health read-only, deterministic, gồm reason/source/severity/count/link từ canonical transaction health, quote snapshot và backup bookkeeping facts. Unknown vẫn là unknown; không có numeric health score, background repair, forecast hay action đầu tư. Transaction inbox chỉ mở đường chỉnh sửa hiện hữu để owner tự xem quyết định. [3] [7]

Yearly Review bổ sung factual calendar-year withdrawals, contribution months và same-year Plan-vs-Reality fact. Household Handoff là aggregate-only, owner-triggered và loại trừ contacts, document locations, account/broker identifiers, transaction rows và portfolio amount. [3] [7]

## 12. Dependency, reproducibility và security: H7

H7 thêm `package-lock.json` v3, đổi test/build/edge/preview/quote workflow sang `npm ci`, exact-pin Playwright 1.62.1 và đồng bộ preview browser image. Các guard regression kiểm tra lockfile/workflow/client-image parity; full local gate, CI PR và main deploy đều đã pass. [1] [2] [8]

Static shell có meta CSP và source-level guard từ chối service-role references, dynamic evaluation và raw HTML sinks dưới `src/**`. Đây là defense-in-depth phù hợp với GitHub Pages, **không** thay RLS, penetration test hoặc response-header CSP; `style-src 'unsafe-inline'` vẫn cần cho React inline styles hiện hữu. [3] [8]

Dependency audit vẫn còn **5 moderate, 1 high và 1 critical advisory**, bao gồm critical Vitest, high Vite và moderate React Router. Các fix tương ứng đòi major-version upgrade trong PR riêng có migration review; tuyệt đối không dùng `npm audit fix --force`. Blocker này tự nó đã ngăn một tuyên bố security-complete. [3] [8]

## 13. Known limitations

| Hạn chế | Hệ quả thực tế | Cách vận hành an toàn hiện tại |
|---|---|---|
| H4 thiếu behavioral RLS matrix | Không thể independent-verify user isolation production. | Không dùng app như sole authoritative record; giữ broker statements. |
| H5 thiếu migration reproducibility drill | Không thể chứng minh upgrade path của database/sync bằng controlled environment. | Không đổi schema/migration/importer; giữ portable backup. |
| Dependency audit critical/high/moderate | Không thể claim security-complete. | Tách major upgrades thành PR review riêng. |
| Meta CSP trên GitHub Pages | Không có CSP HTTP response header. | Giữ policy meta + guard source; chỉ nâng claim khi có hosting evidence. |
| Backup local owner-controlled | Export không tự là off-device backup/tamper proof. | Lưu một bản bên ngoài thiết bị và diễn tập restore fixture. |

## 14. Giới hạn P11.2 về thuế

P11.2 về FIFO/Vorabpauschale bị **khóa tuyệt đối trong baseline này** cho đến khi có independent German tax expert review. P11.1 chỉ là UI lot evidence read-only với fixture tổng hợp; không có tax engine, không có FIFO engine, không có Vorabpauschale, không có report để nộp thuế và không có lời khuyên thuế. [9]

Nếu một ngày scope được mở lại, từng pha phải có data manifest, broker evidence/version/date, trạng thái “chưa đủ dữ liệu/không xác định”, negative tests và ADR/migration plan riêng trước khi đụng data/sync/auth/schema. Không được dùng output của release hiện tại cho filing, tính nghĩa vụ thuế hay thay đổi savings plan. [9]

## 15. Chính sách bảo trì

Mọi PR tương lai liên quan financial semantics, schema/Dexie, backup compatibility, sync semantics, migration, quote economics hoặc tax scope phải nêu rõ YES/NO, có ADR nếu bất kỳ field nào là YES, nêu rollback strategy và chạy toàn bộ gate. Không cho phép auto-repair, auto conflict resolution, destructive migration hay raw-evidence rewrite dưới dạng “maintenance”. [3]

Cổng tối thiểu trước merge là `test-build`, `edge-smoke` và `preview-smoke`; deploy chạy sau merge vào `main`. Người bảo trì phải kiểm tra `npm test`, ledger benchmark, locale audit, build, bundle budget, release và preview evidence theo runbook. [2] [4]

## 16. Chính sách phát triển tương lai

Hướng phát triển chỉ được mở khi không hạ thấp ưu tiên: **correctness → data integrity → recovery → security → compatibility → maintainability → release reliability → UX → new features**. Vòng đời vô thời hạn yêu cầu compatibility được lập kế hoạch qua ADR/migration evidence, thay vì hard-code một ngày kết thúc hoặc thay dữ liệu lịch sử để “dọn sạch”. [3]

AI không có trong production critical path. Bất cứ proposal AI/API nào phải là opt-in, có consent/data contract/cost/fallback local/negative tests riêng và không được thay quyết định của owner về giao dịch, backup, conflict, đầu tư hoặc thuế. [4]

## 17. Trạng thái baseline ngày 23/08/2026

**Quyết định cuối cùng: `CONDITIONAL — NOT READY` (cho vai trò sole authoritative financial record).** H0–H3, H6 và phần reproducibility/client-boundary của H7 có evidence merge/CI/deploy/production verification; hệ thống được xem là an toàn trong phạm vi **local-first tracker, owner-controlled backup và broker statement độc lập**. [1] [2] [3]

Readiness không chuyển thành `SAFE AFTER HARDENING` cho đến khi đồng thời có: (a) H4 User-A/User-B/anonymous behavioral proof trong môi trường disposable, (b) H5 ordered migration + controlled upgrade/rollback proof, (c) major-upgrade remediation cho dependency critical/high/moderate advisories, và (d) bất kỳ tax scope nào chỉ sau independent German tax expert review. Không có blocker nào được bỏ qua chỉ vì CI hiện xanh.

## References

[1]: https://github.com/ziegepapa/quy-vwce-cho-be/pull/232 "PR #232 — reproducible release baseline"
[2]: https://github.com/ziegepapa/quy-vwce-cho-be/actions/runs/32487088064 "Main H7 CI and GitHub Pages deploy"
[3]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/HARDENING_IMPLEMENTATION_PLAN.md "H0–H7 implementation evidence and no-go boundaries"
[4]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/OPERATIONS_RUNBOOK.md "Owner operating, recovery, PWA and release runbook"
[5]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/H4-RLS-EVIDENCE.md "H4 partial RLS evidence and behavioral-proof blocker"
[6]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/adr/ADR-H5-provenance-and-migration-discipline.md "H5 provenance and migration discipline"
[7]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/adr/ADR-H6-data-health-yearly-review-handoff.md "H6 Data Health, Yearly Review and Handoff boundary"
[8]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/adr/ADR-H7-reproducibility-security-release-baseline.md "H7 reproducibility, client security and dependency-audit boundary"
[9]: https://github.com/ziegepapa/quy-vwce-cho-be/blob/main/docs/p11-tax-lot-scope.md "P11 tax/lot scope and German expert review gate"
