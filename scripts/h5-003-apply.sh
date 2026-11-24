#!/usr/bin/env bash
set -euo pipefail
umask 077
# No hosted URL, linked project, or arbitrary migration arguments are accepted.
[[ "${GITHUB_ACTIONS:-}" == true && "${DB_URL:-}" == 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' ]]
[[ "${RUNNER_TEMP:-}" == /home/runner/work/_temp* ]]
grep -qx 'project_id = "vwce-vault-local-h4h5"' supabase/config.toml
src=supabase_db_vwce-vault-local-h4h5
[[ "$(docker inspect -f '{{.State.Running}}' "$src")" == true ]]
candidate=supabase/migrations/003_owner_only_least_privilege.sql
cmp -s scripts/h5-003-owner-only-candidate.sql "$candidate"
[[ "$#" == 1 ]]
case "$1" in
  reset) supabase db reset --local --yes --version 002 ;;
  upgrade) ;;
  *) echo 'FAIL: unknown H5 003 stage'; exit 1 ;;
esac
sp() { docker exec -i "$src" psql -U supabase_admin -d postgres -XAt -v ON_ERROR_STOP=1 "$@"; }
versions=$(sp -c "select string_agg(version,',' order by version) from supabase_migrations.schema_migrations")
[[ "$versions" == 001 || "$versions" == 001,002 ]]
# Reset may remove custom roles. Deliberately prove the guard still refuses
# the exact candidate without a marker, even on a fresh disposable database.
sp -c 'drop role if exists h5_disposable_003_marker' >/dev/null
log=$(mktemp "$RUNNER_TEMP/h5-003-refusal.XXXXXX")
trap 'rm -f "$log"' EXIT
if sp < "$candidate" >"$log" 2>&1; then
  echo 'FAIL: 003 unexpectedly accepted missing marker'; exit 1
fi
grep -Fq 'H5 003 refuses non-rehearsal execution' "$log"
[[ "$(sp -c "select string_agg(version,',' order by version) from supabase_migrations.schema_migrations")" == "$versions" ]]
[[ "$(sp -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relforcerowsecurity and c.relname in ('profiles','app_settings','goals','transactions','annual_checklists','monthly_snapshots')")" == 0 ]]
echo 'PASS: unchanged 003 guard refused missing marker; baseline catalog and migration ledger unchanged'
# Only now recreate the NOLOGIN marker, immediately before pending migrations.
sp -c 'create role h5_disposable_003_marker nologin' >/dev/null
[[ "$(sp -c "select count(*) from pg_roles where rolname='h5_disposable_003_marker' and not rolcanlogin")" == 1 ]]
supabase migration up --local
[[ "$(sp -c "select string_agg(version,',' order by version) from supabase_migrations.schema_migrations")" == 001,002,003 ]]
[[ "$(sp -c "select count(*) from pg_roles where rolname='h5_disposable_003_marker' and not rolcanlogin")" == 1 ]]
echo 'PASS: 003 applied after local reset/upgrade with verified NOLOGIN marker'
