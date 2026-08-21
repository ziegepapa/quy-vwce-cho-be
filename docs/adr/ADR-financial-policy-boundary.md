# ADR — Financial Policy Boundary

**Trạng thái:** Được chấp nhận cho roadmap hardening H0; enforcement runtime yêu cầu PR riêng.

**Ngày:** 21-08-2026

**Phạm vi:** VWCE Vault / Quỹ VWCE cho bé

**Quyết định:** **VWCE Vault là family investment tracking system, không phải tax software, investment advisor, broker hoặc trading terminal.**

> **H0 là decision-only.** Tài liệu này không thay đổi ledger, database, transaction semantics, tax formula, sync, backup, schema, Dexie version hay historical data. Nó ghi nhận boundary bắt buộc cho tất cả PR hardening H1–H7 và cho một PR containment UI riêng nếu cần.

## Bối cảnh và production behavior đã xác nhận

Long-Term Financial Integrity Audit xác nhận bốn P0 tại baseline `43cd59d`: version truth phân mảnh; sale không hợp lệ vẫn có thể tạo proceeds; canonical validation chưa hoàn chỉnh; và production simulation hiện có tax estimate/after-tax surface cùng glide-path copy prescriptive. [1]

Tax surface hiện tại không chỉ là helper không dùng: `Simulation.tsx` gọi `estimateGermanExitTax`, sau đó dùng kết quả cho headline và scenario result khi `taxOn` được bật. Helper đang chứa constant tax Đức và thực hiện calculation terminal gain. [2] [3] Glide path hiện trả allocation mục tiêu và action copy có chỉ dẫn chuyển/bán/dừng góp cụ thể. Nó không auto-trade nhưng vượt safety boundary “không investment recommendation”. [4]

## Quyết định A — Tax boundary

### A.1 Production policy

Production **không được cung cấp tax calculation, German tax engine, FIFO engine, Vorabpauschale engine, tax optimization hoặc tax recommendation**. Điều này bao gồm việc hiển thị tax result/after-tax result mà người dùng có thể hiểu là số thuế áp dụng cho chính hồ sơ của họ.

Cho đến khi có một review độc lập, có evidence của **Steuerberater Đức** phù hợp, app không được mở rộng, thay thế hay “cải thiện” bất kỳ công thức tax nào. P11.2 vẫn bị khóa và ADR này không mở gate đó.

### A.2 Data preservation

Các trường `tax` đã tồn tại trong historical transaction là **recorded fact do owner/importer cung cấp**, không phải kết quả app được phép suy luận. Các trường này phải được giữ nguyên trong transaction, sync và backup contract. Không có migration, rewrite, normalization destructive hay automatic repair historical data vì quyết định policy này.

### A.3 Containment requirement

Một PR UI-only độc lập phải loại hoặc ẩn production-facing tax toggle, after-tax headline, after-tax scenario result và copy cho thấy app tính tax. PR đó **không được thay bằng formula mới**, không được sửa raw `tax` field và không được thay đổi transaction/backup semantics. Trước khi PR containment được merge, release vẫn mang risk P0-04 đã ghi trong audit.

| Được phép giữ | Không được giữ sau containment |
|---|---|
| Factual `Transaction.tax` do user/import ghi lại; yearly factual “recorded taxes” nếu copy nói rõ đây là recorded fact | Tax estimate, after-tax terminal value, German tax toggle, tax optimization, FIFO/Vorabpauschale calculation, tax advice |
| Tax fields trong backup/sync để giữ historical integrity | Mọi silent derivation từ value/contribution sang tax payable |

## Quyết định B — Glide-path boundary

Glide path chỉ là **neutral informational awareness**. Production có thể hiển thị goal/use date, time horizon, factual current allocation/concentration nếu có data source rõ ràng, risk-awareness copy trung lập, and owner-initiated review reminder.

Production không được hiển thị action prescriptive như “bán/chuyển X%”, “đưa phần an toàn lên X%”, “dừng equity contribution”, “mua thêm”, “giữ nguyên allocation X%”, hoặc câu tương đương. Không được auto-trade, auto-rebalance, auto-save hay auto-change savings plan.

Một PR UI-only riêng phải thay copy và remove numerical allocation/action target. Nếu một future view cần “current equity concentration”, nó phải biểu thị snapshot factual với source/provenance rõ ràng; không suy diễn missing price thành zero và không biến scenario thành fact.

| Được phép | Bị cấm |
|---|---|
| “Mốc sử dụng tiền là …; còn … năm; hãy rà soát kế hoạch và mức rủi ro.” | “Chuyển 10% trong tháng này.” |
| Factual current allocation có source rõ ràng và trạng thái unknown khi data thiếu | Allocation target, sell/buy instruction, personalized rebalancing advice |
| Review reminder do owner chủ động xác nhận | Auto trade, auto rebalance, auto-save hay đổi contribution |

## Quyết định C — Financial safety boundary

Raw historical evidence luôn được bảo toàn; canonical replay không được silent clamp, infer missing lot/quantity, normalize destructive hoặc auto-repair economic data. Financially unsafe data phải được reject tại ingestion mới hoặc được hiển thị explicit `invalid` / `incomplete` khi là legacy evidence. Nó không được tạo cash, proceeds, cost basis, quantity, totalSold hoặc position effect.

Sync conflict luôn chờ owner resolution. Backup invalid luôn fail closed. Missing price luôn là missing/stale state, không phải zero. Assumption/scenario không được biểu diễn như historical fact. Không AI/API nào được tham gia critical financial path.

## Hệ quả cho roadmap H1–H7

| Phase | Quyết định H0 ràng buộc phase đó |
|---:|---|
| H1 | Version source of truth phải tách khỏi Dexie, backup và Supabase schema version. |
| H2 | Canonical validator và ledger phải reject/quarantine unsafe economics không sửa historical evidence. Mọi semantic change cần decision record riêng trước code. |
| H3 | Backup/restore bảo toàn raw tax field như historical evidence, không tính hoặc sửa tax. |
| H4 | Không thay đổi outbox, conflict, tombstone, browser lock hoặc conditional-write semantics để giải quyết P0 bằng auto-merge. |
| H5 | Provenance giữ evidence cho future review nhưng không xây tax/lot engine. Schema/migration cần ADR riêng. |
| H6 | Data Health và yearly review phải read-only, deterministic, factual; không đưa recommendation/tax estimate. |
| H7 | Legacy AI tiếp tục ngoài critical path; freeze/retire cần ADR riêng. |

## H0 completion criteria

H0 decision record được xem là hoàn thành khi tài liệu này và Long-Term Financial Integrity Audit được review, các follow-up scope được ghi nhận rõ, và không có runtime financial code/schema/data change bị lẫn vào PR H0.

H0 **không** đồng nghĩa P0-04 đã remediated trong deployed UI. P0-04 chỉ được đóng khi containment UI PR đạt test/build/preview/production gate, xác nhận không có public tax calculation/prescriptive glide guidance còn reachable và không có historical field bị thay đổi.

## Non-goals

H0 không quyết định tax liability, tax filing, broker execution, asset allocation tối ưu, mức return, số tiền contribution, hay hành động đầu tư cá nhân. H0 cũng không sửa P0 ledger behavior; H2 phải có ADR về canonical transaction semantics và regression suite riêng.

## References

[1]: ../LONG_TERM_AUDIT.md "VWCE Vault — Long-Term Financial Integrity Audit"
[2]: ../../src/pages/Simulation.tsx "Production Simulation tax caller"
[3]: ../../src/lib/simulation/engine.ts "German tax estimate helper"
[4]: ../../src/lib/planPhase.ts "Existing glide-path policy actions"
