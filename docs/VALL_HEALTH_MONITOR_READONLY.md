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

## Current sourced snapshot

- Fund: Vanguard FTSE Global All-Cap UCITS ETF USD Acc, **VALL**,
  **IE000VAHT5T0**, *its own* **FTSE Global All Cap Index** (not FTSE
  All-World/VWCE's benchmark).
- Vanguard **factsheet for 30 September 2026**:
  **Total assets (million) US$2,573** (fund-wide, **not share-class assets**);
  **OCF/TER 0.07%**. PDF:
  https://fund-docs.vanguard.com/FTSE_Global_All-Cap_UCITS_ETF_USD_Acc_E161_EU_INT_UK_EN.pdf
- Tracking difference: **unknown**, not zero. The fund launched 18 Aug
  2026; Vanguard says performance data will become available after one year.
  Do not compare incomplete fund performance to an unrelated index or annualise
  the recent partial period.
- Trade Republic: the published generic rule says ETF Sparplan execution is
  free (https://support.traderepublic.com/de-de/760). This **does not verify
  that VALL specifically remains available as an eligible free Sparplan** for
  this user; instrument-specific status stays **null/unknown**.
- Changes/merger/liquidation and all red flags are **unknown** rather than
  falsely "healthy". Only an externally verified check may update them.
- VWCE alternative: IE00BK5BQT80, FTSE **All-World** Index, OCF/TER
  **0.14%**, distinct benchmark:
  https://fund-docs.vanguard.com/FTSE_All-World_UCITS_ETF_USD_Accumulating_9679_INT_OFF_ETF_EN.pdf?domicile=IE

The Vanguard live product page may show a **different, undated** Total Assets
value than the dated September factsheet. Never import an undated number,
mix a third-party AUM denominator, silently change "Total assets" into
"Share class assets", or compare rounded cross-source snapshots as a trend.
The UI displays only date-stamped factsheet data.

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
