-- One-time manual quota upgrade on the existing production Supabase project.
-- Does not touch financial tables, user identities, provider keys or Google billing.
-- Transactional and non-destructive: existing UTC-day attempts are retained.
begin;
alter table ai_internal.user_daily drop constraint if exists user_daily_attempts_check;
alter table ai_internal.user_daily add constraint user_daily_attempts_check
  check (attempts between 0 and 20);

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


-- Functions remain service-role-only; no additional browser access.
revoke all on function public.gemini_explain_claim(uuid) from public, anon, authenticated;
revoke all on function public.gemini_explain_status(uuid) from public, anon, authenticated;
grant execute on function public.gemini_explain_claim(uuid) to service_role;
grant execute on function public.gemini_explain_status(uuid) to service_role;
commit;
