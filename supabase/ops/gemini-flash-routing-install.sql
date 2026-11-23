-- MANUAL ONLY: separate owner approval required. Never run from CI or a PR.
-- Adds only Gemini server-side budget/cache objects; no financial/auth/Guardian/Resend changes.
begin;
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
commit;

-- Manual verification only (read-only):
-- select conname,pg_get_constraintdef(oid) from pg_constraint
--   where conrelid='ai_internal.gemini_flash_daily'::regclass;
-- select pg_get_functiondef(oid) from pg_proc
--   where proname in ('gemini_flash_claim','gemini_reply_cache_get','gemini_reply_cache_put');
-- SELECT is intentionally unavailable to anon/authenticated; use operator-only views.
