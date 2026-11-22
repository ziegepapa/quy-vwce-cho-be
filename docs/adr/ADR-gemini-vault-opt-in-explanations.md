# ADR: Bounded Gemini explanations — opt-in and never on a financial write path

**Status:** Draft review (PR #404, 2026-11-22). Owner explicitly requested
Gemini Free Tier integration, but no server activation, secret, database install,
cron or production deployment has been approved.

## Compatibility with existing financial and legacy-AI decisions

This ADR is a **narrow exception** to
[ADR-financial-policy-boundary.md](./ADR-financial-policy-boundary.md) and the
P8 legacy AI inventory. The existing UI prohibition of `explain-trace` and
direct provider clients stays in place. The only newly approved external call
is an explicitly clicked, authenticated
`supabase.functions.invoke("gemini-vault-explain")` from the single
`GeminiVaultExplainer` component.

The AI must never:
- create/change/delete transactions, goals, `protectedAmount`, settings,
  forecasts, broker trades, backups, sync/conflicts or onboarding;
- calculate personal German tax or recommend buying/selling/asset allocation;
- send user names, email, account IDs, passwords, notes, transaction rows,
  child's name, ISIN or any free-form query text to Google;
- infer a use date/2042 sell deadline, future prices or guaranteed outcomes;
- run automatically in a PWA background sync, cron or notification workflow.

## Exact data contract

All *actual* values are built by existing local-ledger functions. The client
may send to the Edge Function only schema-versioned, bounded numeric fields:
`portfolioValue`, `contributed`, `monthly`, `yearRecorded`, `yearPlanned`,
`year`, an explicitly selected Goal's numeric `goalAmount`, `goalYear`,
`goalMode`, and *labeled hypothetical* simulation-year and three scenario
totals. Unknown values stay `null`; no defaults. The user question is mapped
locally to four fixed topics and an optional year. The verbatim question stays
on device. Auth JWT is checked only by Supabase, not sent to Google.

The local factual explanation is ALWAYS shown, including when the provider
is offline or the user refuses consent. AI output is limited to qualitative
plain sentences and may not supply any number, rate, year, currency, future
price or prescriptive personal trade/tax instruction; reject unsafe responses.

## Cost/privacy/reliability

Google Free Tier may use supplied prompts to improve products; aggregate
amounts still present personal financial privacy concerns. Explicit,
session-only owner consent is required before sending anything. Never put
`GEMINI_API_KEY` in browser, public repository, logs or any JSON payload.
Edge Function uses only Supabase secret management, initially disabled.

A private SQL counter (manual install) enforces 10 authenticated
attempts/user/UTC day and a separate conservative 40/project/day cap,
independent of untrusted browser counters. A 429 from Google opens a
server-side fail-closed circuit until the next UTC day. Backup model is
attempted at most once only if primary returns 404/503; never on 429.
Actual Google Free Tier quotas and reset timing are controlled by Google and
may change. A paid Google key may incur charges; warn the owner to verify the
Free Tier before any separately approved enablement.

All evidence in Draft CI must use isolated fake authentication and fake
Gemini endpoints and never reach real Google or production Supabase.
Any actual key creation, quota table installation, Edge deployment, release,
production validation or GitHub merge needs a distinct owner instruction.
