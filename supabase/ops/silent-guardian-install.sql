-- VWCE Vault Silent Guardian: isolated server-only daily monitor.
-- Apply ONLY to the confirmed production Supabase project; no financial-table DDL/DML.
-- Operational installation script, intentionally outside supabase/migrations/001..002
-- used for H4/H5 disposable schema reproduction.
create extension if not exists pg_cron;
create extension if not exists pg_net;

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

-- Bind to the ONE user with live transactions. Fail closed for zero/ambiguous owners.
insert into guardian_internal.config(singleton,owner_user_id)
select true, (select user_id from public.transactions where deleted_at is null group by user_id limit 1)
where (select count(*) from (select user_id from public.transactions where deleted_at is null group by user_id) u) = 1
on conflict(singleton) do nothing;

create or replace function guardian_internal.enqueue(p_kind text default 'scheduled')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_secret text;
  v_hash text;
  v_id bigint;
  v_conf guardian_internal.config%rowtype;
begin
  if p_kind not in ('scheduled','selftest') then
    raise exception 'invalid kind';
  end if;
  select * into v_conf from guardian_internal.config where singleton = true;
  if not found then return jsonb_build_object('queued',false,'reason','owner_ambiguous'); end if;
  if p_kind = 'scheduled' and not v_conf.monitoring_enabled then
    return jsonb_build_object('queued',false,'reason','monitoring_disabled');
  end if;
  -- 256-bit one-use bearer; store only the digest.
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_secret,'sha256'), 'hex');
  insert into guardian_internal.tickets(token_hash,kind)
    values(v_hash,p_kind)
    on conflict(kind,day_utc) do nothing;
  if not found then return jsonb_build_object('queued',false,'reason','already_queued_today'); end if;

  select net.http_post(
    url := 'https://gylultvdyakhgjtyatbz.supabase.co/functions/v1/silent-guardian-worker',
    body := jsonb_build_object('token',v_secret),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 15000
  ) into v_id;
  update guardian_internal.tickets set request_id = v_id where token_hash = v_hash;
  return jsonb_build_object('queued',true,'request_id',v_id);
end;
$fn$;
revoke all on function guardian_internal.enqueue(text) from public, anon, authenticated;
grant execute on function guardian_internal.enqueue(text) to postgres;

-- Only the Edge Function's server-side service_role may invoke either public RPC.
-- These restricted RPC wrappers are intentionally placed in an exposed schema.
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
