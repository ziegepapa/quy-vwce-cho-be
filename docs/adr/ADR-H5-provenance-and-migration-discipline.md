# ADR H5 — Provenance Boundary and Migration Discipline

**Trạng thái:** Được chấp nhận cho documentation/discipline; **không phê duyệt schema hoặc importer expansion**.  
**Ngày:** 21-08-2026  
**Phạm vi:** VWCE Vault / Quỹ VWCE cho bé.

> **Quyết định:** Giữ provenance hiện hữu theo source-specific contract. Không thêm field hash, import batch, document blob, retention metadata hay schema “để dùng sau”. Mọi provenance data-contract mới hoặc Supabase schema change phải bắt đầu bằng ADR riêng, ordered migration plan, backward-compatibility assessment, rollback plan và controlled upgrade evidence.

## Current supported evidence contracts

| Source | Evidence persisted today | Validation/dedupe boundary | Không được suy diễn |
|---|---|---|---|
| Manual | `source: "manual"`; owner-entered date, economic fields và notes. | H2-B rejects invalid new economic input at public write boundary. | Manual record không có broker document hoặc generic external identity nên không có global auto-dedupe. |
| Trade Republic execution PDF | `source: "trade_republic_pdf"`, `sourceVersion`, `externalRef: "trade_republic:<document-number>"`, reviewed transaction fields. | Document number bắt buộc; dedupe trước và ngay khi save; canonical H2-B validation trước persistence. | Không lưu PDF bytes, không tạo lot/tax result, không tự sửa OCR/import result. |
| Trade Republic depot statement | `source: "trade_republic_pdf"`, `sourceVersion`, `statementId`, snapshot positions. | Statement-ID dedupe; statement là reconciliation evidence only. | Không tạo buy/sell transaction synthetic từ snapshot. |
| Backup / sync / legacy | Raw fields và provenance fields hiện hữu đi qua current backup/sync contracts. | H3 payload preflight; H2-B derived classification/replay. | Không rewrite historical source/version/external reference hoặc repair raw evidence. |

## Migration discipline finding

Repository hiện có `supabase/schema.sql` bootstrap/manual setup và một file `002_soft_delete_and_triggers.sql` hướng dẫn chạy sau bootstrap. Read-only environment migration inventory không có recorded migrations. Vì vậy, source policy/schema có thể mô tả intended state nhưng **không phải** một ordered, reproducible migration history đủ để chứng minh empty-project bootstrap, upgrade hoặc rollback.

H5 không được “điền số” bằng migration giả, baseline dump từ production, DDL trên môi trường đang dùng, hoặc backfill provenance. Không có approved new data contract cần schema change ở thời điểm này, và owner không tạo paid controlled branch. Do đó migration implementation/upgrade testing là **blocked**, không phải done.

## Required gate for future schema or importer work

| Gate | Bắt buộc trước code/migration |
|---|---|
| Data contract | Nêu rõ source, purpose, owner visibility, sensitivity, retention, dedupe key, delete/restore/sync/backup behavior và compatibility. |
| ADR | Decision record phê duyệt field/table hoặc import semantics mới; không kết hợp với tax/lot logic. |
| Ordered migrations | Migrations numbered from an auditable baseline; no manual SQL-only release step. |
| Controlled upgrade proof | Empty bootstrap, upgrade from supported prior state, rollback assessment, RLS/security check và backup/sync compatibility test trên environment không chứa family data. |
| Import behavior | Atomic save, review-before-commit, source-specific duplicate policy, no partial import, no auto-repair and owner-controlled remediation. |
| Release evidence | PR/CI full gates plus migration environment evidence; production claim only after all prior gates pass. |

## Non-goals

H5 không tạo CSV/broker import batch, document hashing/storage, source blobs, retention service, data migration, Supabase DDL, Dexie version bump, FIFO, Vorabpauschale, tax calculation, automatic matching/deduplication, auto-resolution hoặc AI critical path.

## Rollback

Đây là policy/documentation ADR. Không có runtime artifact, schema or data mutation để rollback. Một future implementation phải mang rollback plan riêng trong PR của nó.
