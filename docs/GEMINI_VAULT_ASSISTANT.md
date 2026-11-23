# Gemini Free Tier explainer — owner-operated activation guide

**Status (23 Nov 2026):** PR #413 (Flash routing + server cache) and PR #414
(clarified topic/Goal/Plan UX) are merged. Read-only production inspection
confirmed `gemini-vault-explain` v11 ACTIVE with JWT verification enabled;
`ai_internal.gemini_flash_daily` and `ai_internal.gemini_reply_cache`
exist with RLS enabled. PR #414's GitHub CI passed. This document does
not assert that a new real Google generation test has been performed.

**Financial source of truth:** the owner confirms **560 €** currently
contributed in the actual Vault. Historical **600 €** fixture values in isolated
tests are synthetic and must never be copied into the real ledger.

## What is implemented

- A **read-only, opt-in** AI explanation card on Simulation. It always displays
  a deterministic plain-language summary from the existing **local ledger**,
  even offline. The AI is an optional explanation *on top* of this summary.
- The actual portfolio valuation reuses `buildSimulationStartValue` (shared
  valuation semantics with Overview); if any valuation is stale/missing,
  the **value is blank** rather than using a sample. Contributions reuse
  `computeHeroLifetimeContribution` and `buildPlanVsReality`, respecting
  securities-first vs cash-first, tombstones and the recorded plan.
- The user actively selects a Goal if needed. No guessed target date or
  automatic sale; neither the Exit Plan schedule nor Simulation engine changes.
- Eight bounded question intents (plan, year-to-date contributions,
  chosen Goal, 3 Simulation scenarios, current value, value-versus-contributions
  difference, configured monthly contribution, chosen Goal progress) and a small German/Vietnamese short
  question classifier. **Typed question text never leaves the device**. The
  Edge Function receives only an enum, optional year and these aggregates:
  current value (or null), total contributed (or null), saved monthly amount,
  recorded and planned YTD, selected Goal's year/amount/mode (or null), and
  the three *hypothetical* scenario totals (or null). The 23 Nov follow-up
  further minimizes non-null fields by topic: Plan uses Plan figures, Monthly
  only monthly rate, Value only portfolio value, Goal only relevant chosen-Goal
  context, and Simulation only scenarios and any deliberately selected Goal.
  The privacy preview displays the actual scoped fields. The shown monthly
  contribution follows Y1 for the first 12 months from the plan start and Y2
  after that, rather than always prioritizing Y2. It never receives name,
  account number, ISIN, transactions, note, Goal title, phone or email.
  Authentication JWT goes **only to Supabase**, not to Google.
- Server-side auth `/auth/v1/user` + restricted PostgREST service RPC.
  No AI key in the browser; use existing Supabase project secret mechanism.
- Owner must actively click **Verfügbarkeit prüfen** and affirm the Google
  free-tier data-use notice before **KI fragen**. No background calls or polling.
- A private SQL counter with a transactional advisory lock enforces **20
  attempts per authenticated user per UTC day** and a conservative **40
  attempts per project per UTC day**. A Google 429 pauses new attempts until
  the next UTC day; never switches models on 429. The merged topic routing
  uses Flash for Goal/Simulation when a shared five-attempt UTC-day budget
  reservation succeeds, else Flash-Lite; other AI topics use Flash-Lite
  first. A backup is attempted only after a provider 404/503.
- The Edge Function is **OFF by default** until the explicit server-side
  `GEMINI_ASSISTANT_ENABLED=true` is set. It fails closed if either the key,
  SQL RPC installation, auth service or quota backend is missing. Existing
  local explanation remains visible on any failure.

## Installed — topic-based Flash routing and private 24h server cache

PR #413 was merged and the matching SQL and Edge deployment were separately
approved by the owner. Production metadata checks on 23 Nov confirm the two
private RLS tables, three Flash/cache RPCs and active Edge v11. There is no
reason to rerun SQL or redeploy Edge for the frontend-only follow-up.
No changes to provider keys, billing, cron, background processing, financial
tables, auth/Guardian/Resend code or 20-user/40-project UTC limit are needed.

Main currently supports **eight** bounded topics, not the four listed in the
original #404 specification. Retain all eight to avoid regression:
- `goal`, `simulation`: reserve one of **five shared Flash
  generateContent attempts per UTC day** and use Gemini 3.8 Flash. After
  the fifth Flash reservation, use Gemini 3.5 Flash-Lite instead, returning
  success normally (the response reports which model actually replied).
- `plan`, `value`, `monthly`: use Flash-Lite. On **404/503 only**,
  reserve one Flash attempt before a single fallback to Gemini 3.8 Flash.
- `year`, `difference`, `goalProgress`: **Vault-only**, unchanged.
  No Google call, model designation or AI quota for deterministic numeric
  comparisons. The existing safeguards introduced after Gemini incorrectly
  interpreted 560 € versus 600 € must not be removed.
- Primary Flash 404/503 falls back to Lite at most once. Any 429 from either
  provider triggers the unchanged global UTC-day pause, with no fallback.
  Every Flash generation attempt reserves a Flash slot **before the request**,
  even if Google responds with an error. Metadata GET never reserves a slot.
- An isolated app-wide Flash budget uses the private, service-role-only
  `ai_internal.gemini_flash_daily` table and an advisory-locked RPC.
  **5/day is an internal conservative cap, not a guarantee from Google.**

A second 24-hour **server-side cache** is separate from the existing device
cache. For an authenticated, explicitly user-initiated POST the server
normalizes the fixed topic, locale, aggregate facts and optional year,
computes SHA-256 of that JSON, and checks a private cache partitioned by
authenticated user ID. A valid **200** hit returns the validated answer and
provider model before the SQL 20/40 claim and without contacting Google.
The optional year is included in the digest to avoid stale results for a
different year. Provider errors, unsafe text, and responses lacking a
validated model are never cached. Cache stores only its digest, short safe
answer, model, expiry and private user partition. Expired records are removed
opportunistically during cache writes, without cron or background jobs.
The existing browser-local 24-hour cache continues to skip even Edge requests
on an exact match, now with model metadata for the displayed subtle
German/Vietnamese label. Cache display requires the same user action and
opt-in as before; signed-out users cannot read the private server cache.

**Manual SQL, not automatic:** review and run
`supabase/ops/gemini-flash-routing-install.sql` in the correct production
project **only after owner approval**. It creates only the two dedicated
internal tables and three restricted RPCs. On absence/failure of the new
Flash-budget RPC the Edge Function MUST NOT make any Flash generateContent
request. Do not use the production project for isolated CI smoke tests.

**RPD source:** the owner's 22 Nov 2026 Google AI Studio Free Tier project
screenshot shows Flash-Lite 15 RPM/250K TPM/500 RPD and Flash 3.8
5 RPM/250K TPM/20 RPD; those limits are project/model-specific, may change,
and do not guarantee any particular successful request count. The app
restricts shared Flash generation to five attempted calls per UTC day,
but Google's quota reset window may differ. No Billing activation is part
of this PR.

## UI clarification: topic-first, with verified Plan context

The optional free-text question is classified **on the device** into one
of the existing fixed topics; the original text is never sent to Gemini.
The highlighted button always reflects the **effective** detected topic.
When it differs from the button the user first selected, the screen
explicitly shows the recognized topic. An unsupported question shows a
localized explanation and disables submission, without spending quota.

The Goal selector appears only where it is relevant (`goal`,
`goalProgress`, optionally `simulation`). Goal fields are also **omitted from
unrelated topics’ outgoing fact payload**, even when the user selected a Goal
earlier in this screen. A `goal` Gemini question
requires an explicit selected Goal; no year or goal is inferred from a
typed sentence or automatically chosen from the goal list. The Plan
topic no longer displays an irrelevant "no Goal selected" label.
The existing source-of-truth ledger summary now includes verified
yearRecorded vs yearPlanned on the Plan tab, when both are available.
For example, if the actual recorded contribution is 560 € and the
planned amount is 600 €, the Vault says **below planned contributions**
rather than that the plan was reached. That comparison is determined
locally; Gemini remains an optional qualitative explanation, not a
source of arithmetic truth.

All Google opt-in/availability controls are hidden on the three
Vault-only topics so a read-only calculation is not mistaken for an AI call.
The general financial disclaimer is still shown.

This is a **front-end-only** change: no new Edge/SQL deployment,
secrets, background jobs, new data sent to Google, quota change,
cache change, or change to the finance ledger. Consent and all model
routing remain intact.

## Exact numeric comparisons: never decided by Gemini

- The current owner-confirmed contribution amount is **560 €** (the live Vault
  source of truth). For the reported year view, recorded **560 €** against
  planned **600 €** means **40 € below plan**. This is not a broker statement.
- `year`, `difference` and `goalProgress` are now **ledger-only** questions:
  the app calculates and explains the result immediately; no Gemini request,
  no new Google data transfer, and no SQL quota claim. The Edge Function also
  refuses these topic requests before quota allocation to protect older clients.
- A Gemini answer must never be shown as ground truth when it contradicts a
  deterministic result. Numeric words such as "năm trăm sáu mươi" or
  "fünfhundert" are rejected at the server as well as numerical digits.
- Legacy answer cache v1 is no longer read; v2 uses a new key namespace so
  incorrect Gemini prose cannot be replayed on a new client build.
- Other five qualitative topics remain Gemini opt-in. The exact amount is
  still shown separately from the Vault's ledger, never invented by the model.

## Optional Gemini answer cache (device-only)

- A successful, server-validated Gemini explanation can be reused for **24 hours**
  within the same browser/PWA installation. This is not a server cache and no
  additional Supabase or Google request is made when an exact match is found.
- The localStorage entry contains only the short explanation and its expiry.
  Its key is a SHA-256 digest of the signed-in Supabase user ID and the entire
  normalized Gemini request (locale, fixed topic, optional year and aggregate
  facts). No raw question text, transaction record, API secret, auth token,
  user ID or portfolio numbers are stored in plaintext cache keys or values.
- Different users, different Goal selection, dates, portfolio values or other
  facts generate different cache keys. Any relevant context change clears the
  displayed old explanation so stale AI content is not shown beside new numbers.
- Cache lookup occurs **only** after deliberate user action and consent. If a
  matching local response exists, the app does not check Google readiness or
  claim a daily quota attempt. Otherwise, behavior remains unchanged. A
  dedicated button clears all Gemini cache entries from this device.
- Storage may be unavailable (private browsing or permission restrictions).
  In that case the app gracefully uses normal server calls. Cached responses
  do not increase the provider's Free Tier quota; they only avoid repeated
  calls. Daily server limits remain **20/user and 40/project**, unchanged.
- Device storage is not a cross-device encrypted vault. Avoid caching responses
  on shared or untrusted devices; clear the entries via the in-app control.

## November 2026 Free Tier limit review

The owner shared the live Google AI Studio **Gemini aiProject / Free tier**
rate-limit screenshot on 22 Nov 2026. It showed model RPD utilization
**2 / 500** and **0 / 100**, both above the app's new conservative 20-user /
40-project UTC day caps. The image did not show the row-to-model mapping; do
not promise Google will accept all 20 requests on a future day, and do not
enable Billing or claim the app is entitled to 500 calls for every model.
Google can enforce independent requests-per-minute/tokens-per-minute limits
or change Free Tier rules. A provider HTTP 429 still pauses server attempts.

Production upgrade sequence: merge CI-verified code, apply the narrowly
scoped `supabase/ops/gemini-explain-upgrade-20.sql` against the approved
Supabase project, verify the 20-attempt CHECK, read-only quota RPC and
service-role permissions, deploy just `gemini-vault-explain` with JWT enabled,
then verify the PWA displays 20. The SQL preserves existing usage counts,
keeps the 40-project ceiling and leaves all finance and auth data alone.

## Financial and privacy caveats

The AI answer must be a short text with **no numbers generated by Gemini**;
exact numbers and arithmetic are displayed separately by the app from its
ledger-derived data. The local answer is always available with no AI quota. The server
rejects unexpected numbers, prices, trading instructions or malformed content.
Nothing is treated as investment/tax advice. The question "have I paid enough
this year" compares the **recorded ledger entries** with the configured plan
*up to today*, not proof of broker deposits or future goal achievement. The
three Simulation values are explicitly *model scenarios*, not realized value.

**Important:** Google currently says content on Gemini API **Free Tier** can
be used to improve its products. Even aggregated portfolio amounts may be
sensitive. The user must consent explicitly *per app session*. Do not use this
feature if you do not accept that data processing.

The often-quoted `500` and `20` daily request figures are **not guaranteed**.
Google applies model/project-specific RPM/TPM/RPD limits and can change them.
The server handles a smaller quota. Its UTC daily counter may reset at a
different time than Google's Pacific-time daily quota. A key attached to a
paid billing project could still create charges; verify **Free Tier** in AI
Studio before enabling the function. This code cannot guarantee zero charges
once Google billing is enabled.

Official references:
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/docs/models
- https://supabase.com/docs/guides/functions/auth

## Owner-operated procedure — only when each step is separately approved

**For future maintenance only; avoid repeating completed production steps.**

1. In a browser, open https://aistudio.google.com/api-keys and sign in with
   your own Google account. In Google AI Studio, open **API keys**. Confirm the
   intended Google project is on the **Free Tier**, without activating paid
   billing. Check the actual allowed models and limits at
   https://aistudio.google.com/rate-limit. Create a Gemini API key for that
   project. **Never paste it into ChatGPT, GitHub, the app or screenshots.**
2. In the Supabase Dashboard, select the *correct* VWCE Vault **production**
   project, not an unrelated staging project. Go to **Edge Functions → Secrets**
   (the position may change in the dashboard). Add the secret named
   `GEMINI_API_KEY` and paste the key there privately. This is a manual
   action after approval. Do **not** change `RESEND_API_KEY`, Guardian
   secrets, or existing Supabase Auth keys.
3. In the Supabase **SQL Editor** on that exact project, review and run
   `supabase/ops/gemini-explain-install.sql` only after separate approval.
   It creates solely private `ai_internal` quota tables and **service-role-
   only** read/claim/pause RPCs. It does not alter the financial tables,
   auth data or Supabase Cron; the table is not in the public Data API.
   No cleanup job is scheduled; counters older than 45 days are deleted on
   future authorized claims. Without this SQL step, AI remains unavailable.
4. After owner approval, deploy the repository's
   `supabase/functions/gemini-vault-explain/index.ts` to that project as
   `gemini-vault-explain`, with **JWT verification enabled** (`verify_jwt=true`,
   the default). Deploying this is separate from merging the frontend PR.
5. Only when all above have passed a separate review, add Supabase Edge
   Function secret **`GEMINI_ASSISTANT_ENABLED=true`**. The default absence
   or `false` keeps the AI off. Do not create any cron or scheduled jobs.
6. In VWCE Vault, open **Simulation → Dein Sparplan, einfach erklärt**;
   sign in, select a Goal if needed, choose a question, click
   **Verfügbarkeit prüfen**. Only if readiness succeeds and you consent,
   click **KI fragen**. The card remains readable offline/without a key.
7. Verify a single test response with your own non-sensitive, explicitly
   approved aggregates. Verify that 20 attempts per user/day are enforced.
   Check Supabase Edge Function logs for **error codes**, never raw financial
   payloads. To stop usage, set `GEMINI_ASSISTANT_ENABLED=false` or remove
   the key in **Edge Functions → Secrets**. Do not touch the Silent Guardian.

## Production diagnostics and optional offline-first explanations

- The existing **Verfügbarkeit prüfen / Kiểm tra kết nối AI** button sends
  an authenticated GET plus the fixed `x-gemini-check: 1` header to the Edge
  Function. The server requests only Google model **metadata** (GET two fixed
  model paths) using its own secret. **No financial facts, raw question, name or
  user token are sent to Google; no SQL claim is made.** This does not
  consume a Vault daily question attempt. The metadata check is not a
  generation test and Google may enforce its own API operation quotas.
- Model-check returns only numeric HTTP statuses. A successful 200 proves
  that model metadata and the API credential are reachable, **not** that
  the key is allowed to generate on Free Tier or that capacity is available.
- If generation fails, the Edge response contains an approved fixed code
  such as `GOOGLE_KEY_INVALID`, `GOOGLE_ACCESS_DENIED`,
  `GOOGLE_BAD_REQUEST`, `GOOGLE_MODEL_NOT_FOUND`,
  `GOOGLE_OVERLOADED`, `AI_EMPTY_OUTPUT`,
  `AI_RESPONSE_REJECTED`, or `GOOGLE_NETWORK_ERROR`.
  It never includes Google's raw error message or the portfolio input.
- The output allowance was raised from 200 to 512 tokens to reduce the
  likelihood of empty text when thinking consumes the allowance. The
  now-deprecated custom temperature setting was removed. These changes
  **do not** guarantee Google will return a valid answer.
- The UI now labels the server's counter **attempts** instead of successful
  answers; previously recorded 6 attempts on Nov 22 are **not reset or
  reimbursed**. No quota schema, RLS, Guardian or finance data are changed.
- For future changes, run GitHub tests, review the proposed PR and deploy
  Edge only if backend code changes and the owner separately approves it.
  Test a voluntary response in the phone app if necessary; do not repeat
  real Gemini calls just to diagnose a transient 503.

## Tests and known validation boundary

CI runs `npm test`, strict TypeScript/build, locale audit, PWA/bundle limits,
benchmark, release, a Deno type check and a **fully mocked** Supabase +
Gemini Edge Function smoke. Browser Playwright captures a 390×844 localized
screen in German/Vietnamese, light/dark, with a **local-only fixture**. None of
these calls the real Google API, real Supabase production, or writes the
real portfolio.

**Verification boundary (23 Nov):** Supabase SQL objects and active JWT-protected
Edge v11 were verified read-only, and PR #414 CI passed. No new authenticated
phone generation or actual Google quota/eligibility test was carried out
during this review; real offline/device behavior remains a manual check.
This frontend-only follow-up must pass its own CI before merging or publishing.


## Goal UX and meaningful explanations — 23 Nov 2026 follow-up

- If the Goal topic has no explicitly selected, valid Goal, the PWA shows
  a selection/create-Goal prompt and the deterministic Vault notice; it hides
  the outgoing-facts preview, consent checkbox, AI buttons, and readiness
  status. No Google request can start from that state. Simulation still
  supports an optional Goal; other topics keep their original routing.
- The Plan's *local* ledger summary now computes an exact, cents-rounded
  shortfall versus the amount planned through today and the displayed
  portfolio-value minus recorded contributions. These are snapshots of the
  Vault ledger, **not** broker confirmations, realized returns, or forecasts.
  No made-up data, new financial records, or Gemini calls are involved.
- The Edge function rejects a Goal explanation lacking Goal year/amount
  before the 20/day SQL quota claim. Prompt instructions explicitly favor
  explaining the difference between contributions, fluctuating valuation,
  and planned monthly savings rather than generic restatements. The ban
  on model-generated numbers, investment instructions, and invented progress
  remains in force. This improves the *instructions*, not a guarantee of
  prose quality from the provider.
- The server response cache hash and local device answer key use
  `context-v2` as a revision component, so a previously cached generic
  response is not replayed. Existing stored entries are not deleted and
  expire on their normal 24-hour schedule. A genuinely new Gemini response
  is a new quota-bearing generation if neither revised cache has a hit.
- Deployment boundary: the frontend can ship through the ordinary GitHub
  Pages flow after CI/merge; **the prompt and Goal API guard require a
  separately verified Edge Function deployment**. No database SQL, keys,
  billing settings, or Guardian code must be changed. Run mocked Deno/Edge,
  Vitest, Playwright mobile, PWA bundle and full workflow checks before
  shipping. Never use synthetic fixture figures as the user's real ledger.
