# ADR H3 — Backup Metadata Envelope and Deterministic Restore Drill

**Trạng thái:** Được chấp nhận cho H3 implementation.

**Ngày:** 21-08-2026  
**Phạm vi:** VWCE Vault / Quỹ VWCE cho bé  
**Liên quan:** H1 Application Version Contract, H2-A/H2-B Financial Semantics, Operations Runbook.

> **Quyết định:** H3 bổ sung một `metadata` *tùy chọn* vào backup mới và một restore drill tổng hợp bằng fixture giả. `schemaVersion` vẫn là **4**; Dexie DB version vẫn là **4**; Supabase migrations, sync protocol, dữ liệu lịch sử và raw financial evidence không thay đổi.

## Context

Backup v1–v4 hiện đã có `schemaVersion`, `exportedAt`, domain payload và fail-before-clear validation. Tuy vậy, backup file chưa tự mô tả app release source, Dexie namespace, domain manifest hay số record để người dùng/hậu kiểm xác định snapshot đã bao phủ gì. Round-trip coverage hiện có cũng chưa so sánh toàn bộ state và canonical replay trước/sau một restore synthetic.

## Decision

| Thành phần | H3 contract |
|---|---|
| `schemaVersion` | Giữ nguyên top-level field và giá trị hiện hành. Đây vẫn là backup-format compatibility namespace duy nhất. |
| `metadata` | Additive và optional. Backup cũ không có field này vẫn được validate/import theo path v1–v4 hiện hữu. |
| Version labels | `metadata.backupSchemaVersion` phải khớp top-level `schemaVersion`; `metadata.appReleaseVersion` lấy từ H1 canonical source; `metadata.dexieSchemaVersion` là label độc lập, không phải restore gate. |
| Domain manifest/counts | Export ghi allowlist `supportedDomains` và `recordCounts`; validator kiểm tra shape, allowlist và exact count nếu metadata có mặt **trước** destructive import. |
| Integrity boundary | Count/domain consistency chỉ phát hiện payload bị cắt ngắn hoặc không nhất quán; nó **không** là checksum cryptographic, chữ ký, chứng minh nguồn gốc hay bảo vệ khỏi sửa đổi có chủ ý. App không được tuyên bố backup JSON là tamper-proof. |
| Restore drill | Fixture hoàn toàn synthetic đi qua calculate → export → JSON boundary → wipe → import → reopen → replay → compare. Nó so sánh all portable domains, tombstone evidence và PortfolioState canonical. |

## Consequences

H3 tăng khả năng kiểm tra và khả năng giải thích restore mà không thay đổi meaning của financial records. H2-B vẫn quyết định `accepted`/`incomplete`/`invalid` khi replay: finite legacy evidence không bị metadata hay restore tự sửa; nó được giữ raw và derived quarantine vẫn cho zero financial effect.

Không có migration hoặc repair. Nếu một future backup cần checksum cryptographic, encryption, signing, retention policy mới, hay metadata persisted ngoài payload, thay đổi đó cần ADR và compatibility/restore plan riêng.

## Compatibility and rollback

Các importer v1–v4 tiếp tục chấp nhận payload không có `metadata`. Payload mới vẫn có `schemaVersion: 4`, nên app release version không bao giờ trở thành schema gate. Rollback chỉ cần revert H3 code; backup mới vẫn đọc được vì `metadata` là unknown optional data đối với parser cũ và backup semantic data không đổi.

## Non-goals

H3 không tạo cloud backup, không đọc backup thật của gia đình, không export credential, không đổi sync/outbox conflict semantics, không tính tax, không tạo FIFO/Vorabpauschale, không tự sửa transaction hoặc quote, và không tuyên bố RLS production đã được kiểm chứng.
