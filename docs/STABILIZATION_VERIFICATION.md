# Stabilization verification

The stabilization branch is intentionally limited to removing the annual transfer-rate preview while retaining the factual yearly plan table. Existing financial semantic validation in `src/lib/transactionValidation.ts` already rejects invalid fee/tax signs, missing sale quantity and oversold new-ingestion transactions through the canonical ledger gate in `src/lib/db.m07b.ts`.

H4 behavioral RLS and H5 migration reproducibility remain environment evidence gates. They must not be represented as passed without controlled Supabase/Auth/PostgREST and migration upgrade/rollback evidence.
