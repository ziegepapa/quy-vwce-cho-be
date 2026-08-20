# Visual alignment preview notes

Date: 2026-08-19

## Overview

The production preview renders the performance legend with an orange contribution marker and a yellow gain marker in the Vault theme. The performance card is visible without layout clipping. The seed state has no contributions, so it cannot exercise a non-zero segmented bar or return value in the browser preview.

## Transactions

The redesigned page renders a dedicated `Nhật ký giao dịch` journal surface after the analytics card. It exposes `Tất cả`, `Mua VWCE`, and `Góp tiền` as direct touch targets, while `Lọc / PDF` remains available as an explicit progressive-disclosure control. The empty-ledger state remains clear and keeps the existing add-first workflow.

## Settings

The Prices group under Advanced rendered the VWCE row at a narrow desktop content column without clipping its ISIN (`IE00BK5BQT80`) or freshness date (`Tự động · 19/08/2026`). The nested Prices card retained an inset surface rather than bleeding through its parent card.

## Follow-up

Run the full test suite and use CI preview smoke after creating the draft PR. Manually inspect a populated performance card in all three themes when review data is available.

## 360px computed-style verification

A Playwright check against the production preview at a 360px viewport confirmed `scrollWidth <= clientWidth` for the page, price row, name column, and value column. The full local values were present: `VWCE IE00BK5BQT80` and `166,50 € Tự động · 19/08/2026`.

| Theme | Contribution marker/detail | Gain marker/detail/return |
| --- | --- | --- |
| Vault | `rgb(249, 115, 22)` (`#f97316`) | `rgb(250, 204, 21)` (`#facc15`) |
| Ocean | `rgb(249, 115, 22)` (`#f97316`) | `rgb(250, 204, 21)` (`#facc15`) |
| Ember | `rgb(194, 65, 12)` (`#c2410c`) | `rgb(161, 98, 7)` (`#a16207`) |

Ember deliberately uses the documented darker pair for contrast on its light card surface; Vault and Ocean match the demo pair exactly across legend, detail, and return elements.

## Dynamic performance follow-up (2026-08-20)

The demo source uses `var(--vi)` for the contribution segment and `var(--em)` for the positive return segment, so both change when the selected theme changes. It does not use a fixed orange/yellow pair outside Ember. The application implementation is being updated to follow that contract and to render explicit loss/unavailable states.

The first browser visit to the existing `localhost:4177` preview still displayed the pre-change orange/yellow legend in an empty portfolio. This preview was previously installed as a PWA and may be serving cached assets, so subsequent visual verification must use a fresh origin or bypass the active service worker.

Fresh preview at port 4178 confirmed that the new bundle is active. With an empty portfolio, the Performance card now reads `Chưa định giá` in its legend and detail value instead of incorrectly presenting `Lãi`; the contribution marker is the Vault primary violet rather than the former fixed orange. This verifies the unavailable-state rendering and theme inheritance on a cache-free origin.

The fresh preview's Transactions flow opens a manual form with `Mua VWCE` as the first/default selectable transaction type, ready for a controlled local visual check against the live VWCE quote. This data is confined to the isolated preview origin.

The isolated preview's manual form persisted the test amount as `Nạp cash`, not a VWCE purchase, despite the select's exposed option order. Therefore this browser session is not used as evidence for the gain-state calculation; that state is covered with deterministic purchase-plus-quote regression data instead. The isolated preview data remains local to port 4178.

The fresh preview accepted the Ocean theme selection; the full application shell switched from Vault violet/emerald to Ocean cyan/teal. The next Overview check verifies that the Performance marker inherits that same theme transition.

On Ocean, the computed contribution marker color is `rgb(34, 211, 238)`, exactly the active `--demo-vi` cyan token. Together with the fresh Vault check, this confirms the Performance card now changes palette with the selected theme rather than retaining the prior fixed orange/yellow treatment.

## Transactions journal 2026 preview (2026-08-20)

A fresh production preview was opened on port 4179 and initialized with isolated local data. This avoids prior PWA caches while checking the redesigned Transactions command deck and mobile journal.

The fresh Transactions preview shows the new journal command deck as a distinct glass surface: two immediate one-tap actions (`+ Mua VWCE`, `+ Góp tiền`), four horizontal activity chips, and a single advanced-tools entry. When opened, the tool panel keeps import, localized search, year, exact type, sort mode, and reset in a compact two-column grid. The hierarchy remains legible in the mobile-width application shell.

The `+ Mua VWCE` quick action was verified in the fresh preview: it opens the mobile bottom sheet with **Mua VWCE** already selected and the VWCE ISIN prefilled. This makes the primary investment flow explicit and avoids the prior ambiguity where a generic add flow could result in a cash transaction.

The `+ Góp tiền` action was also checked in the fresh preview: its form is explicitly preselected to **Nạp cash** and accepts the test amount. This complements the VWCE quick-create check and confirms that the two primary actions have intentional, distinct defaults.

With a local test contribution saved, the journal renders a compact month group and a row with the transaction icon, type, date, prominent amount, and a visible `…` trigger. Opening that trigger shows the portal action menu with **Sửa** and **Xóa**; the action is now discoverable on touch devices rather than hidden behind a long-press/context gesture.

A controlled 360px viewport check passed: the command deck has no horizontal overflow (`deckWidth: 280`, `viewportWidth: 360`), quick actions are 40px high, and activity chips are 34px high. This confirms the compact mobile contract without relying only on a desktop browser screenshot.

## Smart time lens preview (2026-08-20)

A fresh production preview was initialized on port 4180 with isolated browser storage before checking the new time-range rail in Transactions.

The Smart time lens rail renders beneath the immediate actions as a labeled `Thời gian` control with **Toàn bộ, Tháng này, 90 ngày, Năm nay, Năm trước**. Selecting **Tháng này** visibly activates that chip and changes the tools trigger to `Lọc / PDF · 1 bộ lọc`, so the active context remains explicit without opening the advanced panel.

A controlled 360px check passed for Smart time lens: no page-level horizontal overflow, all five ranges are present, the rail handles excess width internally through horizontal scrolling, and the smallest chip remains 31px high.
