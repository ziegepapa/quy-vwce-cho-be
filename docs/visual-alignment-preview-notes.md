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
