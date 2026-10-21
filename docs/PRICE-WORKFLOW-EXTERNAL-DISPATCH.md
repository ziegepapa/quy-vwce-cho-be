# Price workflow: reliable external dispatch

## Why this exists

The scheduled price workflow has been observed arriving hours after its scheduled local time. GitHub documents that scheduled events can be delayed or dropped during high Actions load; timezone-aware cron syntax does not guarantee exact start time. This repository already exposes `workflow_dispatch`, so an external scheduler can trigger the same idempotent workflow without changing how quotes are validated or published.

This is a trigger fallback, not a live-price API. The price bot still selects the latest usable **closed** Xetra session; a successful run before the current session closes should not invent an intraday close.

## One-time setup on a trusted runner

1. Create a **fine-grained personal access token** scoped to this repository only, with **Actions: Read and write**. Keep it separate from `PRICE_BOT_TOKEN`; that secret is used by the price workflow for contents/PR operations.
2. Put the token in a root/user-readable-only environment file on the runner. Do not commit it, print it, paste it into a command line, or reuse the bot's contents-writing token.
3. Check out this repository on the runner and set `PRICE_WORKFLOW_DISPATCH_TOKEN` in the scheduler's protected environment.
4. Test one manual dispatch by running `node scripts/dispatch-price-workflow.mjs`. The script only confirms that GitHub accepted the dispatch request; inspect Actions for the actual job conclusion.

The script uses GitHub's official `workflow_dispatch` endpoint and sends only `{ "ref": "main" }`. A missing/insufficient token fails closed; token values are never logged.

## Suggested schedule (Europe/Berlin)

Configure an external scheduler with the explicit timezone `Europe/Berlin`:
- Monday–Saturday at **08:25**: morning catch-up after weekends or a missed close.
- Monday–Friday at **19:25**: primary run after the Xetra session has closed and source data has had time to settle.

These are retry opportunities, not a promise that the price source has already published a new session. The existing GitHub schedule can remain as a fallback. Duplicate runs are expected to be safe, but monitor Actions for failure and verify the published `asOf` date. If the workflow is busy, a dispatched run can still wait behind the existing concurrency group.

## What the app can display

The PWA downloads the published `/data/quotes.json`; it does not execute this dispatch script or contact the price providers directly. The timeline distinguishes the local record timestamp, market session (`asOf`), and published bot fetch timestamp (`fetchedAt`). If an economically identical fetch is intentionally not published, the UI cannot truthfully show it as a new published feed timestamp.
