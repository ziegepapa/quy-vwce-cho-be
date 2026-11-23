# VALL Health Monitor — read-only, repo-backed display

## Scope / release gate

This is **only a view** under **Settings → Data → VALL Health Monitor**, not a
monitor, scheduler, data source, brokerage checker, buy/sell automation or
Gemini feature. The only displayed fund measurements are in the manually
reviewed versioned file `src/data/vall-health.json`. The app does **not**
request Vanguard, Trade Republic, Edge Functions, background data or PWA
service workers to refresh these measurements. No local business records are
changed. No external monitoring is created or changed by this PR.

Keep the PR in **Draft until Chien approves**. Do not merge/deploy before all
test, build, preview/mobile, PWA budgets, CI and source review are green.

## Premium UI upgrade (read-only, no new monitoring)

- Evidence-first hero makes a clear distinction between **verified inputs** and
  **unknown fund-health questions**. A count such as `0/5 flags checked` is a
  count of manual fact dispositions, **not a fund score or evidence of safety**.
- The date on the top ribbon is the **snapshot's last reviewed/committed
  date**; the Total Assets and TER cards retain their own **Vanguard
  factsheet as-of date**. These dates must never be represented as "live".
- A deterministic, no-network presentation helper identifies which already
  agreed **external** review date is next, without assuming an elapsed date
  was completed or scheduling any in-app job.
- Visitors may filter the five manually reviewed flags by **all / unknown**.
  Filtering changes no data and triggers no network calls.
- A separate comparison presents VALL (FTSE Global All Cap) and the
  conditional VWCE alternative (FTSE All-World) with distinct benchmark
  labels; fee differences alone are not presented as a performance ranking.
- No background fetch, notifications, data edits, simulations, automatic
  trades, fund health scoring or Gemini calls. The view remains an optional
  lazy-loaded chunk, outside the **mandatory PWA precache**. The first
  opening may therefore need internet; the existing offline ledger remains
  unchanged.

## Dated asset observations — do not conflate a rolling PDF link with an archive

- VALL: **IE000VAHT5T0**, its own **FTSE Global All Cap Index**.
- Three historically dated observations from the owner's factsheet monitoring
  ledger, in **million USD**, preserved in `history`:
  - **31 Aug 2026:** **Total assets $660**, **share class assets $645**.
    August OCF was not supplied for that date, therefore **null**.
  - **30 Sep 2026:** **Total assets $2,573**, **share class assets $2,506**,
    OCF **0.07%**. The original September PDF was directly readable.
  - **31 Oct 2026:** **Total assets $4,353**, **share class assets $4,223**,
    OCF **0.07%**. Figures were **provided by Chien from a dated October
    factsheet entry**, not independently confirmed from the dynamic PDF
    in this review.
- September→October **Total assets +69.18%**, displayed rounded **+69%**.
  This is **NOT a fund return**, not a personal gain and cannot reveal the
  exact amount of investor inflows or whether the fund is safe from closure.
  Never mix `Total assets` with `share class assets` in the same trend.
- October portfolio characteristics (fund vs **FTSE Global All Cap**),
  owner-supplied: holdings **6,977 vs 10,207**, P/E **19.4 vs 19.3**,
  P/B **3.2 vs 3.2**, ROE **18.5% vs 18.5%**, earnings growth **19.0% vs
  19.0%**, dividend yield **1.6% vs 1.6%**. These describe holdings
  composition/sampling **only** — not returns or tracking difference.
- **Provenance warning:** as of this review, the public Vanguard PDF at
  https://fund-docs.vanguard.com/FTSE_Global_All-Cap_UCITS_ETF_USD_Acc_E161_EU_INT_UK_EN.pdf
  still returned **30 September 2026** when inspected, despite the newer
  numbers supplied by the user. It is a rolling file URL, **not immutable
  archived October evidence**. The app labels the August/October entries
  `owner-ledger`; avoid claiming we personally verified the October
  PDF. To upgrade provenance, attach/locate the actual archived October
  factsheet and check its date and measurements.
- Tracking difference: **null** for all three months, not zero. Vanguard says
  performance data will be available **after one year**, measured from
  fund launch **18 August 2026**. August 2027 is **earliest expected**, not
  a fixed provider publication promise.
- Trade Republic: the general published rule says ETF Sparplan execution
  is free (https://support.traderepublic.com/de-de/760). Chien reported
  **0 € per Sparplan execution and 1 € for one-off buys as of 23 Nov 2026**.
  These appear as **owner-reported costs**. This does **not** validate the
  VALL instrument's broker order receipt; keep
  `tradeRepublic.vallSparplanFreeVerified = null` until independently
  confirmed from a real execution.
- Five manually checked red-flag outcomes stay **null/unknown**:
  **no confirmation is not a green light**.
- VWCE alternative: **IE00BK5BQT80**, **FTSE All-World Index**,
  OCF/TER **0.14%**; a distinct index, not a direct tracking comparison:
  https://fund-docs.vanguard.com/FTSE_All-World_UCITS_ETF_USD_Accumulating_9679_INT_OFF_ETF_EN.pdf?domicile=IE

## Readability and evidence boundaries

The first screen shows only **three metric cards**: Total assets, annual fees
and unreported TD. Each has one plain-language explanation and an as-of date
(or explanation why a TD date does not exist). Fee details and the six
portfolio-vs-index characteristics appear only when expanded, with glossary
entries opening in-place. The SVG AUM chart uses only committed observations
and does not call a network API or calculate a fund health score.

The UI answers "Is the child's fund OK?" in qualified plain language:
growing total assets, unchanged 0.07% OCF and several similar portfolio
attributes are *useful facts*, but **not proof of ETF health**, low tracking
difference or absence of red flags. The next **external** check displays a
countdown calculated when the panel is opened; the app does not schedule the
check or infer that elapsed dates were completed. The November factsheet
estimate (mid-Dec 2026) is a possible check, not a guaranteed publication.

## External checks already agreed (NOT scheduled here)

- Light: **16 Jan 2027**, **16 Apr 2027**.
- Full: **16 Aug 2027**, then assess the available one-year performance.
  It is possible performance data is still unavailable on that day.
- Compare new Vanguard factsheets to the **same FTSE Global All Cap**.
  External red-flag criteria: persistent negative tracking difference by
  ~0.15–0.30 **percentage points/year beyond costs**, strong decline in
  Vanguard's comparable *Total assets*, loss of a free VALL Sparplan,
  OCF/TER increase, merger/liquidation.
- If a credible red flag is independently verified, show a review suggestion
  for **new** Sparplan contributions to VWCE (not a sale recommendation);
  no automatic action, return guarantee or personalized advice.

## Updating after an external review

1. Manually inspect the actual new Vanguard factsheet. Copy its **as-of date**
   and **Total assets (USD millions)**; never reuse an undated live tile.
2. Make a `chore(data): update VALL factsheet snapshot ...` change to
   `src/data/vall-health.json`. Update `checkedOn` to the verification
   date and append one `history` observation ordered by `asOf`, with the
   original Vanguard PDF URL for that observation. Never guess tracking
   difference, even if a date for a full check has arrived.
3. Update `tradeRepublic.vallSparplanFreeVerified` **only** when the
   specific VALL offer is verified with an instrument-level source; the
   generic free-ETF-Sparplan rule is not proof.
4. Set an alert flag to `true` **only** when independently verified,
   `false` only if an actual check supports that result, and `null` if
   not known. Multiple historical AUM points from comparable factsheets
   are needed before describing a meaningful drop. These are
   **manual factual dispositions**; the app does not calculate risk flags.
5. CI validates data formats and source boundaries; review screenshots
   in Vietnamese and German before merge. No database/cron/Edge changes.

The parser rejects invalid dates, wrong ISIN/index, non-Vanguard AUM sources,
non-numeric measurements and one-year TD data prematurely entered before
18 Aug 2027. It does not authenticate source contents by itself: human
source review and PR approval are still essential.
