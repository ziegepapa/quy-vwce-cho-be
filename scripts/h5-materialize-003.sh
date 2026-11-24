#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${DB_URL:-}" == 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' ]]
grep -qx 'project_id = "vwce-vault-local-h4h5"' supabase/config.toml
[[ "$(docker inspect -f '{{.State.Running}}' supabase_db_vwce-vault-local-h4h5)" == true ]]
[[ ! -e supabase/migrations/003_owner_only_least_privilege.sql ]]
supabase migration new --help >/dev/null
supabase migration new h5_owner_only_least_privilege
mapfile -t created < <(find supabase/migrations -maxdepth 1 -name '*_h5_owner_only_least_privilege.sql')
[[ "${#created[@]}" == 1 ]]
# CLI creates a timestamped skeleton; adapt to this repository's reviewed contiguous numbering.
cp scripts/h5-003-owner-only-candidate.sql "${created[0]}"
mv "${created[0]}" supabase/migrations/003_owner_only_least_privilege.sql
cmp -s scripts/h5-003-owner-only-candidate.sql supabase/migrations/003_owner_only_least_privilege.sql
# Cluster-level NOLOGIN marker survives local db reset, never exists on hosted by design.
docker exec supabase_db_vwce-vault-local-h4h5 psql -U supabase_admin -d postgres -X -v ON_ERROR_STOP=1 -c 'create role h5_disposable_003_marker nologin;'
node scripts/h5-migration-guard.mjs
echo 'PASS: CLI-generated 003 candidate materialized in disposable runner only'
