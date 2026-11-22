-- MANUAL ONLY: install on the specifically approved Supabase project after owner consent.
-- No cron, no triggers and NO financial, auth, Guardian or Resend table changes.
-- Only Edge Functions with the service-role key may invoke these two RPC functions.
begin;
create schema if not exists ai_internal;
revoke all on schema ai_internal from public, anon, authenticated;
create table if not exists ai_internal.user_daily (
  user_id uuid not null,
  day_utc date not null,
  attempts smallint not null default 0 check (attempts between 0 and 10),
  created_at timestamptz not null default now(),
  primary key (user_id, day_utc)
);
create table if not exists ai_internal.global_daily (
  day_utc date primary key,
  attempts smallint not null default 0 check (attempts between 0 and 40),
  pause_until timestamptz
);
alter table ai_internal.user_daily enable row level security;
alter table ai_internal.global_daily enable row level security;
revoke all on all tables in schema ai_internal from public, anon, authenticated;
revoke all on all sequences in schema ai_internal from public, anon, authenticated;

-- A single transaction/advisory lock makes the per-user 10/day and global 40/day
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
  if coalesce(v_user,0)>=10 then
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
  return jsonb_build_object('allowed',true,'remaining',9-coalesce(v_user,0));
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
    'remaining',greatest(0,10-coalesce((
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
commit;

-- Safe inspection after manual install:
-- select routine_name from information_schema.routines
-- where routine_schema='public' and routine_name like 'gemini_explain_%';
-- select * from information_schema.role_routine_grants
-- where routine_name like 'gemini_explain_%';
-- No owner user IDs, account numbers, quotes or portfolio records are stored here.
