-- H5 synthetic-only operational recovery fixture, NOT a migration or hosted installer.
-- Copied/reviewed DDL and non-dispatch RPC definitions from repository blobs:
-- silent-guardian-install.sql 717a9e2c6ff0b50d1c052ac4f33d2b9fdbd88bf0
-- gemini-explain-install.sql 138e50f8eefd768d9259ae9e7defa785bbfe5db1
-- gemini-flash-routing-install.sql c25ba8ce226357b96f5d3c7bfbb0d0a167deeb3f
-- Omitted: Guardian extension install, production owner binding, enqueue/http dispatch, schedules.
-- No external API/provider call; never install in hosted DB.
begin;
do $guard$ begin
  if current_setting('h5.synthetic_recovery',true) is distinct from 'local-only'
    or (select count(*) from auth.users) <> 2
    or exists (select 1 from auth.users where email not like 'h5-full-%@example.invalid' or email is null)
  then raise exception 'H5 synthetic fixture guard refused'; end if;
end $guard$;
create schema if not exists guardian_internal;
revoke all on schema guardian_internal from public, anon, authenticated;
grant usage on schema guardian_internal to postgres;

create table if not exists guardian_internal.config (
  singleton boolean primary key default true check (singleton),
  owner_user_id uuid not null,
  monitoring_enabled boolean not null default false,
  notifications_enabled boolean not null default false,
  bad_streak integer not null default 0 check (bad_streak >= 0),
  last_scan_at timestamptz,
  last_scan_status text,
  last_sent_fingerprint text,
  last_sent_at timestamptz
);

create table if not exists guardian_internal.tickets (
  token_hash text primary key,
  kind text not null check (kind in ('scheduled','selftest')),
  day_utc date not null default (now() at time zone 'utc')::date,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  claimed_at timestamptz,
  request_id bigint,
  unique(kind,day_utc)
);

create table if not exists guardian_internal.scans (
  scan_id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('pass_basic_checks','review','incomplete')),
  bad_streak integer not null,
  live_transactions integer not null,
  tombstones integer not null,
  live_goals integer not null,
  issues integer not null,
  fingerprint text
);

create table if not exists guardian_internal.deliveries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('alert','selftest')),
  fingerprint text not null,
  status text not null default 'reserved' check (status in ('reserved','sent','failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  provider_id text
);

-- Even if schema exposure settings change, these private objects are not client APIs.
revoke all on all tables in schema guardian_internal from public, anon, authenticated;
revoke all on all sequences in schema guardian_internal from public, anon, authenticated;
create or replace function public.guardian_worker_claim(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ticket guardian_internal.tickets%rowtype;
  v_conf guardian_internal.config%rowtype;
  v_tx integer; v_deleted integer; v_goal integer; v_settings integer;
  v_issues integer; v_goal_issues integer; v_setting_issues integer;
  v_status text; v_sig text; v_streak integer;
  v_id uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('accepted',false);
  end if;
  select * into v_ticket from guardian_internal.tickets
    where token_hash = encode(extensions.digest(p_token,'sha256'),'hex')
      and claimed_at is null and expires_at > now()
    for update;
  if not found then return jsonb_build_object('accepted',false); end if;
  update guardian_internal.tickets set claimed_at = now() where token_hash = v_ticket.token_hash;
  select * into v_conf from guardian_internal.config where singleton = true for update;
  if not found then return jsonb_build_object('accepted',false); end if;

  if v_ticket.kind = 'selftest' then
    insert into guardian_internal.deliveries(kind,fingerprint) values ('selftest','selftest-' || v_ticket.day_utc::text)
      returning id into v_id;
    return jsonb_build_object('accepted',true,'action','send','kind','selftest','delivery_id',v_id);
  end if;
  if not v_conf.monitoring_enabled then
    return jsonb_build_object('accepted',true,'action','noop','reason','disabled');
  end if;

  select count(*) filter(where deleted_at is null),
         count(*) filter(where deleted_at is not null),
         count(*) filter(where deleted_at is null and (
           data->>'id' is distinct from id
           or jsonb_typeof(data->'amount') is distinct from 'number'
           or coalesce(data->>'type','') not in
             ('buy_vwce','sell_vwce','buy_security','sell_security','cash_in','cash_out','tax','fee','safe_interest','adjust')
           or coalesce(data->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         ))
  into v_tx,v_deleted,v_issues
  from public.transactions where user_id=v_conf.owner_user_id;

  select count(*) filter(where deleted_at is null),
         count(*) filter(where deleted_at is null and (
           data->>'id' is distinct from id or jsonb_typeof(data->'amount') is distinct from 'number'
         ))
  into v_goal,v_goal_issues
  from public.goals where user_id=v_conf.owner_user_id;
  select count(*) filter(where deleted_at is null),
         count(*) filter(where deleted_at is null and data->>'id' is distinct from id)
  into v_settings,v_setting_issues
  from public.app_settings where user_id=v_conf.owner_user_id;
  v_issues := v_issues + v_goal_issues + v_setting_issues;
  v_status := case
    when v_tx+v_deleted >= 1000 or v_goal >= 1000 or v_settings >= 1000
      then 'incomplete'
    when v_issues > 0 then 'review'
    else 'pass_basic_checks'
  end;
  v_streak := case when v_status = 'review' then v_conf.bad_streak + 1 else 0 end;
  v_sig := case when v_status='review' then 'structural-issue' else null end;

  update guardian_internal.config set
    bad_streak=v_streak,
    last_scan_at=now(),
    last_scan_status=v_status,
    last_sent_fingerprint=case
      when v_status='pass_basic_checks' then null else last_sent_fingerprint end
  where singleton;
  insert into guardian_internal.scans(status,bad_streak,live_transactions,tombstones,live_goals,issues,fingerprint)
  values(v_status,v_streak,v_tx,v_deleted,v_goal,v_issues,v_sig);

  -- No notification for first anomaly, incomplete scans or healthy/empty ledgers.
  if v_status <> 'review' or v_streak < 2 or not v_conf.notifications_enabled then
    return jsonb_build_object('accepted',true,'action','noop','status',v_status,'bad_streak',v_streak);
  end if;

  -- Persistent dedupe, max one sent email per 24 hours, no repeat of same incident
  -- within 7 days. A crashed reserved send is held 7 days to avoid duplicates.
  if (v_conf.last_sent_at is not null and v_conf.last_sent_at > now()-interval '24 hours')
     or exists (select 1 from guardian_internal.deliveries
                where kind='alert' and fingerprint=v_sig
                  and created_at > now()-interval '7 days'
                  and status in ('reserved','sent')) then
    return jsonb_build_object('accepted',true,'action','noop','reason','deduplicated');
  end if;
  insert into guardian_internal.deliveries(kind,fingerprint)
    values('alert',v_sig) returning id into v_id;
  return jsonb_build_object('accepted',true,'action','send','kind','alert','delivery_id',v_id);
end;
$fn$;

create or replace function public.guardian_worker_finish(p_delivery_id uuid,p_ok boolean,p_provider_id text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_delivery guardian_internal.deliveries%rowtype;
begin
  update guardian_internal.deliveries
    set status=case when p_ok then 'sent' else 'failed' end,
        finished_at=now(),
        provider_id=case when p_ok then left(coalesce(p_provider_id,''),100) else null end
    where id=p_delivery_id and status='reserved'
    returning * into v_delivery;
  if not found then return false; end if;
  if p_ok and v_delivery.kind='alert' then
    update guardian_internal.config set last_sent_fingerprint=v_delivery.fingerprint,
      last_sent_at=now() where singleton;
  end if;
  return true;
end;
$fn$;
revoke all on function public.guardian_worker_claim(text) from public, anon, authenticated;
revoke all on function public.guardian_worker_finish(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.guardian_worker_claim(text) to service_role;
grant execute on function public.guardian_worker_finish(uuid,boolean,text) to service_role;
create schema if not exists ai_internal;
revoke all on schema ai_internal from public, anon, authenticated;
create table if not exists ai_internal.user_daily (
  user_id uuid not null,
  day_utc date not null,
  attempts smallint not null default 0 check (attempts between 0 and 20),
  created_at timestamptz not null default now(),
  primary key (user_id, day_utc)
);
create table if not exists ai_internal.global_daily (
  day_utc date primary key,
  attempts smallint not null default 0 check (attempts between 0 and 40),
  pause_until timestamptz
);
-- Re-running this manual installer upgrades prior user_daily CHECK(<=10) safely.
alter table ai_internal.user_daily drop constraint if exists user_daily_attempts_check;
alter table ai_internal.user_daily add constraint user_daily_attempts_check check (attempts between 0 and 20);
alter table ai_internal.user_daily enable row level security;
alter table ai_internal.global_daily enable row level security;
revoke all on all tables in schema ai_internal from public, anon, authenticated;
revoke all on all sequences in schema ai_internal from public, anon, authenticated;

-- A single transaction/advisory lock makes the per-user 20/day and global 40/day
-- quota exact even under concurrent Edge Function requests. UTC reset is displayed
-- explicitly in the UI; Google's independent free-tier reset may differ.
create or replace function public.gemini_explain_claim(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_global integer;
  v_user integer;
  v_pause timestamptz;
begin
  if p_user_id is null then
    return jsonb_build_object('allowed',false,'reason','invalid_user');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(911022, 113);
  select attempts,pause_until into v_global,v_pause
    from ai_internal.global_daily where day_utc=v_day;
  if v_pause is not null and v_pause>now() then
    return jsonb_build_object('allowed',false,'reason','provider_limited');
  end if;
  if coalesce(v_global,0)>=40 then
    return jsonb_build_object('allowed',false,'reason','global_limit');
  end if;
  select attempts into v_user from ai_internal.user_daily
    where user_id=p_user_id and day_utc=v_day;
  if coalesce(v_user,0)>=20 then
    return jsonb_build_object('allowed',false,'reason','user_limit','remaining',0);
  end if;
  insert into ai_internal.user_daily(user_id,day_utc,attempts)
    values(p_user_id,v_day,1)
    on conflict (user_id,day_utc) do update
    set attempts=ai_internal.user_daily.attempts+1;
  insert into ai_internal.global_daily(day_utc,attempts)
    values(v_day,1)
    on conflict(day_utc) do update
    set attempts=ai_internal.global_daily.attempts+1;
  -- Opportunistic cleanup, never scheduled and never touches the investment ledger.
  delete from ai_internal.user_daily where day_utc < v_day-45;
  delete from ai_internal.global_daily where day_utc < v_day-45;
  return jsonb_build_object('allowed',true,'remaining',19-coalesce(v_user,0));
end
$body$;

-- Read-only check for the on-demand UI readiness button. This does not spend quota.
create or replace function public.gemini_explain_status(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $body$
  select jsonb_build_object(
    'ready',p_user_id is not null,
    'remaining',greatest(0,20-coalesce((
      select attempts from ai_internal.user_daily
      where user_id=p_user_id and day_utc=(now() at time zone 'UTC')::date
    ),0)),
    'providerPaused',coalesce((
      select pause_until>now() from ai_internal.global_daily
      where day_utc=(now() at time zone 'UTC')::date
    ),false)
  )
$body$;

-- Called ONLY after Google returned 429. Avoid retry storms until UTC midnight.
create or replace function public.gemini_explain_pause()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_day date := (now() at time zone 'UTC')::date;
begin
  perform pg_catalog.pg_advisory_xact_lock(911022,113);
  insert into ai_internal.global_daily(day_utc,attempts,pause_until)
    values(v_day,0,(v_day+1)::timestamp at time zone 'UTC')
    on conflict(day_utc) do update set pause_until=excluded.pause_until;
  return jsonb_build_object('paused',true);
end
$body$;

revoke all on function public.gemini_explain_claim(uuid) from public, anon, authenticated;
revoke all on function public.gemini_explain_status(uuid) from public, anon, authenticated;
revoke all on function public.gemini_explain_pause() from public, anon, authenticated;
grant execute on function public.gemini_explain_claim(uuid) to service_role;
grant execute on function public.gemini_explain_status(uuid) to service_role;
grant execute on function public.gemini_explain_pause() to service_role;
create schema if not exists ai_internal;
revoke all on schema ai_internal from public, anon, authenticated;

-- Reserve before EVERY Flash generateContent attempt, including Google errors.
-- GET model metadata must never claim this budget.
create table if not exists ai_internal.gemini_flash_daily (
  day_utc date primary key,
  attempts smallint not null default 0 check (attempts between 0 and 5)
);
alter table ai_internal.gemini_flash_daily enable row level security;
revoke all on table ai_internal.gemini_flash_daily from public, anon, authenticated;

-- Cache only a validated, short AI explanation and provider model.
-- The hash is SHA-256(topic, locale, facts, queryYear); user ID is a separate private partition.
create table if not exists ai_internal.gemini_reply_cache (
  user_id uuid not null,
  cache_key text not null check (cache_key ~ '^[0-9a-f]{64}$'),
  explanation text not null check (length(explanation) between 1 and 800),
  model text not null check (model in ('gemini-3.5-flash-lite','gemini-3.8-flash')),
  expires_at timestamptz not null,
  primary key (user_id, cache_key)
);
alter table ai_internal.gemini_reply_cache enable row level security;
revoke all on table ai_internal.gemini_reply_cache from public, anon, authenticated;

create or replace function public.gemini_flash_claim()
returns jsonb language plpgsql security definer set search_path = ''
as $body$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_used integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(911022,114);
  select attempts into v_used from ai_internal.gemini_flash_daily where day_utc=v_day;
  if coalesce(v_used,0) >= 5 then
    return jsonb_build_object('allowed',false,'remaining',0);
  end if;
  insert into ai_internal.gemini_flash_daily(day_utc,attempts) values(v_day,1)
    on conflict(day_utc) do update
    set attempts=ai_internal.gemini_flash_daily.attempts+1;
  -- Opportunistic cleanup: no cron, trigger, or background work.
  delete from ai_internal.gemini_flash_daily where day_utc<v_day-45;
  return jsonb_build_object('allowed',true,'remaining',4-coalesce(v_used,0));
end
$body$;

create or replace function public.gemini_reply_cache_get(p_user_id uuid,p_cache_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $body$
declare
  v_answer text;
  v_model text;
begin
  if p_user_id is null or p_cache_key is null or p_cache_key !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('hit',false);
  end if;
  select explanation,model into v_answer,v_model
    from ai_internal.gemini_reply_cache
    where user_id=p_user_id and cache_key=p_cache_key and expires_at>now();
  if not found then return jsonb_build_object('hit',false); end if;
  return jsonb_build_object('hit',true,'explanation',v_answer,'model',v_model);
end
$body$;

create or replace function public.gemini_reply_cache_put(
  p_user_id uuid,p_cache_key text,p_explanation text,p_model text
)
returns jsonb language plpgsql security definer set search_path = ''
as $body$
begin
  if p_user_id is null or p_cache_key is null or p_cache_key !~ '^[0-9a-f]{64}$'
    or p_explanation is null or length(p_explanation) not between 1 and 800
    or p_model not in ('gemini-3.5-flash-lite','gemini-3.8-flash') then
    return jsonb_build_object('stored',false);
  end if;
  insert into ai_internal.gemini_reply_cache(user_id,cache_key,explanation,model,expires_at)
  values(p_user_id,p_cache_key,p_explanation,p_model,now()+interval '24 hours')
  on conflict(user_id,cache_key) do update set
    explanation=excluded.explanation,model=excluded.model,expires_at=excluded.expires_at;
  -- Cache expiry cleanup is opportunistic only; never scheduled.
  delete from ai_internal.gemini_reply_cache where expires_at<=now();
  return jsonb_build_object('stored',true);
end
$body$;

revoke all on function public.gemini_flash_claim() from public, anon, authenticated;
revoke all on function public.gemini_reply_cache_get(uuid,text) from public, anon, authenticated;
revoke all on function public.gemini_reply_cache_put(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.gemini_flash_claim() to service_role;
grant execute on function public.gemini_reply_cache_get(uuid,text) to service_role;
grant execute on function public.gemini_reply_cache_put(uuid,text,text,text) to service_role;
-- All rows are invented; no real provider tokens or explanations.
insert into ai_internal.user_daily(user_id,day_utc,attempts)
 select id,(now() at time zone 'UTC')::date,2 from auth.users;
insert into ai_internal.global_daily(day_utc,attempts) values((now() at time zone 'UTC')::date,4);
insert into ai_internal.gemini_flash_daily(day_utc,attempts) values((now() at time zone 'UTC')::date,3);
insert into ai_internal.gemini_reply_cache(user_id,cache_key,explanation,model,expires_at)
 select id,repeat('a',64),'synthetic recovery marker','gemini-3.5-flash-lite',now()+interval '24 hours' from auth.users;
insert into guardian_internal.config(owner_user_id) select id from auth.users order by id limit 1;
insert into guardian_internal.tickets(token_hash,kind) values(repeat('b',64),'selftest');
insert into guardian_internal.scans(status,bad_streak,live_transactions,tombstones,live_goals,issues)
 values('pass_basic_checks',0,1,1,1,0);
insert into guardian_internal.deliveries(kind,fingerprint,status) values('selftest','synthetic-recovery','sent');
commit;
