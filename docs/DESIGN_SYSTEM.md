# Design System 2026 — Quỹ VWCE cho bé

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
| Motion | `--duration-fast` (150ms), `--duration-normal` (200ms) |
| Safe area | `--safe-top/bottom/left/right` |

Dark mode: `prefers-color-scheme: dark`.  
Reduced motion: `prefers-reduced-motion: reduce`.

## Components (CSS + React)

| Component | Class / file |
|-----------|----------------|
| Button | `button`, `.secondary`, `.danger`, `.ghost` |
| Card | `.card`, `.card-hero` |
| Metric | `.metric-label`, `.metric-value` (+ `.positive`/`.negative`) |
| Badge | `.pill.green/yellow/red` |
| Progress | `.progress-track > span` |
| Sync badge | `SyncStatusIndicator` + `.sync-badge` |
| Top bar | `TopBar` |
| Avatar | `.avatar` |
| Timeline | `.timeline`, `.timeline-item`, `.timeline-dot` |
| Modal/sheet | `.modal-backdrop`, `.modal` |
| Skeleton | `.skeleton` |

## SyncStatus (shared with stage 2)

```ts
type SyncStatus = "synced" | "syncing" | "offline" | "conflict";
```

Labels: Đã đồng bộ / Đang đồng bộ / Ngoại tuyến / Có xung đột.

## Layout

- Mobile: bottom nav (5 tabs), max content ~28rem.
- Desktop ≥900px: left sidebar, bottom nav hidden.
- Touch target ≥44px (`--touch-min`).

## Conventions

- Money: `formatMoney` + tabular nums.
- No status by color alone (pill text + color).
- Forms: real `<label htmlFor>`.
- Destructive actions: explicit confirm.
