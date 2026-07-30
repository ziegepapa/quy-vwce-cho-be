# Design System 2026/2027 — Quỹ VWCE cho bé

## Tokens

File: `src/styles/tokens.css` (imported by `src/index.css`).

| Nhóm | CSS variables |
|------|----------------|
| Brand | `--color-primary`, `--color-accent` |
| Surface | `--color-bg`, `--color-surface`, `--color-border` |
| Text | `--color-text`, `--color-text-muted` |
| Status | `--color-success`, `--color-warning`, `--color-danger` |
| Sync | `--sync-synced` … `--sync-conflict` |
| Spacing | `--space-1` … `--space-8` |
| Radius | `--radius-sm` … `--radius-xl` |
| Motion | `--duration-fast` (~160–200ms) |
| Safe area | `--safe-top/bottom/left/right` |
| Dock | `--dock-h`, `--dock-pad`, `--dock-radius` |

Dark mode: `prefers-color-scheme: dark`.  
Reduced motion: `prefers-reduced-motion: reduce` (dock không auto-hide).

## Navigation 2026 — Bottom Dock

- Component: `src/components/BottomDock.tsx`
- Styles: `src/styles/dock.css`
- **Không** dùng tab bar full-bleed phẳng dính đáy.
- Dock **nổi** (elevated surface + shadow nhiều lớp), bo góc lớn, max-width ~26rem, căn giữa.
- Active: nền `primary-muted` + pill.
- Auto-hide khi scroll xuống / hiện khi scroll lên (tắt nếu reduced-motion).
- Safe-area: `padding-bottom: dock-pad + env(safe-area-inset-bottom)`.
- Desktop ≥900px: ẩn dock, dùng sidebar.

## Components

| Component | File / class |
|-----------|----------------|
| BottomDock | `BottomDock.tsx` |
| TopBar + avatar menu | `TopBar.tsx` |
| SyncStatusIndicator | 4 trạng thái shared |
| ActionMenu | menu ⋮ thay Sửa/Xóa |
| Icons | SVG stroke 1.75 |
| FAB | `.fab` |
| Progress ring | `.progress-ring` |
| Sheet | `.modal` + `.sheet-handle` |

## SyncStatus

```ts
type SyncStatus = "synced" | "syncing" | "offline" | "conflict";
```

Labels: Đã đồng bộ / Đang đồng bộ / Ngoại tuyến / Có xung đột.

## Conventions

- Money: `formatMoney` + tabular nums.
- Status = màu + chữ (pill).
- Forms: `<label htmlFor>`.
- Destructive: confirm rõ ràng.
- Input font ≥16px (tránh zoom Safari).
