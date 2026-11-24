#!/usr/bin/env bash
set -euo pipefail
umask 077
# Only the ephemeral GitHub runner with the pinned local project; never accept remote connection arguments.
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_TEMP:-}" == /home/runner/work/_temp* ]]
[[ "${DB_URL:-}" == 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' ]]
grep -qx 'project_id = "vwce-vault-local-h4h5"' supabase/config.toml
src=supabase_db_vwce-vault-local-h4h5
dst=h5-restore-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}
tmp=$(mktemp -d "$RUNNER_TEMP/h5-full.XXXXXX")
cleanup() { docker rm -f "$dst" >/dev/null 2>&1 || true; rm -rf "$tmp"; rm -f "$RUNNER_TEMP/h5-full-users.json" "$RUNNER_TEMP/h5-full-credentials.json"; }
trap cleanup EXIT
# The source is the CLI-created container, not a network database. Use its local admin socket.
[[ "$(docker inspect -f '{{.State.Running}}' "$src")" == true ]]
image=$(docker inspect -f '{{.Image}}' "$src")
sp() { docker exec -i "$src" psql -U supabase_admin -d postgres -XAt -v ON_ERROR_STOP=1 "$@"; }
# Baseline is fresh and must have no identities before fixtures.
[[ "$(sp -c 'select count(*) from auth.users')" == 0 ]]
node scripts/h5-full-seed.mjs
# Start with no private schemas. Apply only the separate, no-dispatch synthetic fixture.
[[ "$(sp -c "select count(*) from pg_namespace where nspname in ('ai_internal','guardian_internal')")" == 0 ]]
{ echo "SET h5.synthetic_recovery = 'local-only';"; cat scripts/h5-private-recovery-fixture.sql; } | sp >/dev/null
echo "PASS: eight private operational tables seeded without provider dispatch"
sp -c "select jsonb_build_object('version',current_setting('server_version'),'extensions',(select jsonb_agg(extname order by extname) from pg_extension))" > "$tmp/engine.json"
# Use the source image's own pg_dump/pg_restore versions, with ownership, ACLs and data intact.
docker exec "$src" pg_dumpall -U supabase_admin --globals-only > "$tmp/globals.sql"
docker exec "$src" pg_dump -U supabase_admin -d postgres -Fc > "$tmp/database.dump"
test -s "$tmp/globals.sql"; test -s "$tmp/database.dump"
echo 'PASS: full logical PostgreSQL database archive and cluster globals created (synthetic only)'
# A second clean cluster, same image, no network access; no service or cron dispatch can contact production.
docker run -d --network none --name "$dst" --user postgres --entrypoint /bin/sh "$image" -c 'sleep infinity' >/dev/null
docker exec "$dst" sh -ec 'mkdir -p /tmp/h5cluster /tmp/h5socket; b=$(pg_config --bindir); "$b/initdb" -D /tmp/h5cluster -U h5_restore_bootstrap --auth=trust --no-locale -E UTF8 >/tmp/h5-init.log; "$b/pg_ctl" -D /tmp/h5cluster -l /tmp/h5-postgres.log -o "-c listen_addresses= -c unix_socket_directories=/tmp/h5socket -c shared_preload_libraries=pg_cron,pg_stat_statements" -w start' >/dev/null
dp() { docker exec -i "$dst" psql -h /tmp/h5socket -U supabase_admin -d postgres -XAt -v ON_ERROR_STOP=1 "$@"; }
docker exec -i "$dst" psql -h /tmp/h5socket -U h5_restore_bootstrap -d postgres -Xq -v ON_ERROR_STOP=1 < "$tmp/globals.sql" > "$tmp/globals-restore.log" 2>&1 || { echo 'FAIL: cluster globals restore (private log withheld)'; exit 1; }
# template postgres has no app schema. pg_restore must succeed, including ACLs and FK validation.
[[ "$(dp -c "select count(*) from pg_namespace where nspname='auth'")" == 0 ]]
docker exec -i "$dst" pg_restore -h /tmp/h5socket -U supabase_admin -d postgres --exit-on-error --single-transaction < "$tmp/database.dump" > "$tmp/restore.log" 2>&1 || { echo 'FAIL: whole database pg_restore (private log withheld)'; exit 1; }
echo 'PASS: entire logical archive restored into blank network-isolated cluster'
# Catalog, actual row content hashes and counts (never print rows or auth secrets).
sp < scripts/h5-schema-inventory.sql > "$tmp/source-catalog.json"
dp < scripts/h5-schema-inventory.sql > "$tmp/restored-catalog.json"
cmp -s "$tmp/source-catalog.json" "$tmp/restored-catalog.json" || { echo 'FAIL: restored app catalog differs'; exit 1; }
echo 'PASS: app catalog identical, including policies, grants, constraints, triggers and function hashes'
for table in auth.users auth.identities public.profiles public.app_settings public.goals public.transactions public.annual_checklists public.monthly_snapshots; do
  sql="select count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) from $table t"
  s=$(sp -c "$sql"); d=$(dp -c "$sql")
  [[ "$s" == "$d" ]] || { echo "FAIL: restored data mismatch $table"; exit 1; }
  case "$table" in auth.users|auth.identities|public.profiles) [[ "${s%%|*}" == 2 ]];; *) [[ "${s%%|*}" == 4 ]];; esac
  echo "PASS: $table count and exact row fingerprint match"
done
for table in ai_internal.user_daily ai_internal.global_daily ai_internal.gemini_flash_daily ai_internal.gemini_reply_cache guardian_internal.config guardian_internal.tickets guardian_internal.scans guardian_internal.deliveries; do
  sql="select count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E'\\\\n' order by to_jsonb(t)::text),'')) from $table t"
  s=$(sp -c "$sql"); d=$(dp -c "$sql"); [[ "$s" == "$d" ]]
  case "$table" in ai_internal.user_daily|ai_internal.gemini_reply_cache) [[ "${s%%|*}" == 2 ]];; *) [[ "${s%%|*}" == 1 ]];; esac
  echo "PASS: restored private $table count and fingerprint match"
done
[[ "$(sp -c 'select last_value,is_called from guardian_internal.scans_scan_id_seq')" == "$(dp -c 'select last_value,is_called from guardian_internal.scans_scan_id_seq')" ]]
# Effective privileges, not just presence of ACL strings. Do not call any network function.
[[ "$(dp -c "select count(*) from pg_roles r cross join pg_namespace n where r.rolname in ('anon','authenticated') and n.nspname in ('ai_internal','guardian_internal') and has_schema_privilege(r.rolname,n.oid,'USAGE')")" == 0 ]]
[[ "$(dp -c "select count(*) from pg_roles r cross join pg_proc p join pg_namespace n on n.oid=p.pronamespace where r.rolname in ('anon','authenticated') and n.nspname='public' and p.proname ~ '^(gemini_|guardian_worker_)' and has_function_privilege(r.rolname,p.oid,'EXECUTE')")" == 0 ]]
[[ "$(dp -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^(gemini_|guardian_worker_)' and has_function_privilege('service_role',p.oid,'EXECUTE')")" == 8 ]]
echo "PASS: restored private schema and server RPC grants, identity sequence preserved"
# SQL role-level RLS tests on restored DB, using restored synthetic subject IDs.
# H4 elsewhere uses real Auth + PostgREST; this does not claim restored HTTP-service verification.
mapfile -t u < <(node -e 'for(const id of require(process.argv[1])) {if(!/^[0-9a-f-]{36}$/.test(id))process.exit(1);console.log(id)}' "$RUNNER_TEMP/h5-full-users.json")
[[ "${#u[@]}" == 2 ]]
for table in app_settings goals transactions annual_checklists monthly_snapshots; do
 for i in 0 1; do
  own=${u[$i]}; other=${u[$((1-i))]}
  actual=$(dp -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$own',true); select count(*) from public.$table where user_id='$own'; select count(*) from public.$table where user_id='$other'; with x as (update public.$table set data='{}' where user_id='$other' returning 1) select count(*) from x; with x as (delete from public.$table where user_id='$other' returning 1) select count(*) from x; rollback;" | grep -E '^[0-9]+$' | paste -sd, -)
  [[ "$actual" == 2,0,0,0 ]] || { echo "FAIL: restored owner/cross-user RLS $table"; exit 1; }
 done
 actual=$(dp -c "begin; set local role anon; select count(*) from public.$table; rollback;" | grep -E '^[0-9]+$')
 [[ "$actual" == 0 ]] || { echo "FAIL: restored anonymous RLS $table"; exit 1; }
 echo "PASS: restored $table own/cross-user/anonymous SQL RLS"
done
# Rehearse cascade in transaction; rollback preserves the restored evidence state.
actual=$(dp -c "begin; delete from auth.users where id='${u[0]}'; select count(*) from public.profiles where id='${u[0]}'; $(for t in app_settings goals transactions annual_checklists monthly_snapshots; do echo "select count(*) from public.$t where user_id='${u[0]}';"; done) rollback;" | grep -E '^[0-9]+$' | paste -sd, -)
[[ "$actual" == 0,0,0,0,0,0 ]]
echo 'PASS: restored FK cascade across all six public tables'
# Non-network Gemini SQL behavior: compare restored quota/cache then rollback all probes.
actual=$(dp -c "begin; set local role service_role; select public.gemini_explain_status('${u[0]}')->>'remaining'; select public.gemini_flash_claim()->>'remaining'; select public.gemini_flash_claim()->>'remaining'; select public.gemini_flash_claim()->>'allowed'; select public.gemini_reply_cache_get('${u[0]}',repeat('a',64))->>'hit'; rollback;" | grep -E '^[0-9]+$|^(true|false)
node --input-type=module -e 'import fs from "node:fs"; const p="h5-full-recovery-evidence.json"; fs.writeFileSync(p,JSON.stringify({result:"PASS",target:"disposable-local-cluster-network-none",sourceCommit:process.env.SOURCE_COMMIT,workflowRunId:process.env.GITHUB_RUN_ID,mechanism:"pg_dumpall globals + full pg_dump custom + fresh initdb + pg_restore",catalogMatch:true,fixtureUsers:2,syncRows:20,profiles:2,restoredSqlRls:"PASS",cascade:"PASS",privateTables:8,privateRpcGrants:"PASS",syntheticGeminiRpc:"PASS",restoredHttpAuth:"PASS",scope:"001/002 local baseline plus sanitized private operational fixture; separate HTTP recovery of Auth identities and all public app rows; excludes Guardian dispatch, hosted-only drift, Storage objects, hosted service configuration and production credentials",engine:JSON.parse(fs.readFileSync(process.argv[1],"utf8"))},null,2)+"\n",{mode:0o600});' "$tmp/engine.json"
 | paste -sd, -)
[[ "$actual" == 18,1,0,false,true ]]
echo 'PASS: restored synthetic Gemini quota and cache RPC behavior; no Gemini request'
# Separate recovery onto freshly reset original disposable Supabase stack, using
# Auth identities and all public app data from the same full archive. This is an
# HTTP service recovery test, not a claim that all managed services were restored.
supabase db reset --local --yes >/dev/null
[[ "$(sp -c 'select count(*) from auth.users')" == 0 ]]
docker exec -i "$src" pg_restore -U supabase_admin -d postgres --exit-on-error --single-transaction --data-only --disable-triggers --schema=auth --schema=public --table=users --table=identities --table=profiles --table=app_settings --table=goals --table=transactions --table=annual_checklists --table=monthly_snapshots < "$tmp/database.dump" > "$tmp/http-restore.log" 2>&1 || { echo 'FAIL: service recovery data restore (private log withheld)'; exit 1; }
for table in auth.users auth.identities public.profiles public.app_settings public.goals public.transactions public.annual_checklists public.monthly_snapshots; do
  sql="select count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E'\\\\n' order by to_jsonb(t)::text),'')) from $table t"
  [[ "$(sp -c "$sql")" == "$(dp -c "$sql")" ]] || { echo "FAIL: service recovery row mismatch $table"; exit 1; }
done
node scripts/h5-restored-http.mjs

node --input-type=module -e 'import fs from "node:fs"; const p="h5-full-recovery-evidence.json"; fs.writeFileSync(p,JSON.stringify({result:"PASS",target:"disposable-local-cluster-network-none",sourceCommit:process.env.SOURCE_COMMIT,workflowRunId:process.env.GITHUB_RUN_ID,mechanism:"pg_dumpall globals + full pg_dump custom + fresh initdb + pg_restore",catalogMatch:true,fixtureUsers:2,syncRows:20,profiles:2,restoredSqlRls:"PASS",cascade:"PASS",scope:"checked-in 001/002 local baseline; no hosted-only operational objects, Storage objects, external services, production credentials or restored HTTP Auth test",engine:JSON.parse(fs.readFileSync(process.argv[1],"utf8"))},null,2)+"\n",{mode:0o600});' "$tmp/engine.json"
