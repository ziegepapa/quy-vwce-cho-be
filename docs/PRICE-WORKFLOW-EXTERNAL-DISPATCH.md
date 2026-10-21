# Price workflow: reliable external dispatch

## Why this exists

The scheduled price workflow has been observed arriving hours after its scheduled local time. GitHub documents that scheduled events can be delayed or dropped during high Actions load; timezone-aware cron syntax does not guarantee exact start time. This repository exposes `workflow_dispatch`, so a timer on a trusted Ubuntu/VPS can trigger the same idempotent workflow without changing how quotes are validated or published.

This is a trigger fallback, not a live-price API. The price bot still selects the latest usable **closed** Xetra session; a successful run before the current session closes should not invent an intraday close.

## Install on the trusted Ubuntu/VPS

Run these steps on the Ubuntu machine that should own the schedule, from a local checkout of this repository. I cannot enable a systemd timer on that machine from GitHub alone; the installer below actually creates/enables it on the machine where it is run.

1. Create a **fine-grained personal access token** scoped to this repository only, with **Actions: Read and write**. Keep it separate from `PRICE_BOT_TOKEN`; that secret is used by the price workflow for Contents/PR operations.
2. Update the checkout to current `main` and run:

   ```bash
   sudo bash scripts/install-price-dispatch-timers.sh
   ```

3. When prompted, paste the PAT into the **hidden** prompt. Do not put it in the command line, Git, an issue, or chat. The script stores it root-owned at `/etc/vwce-price-dispatch.env` with mode `0600`; it is never printed. On repeat runs the existing protected token file is kept.
4. Verify the timers were enabled:

   ```bash
   systemctl list-timers --all 'vwce-price-dispatch-*' --no-pager
   systemctl status vwce-price-dispatch-catchup.timer vwce-price-dispatch-after-close.timer --no-pager
   ```

5. After checking the timer list, optionally test one immediate dispatch:

   ```bash
   sudo systemctl start vwce-price-dispatch.service
   sudo journalctl -u vwce-price-dispatch.service -n 80 --no-pager
   ```

The installer checks that Node.js 22+ is available and validates the two calendar expressions with `systemd-analyze` before enabling the timers. It does not launch a workflow automatically during installation. The unit is hardened with a read-only filesystem/home view and a root-readable-only environment file.

## Installed schedule (Europe/Berlin)

- Monday–Saturday at **08:25**: catch-up after weekends or a missed close.
- Monday–Friday at **19:25**: after the Xetra session has closed and source data has had time to settle.

The timers use the `Europe/Berlin` timezone, so the wall-clock schedule follows CET/CEST automatically. `Persistent=true` also requests a catch-up if the host was off when a calendar event was due. The external timer is an additional trigger; the native GitHub schedule remains enabled as a fallback.

These are retry opportunities, not a promise that the provider has published a new session by that minute. systemd can still be delayed by host sleep/load, GitHub can queue the dispatched run, and the workflow can fail if its own source or token is unavailable. Check the Actions run result and verify the published `asOf` date. Duplicate runs are expected to be safe due to existing price workflow idempotency.

## Security, rollback and limits

- The PAT requires only repository **Actions: write** to dispatch the workflow; it is not the content/PR token and should not be reused as `PRICE_BOT_TOKEN`. GitHub documents this permission for the workflow-dispatch REST endpoint. [GitHub REST API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).
- The token stays in `/etc/vwce-price-dispatch.env`, owned by root with mode `0600`; never paste it into an issue or log.
- To remove the timers without removing the credential, run `sudo bash scripts/uninstall-price-dispatch-timers.sh` from the repository checkout. To remove the credential too, add `--remove-token`.
- A successful dispatch response means GitHub accepted the trigger; it does **not** prove that the subsequent price job or deploy succeeded.
- The PWA only downloads the published `/data/quotes.json`; it does not execute this dispatcher or contact price providers directly. The timeline separates the local record timestamp, market session (`asOf`), and published bot fetch timestamp (`fetchedAt`).
