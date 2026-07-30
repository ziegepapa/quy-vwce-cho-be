# Design System V6 2026 — Quỹ VWCE cho bé

## Depth system (3 layers)

| Layer | Token / class | Use |
|-------|---------------|-----|
| Base | `--color-bg` | Page background |
| Raised | `.surface-raised`, `--shadow-raised` | Cards, tiles, panels |
| Overlay | `--shadow-dock`, `--color-surface-translucent` | Dock, sheets, modal |

## Liquid Glass dock

- File: `src/styles/dock.css` + `BottomDock.tsx`
- Floating, radius 28px, translucent + `backdrop-filter`
- Progressive blur strip above dock (`.app-shell::after`)
- Auto-hide on scroll down; respects `prefers-reduced-motion`
- Active: primary-muted pill behind icon

## Bento grid

- File: `src/styles/bento.css`
- Hero: full-width gradient tile with alloc bar + storytelling caption
- Metrics: `span-2` for important (VWCE, PnL), 1×1 for secondary, `tile-sm` for fees
- Not a uniform 2-column grid of equal cards

## Insight cards

Replace todo bullets. Each has priority chip, title, why-it-matters, CTA link.

## Tokens

`src/styles/tokens.css` — surfaces, blur, shadow-dock/fab/overlay, radius-card/sheet/dock, motion, safe-area.

Dark mode: first-class independent surfaces (not inverted light).

## Conventions

- Money: tabular nums + story caption
- Forms: bottom sheet on mobile
- Actions: OverflowMenu, not inline Sửa/Xóa
- Touch ≥ 44px; input font ≥ 16px
- Version: `APP_VERSION` in `types.ts` (currently 1.4.0)
