-- ONE-TIME E2E EXERCISE. All records are synthetic and isolated.
-- No references to public financial tables; no changes to production Guardian config.
-- Clean up with docs/SILENT_GUARDIAN_E2E.md after verification.
create schema if not exists guardian_e2e;
revoke all on schema guardian_e2e from public, anon, authenticated;

create table guardian_e2e.fixture_transactions (
  id text primary key, data jsonb not null, deleted_at timestamptz
);
create table guardian_e2e.fixture_goals (
  id text primary key, data jsonb not null, deleted_at timestamptz
);
create table guardian_e2e.fixture_settings (
  id text primary key, data jsonb not null, deleted_at timestamptz
);
create table guardian_e2e.state (
  singleton boolean primary key default true check (singleton),
  bad_streak integer not null default 0,
  last_scan_status text,
  last_scan_at timestamptz
);
insert into guardian_e2e.state(singleton) values(true);
insert into guardian_e2e.fixture_transactions(id,data) values
('synthetic-bad-1', '{"id":"synthetic-bad-1","type":"buy_vwce","date":"2026-11-21","amount":"invalid"}');
insert into guardian_e2e.fixture_transactions(id,data,deleted_at) values
('synthetic-old-tombstone','{"id":"synthetic-old-tombstone","type":"bad","amount":"bad","date":"bad"}', now());
insert into guardian_e2e.fixture_goals(id,data) values
('synthetic-goal-1','{"id":"synthetic-goal-1","amount":10000}');
insert into guardian_e2e.fixture_settings(id,data) values
('synthetic-settings-1','{"id":"synthetic-settings-1"}');

create table guardian_e2e.tickets (
  token_hash text primary key,
  expires_at timestamptz not null default now()+interval '5 minutes',
  claimed_at timestamptz,
  request_id bigint
);
create table guardian_e2e.scans (
  scan_id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  status text not null,
  bad_streak integer not null,
  issues integer not null,
  live_transactions integer not null,
  tombstones integer not null,
  decision text not null
);
create table guardian_e2e.deliveries (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  provider_id text
);
revoke all on all tables in schema guardian_e2e from public, anon, authenticated;
revoke all on all sequences in schema guardian_e2e from public, anon, authenticated;

-- Operator-only entry point: maximum FOUR exercises, never from a PWA.
create function guardian_e2e.enqueue()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_token text; v_digest text; v_request bigint; v_total integer;
begin
  select count(*) into v_total from guardian_e2e.tickets;
  if v_total >= 4 then
    return jsonb_build_object('queued',false,'reason','exercise_limit_reached');
  end if;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  v_digest := encode(extensions.digest(v_token,'sha256'),'hex');
  insert into guardian_e2e.tickets(token_hash) values(v_digest);
  select net.http_post(
    url := 'https://gylultvdyakhgjtyatbz.supabase.co/functions/v1/silent-guardian-e2e-test',
    body := jsonb_build_object('token',v_token),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 15000
  ) into v_request;
  update guardian_e2e.tickets set request_id=v_request where token_hash=v_digest;
  return jsonb_build_object('queued',true,'request_id',v_request);
end;
$fn$;
revoke all on function guardian_e2e.enqueue() from public, anon, authenticated;

-- Service-role-only RPC. Reads exclusively guardian_e2e synthetic fixtures.
-- Decision rules intentionally mirror production guardian_worker_claim:
-- first anomaly -> noop; second -> single reserved alert; repeat -> deduplicated;
-- healthy -> reset bad streak.
create function public.guardian_e2e_claim(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_ticket guardian_e2e.tickets%rowtype;
  v_state guardian_e2e.state%rowtype;
  v_live integer; v_deleted integer; v_goal_bad integer; v_setting_bad integer;
  v_issues integer; v_streak integer; v_status text; v_action text;
  v_delivery uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('accepted',false);
  end if;
  select * into v_ticket from guardian_e2e.tickets
   where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
     and claimed_at is null and expires_at>now() for update;
  if not found then return jsonb_build_object('accepted',false); end if;
  update guardian_e2e.tickets set claimed_at=now() where token_hash=v_ticket.token_hash;
  select * into v_state from guardian_e2e.state where singleton for update;

  select count(*) filter(where deleted_at is null),
         count(*) filter(where deleted_at is not null),
         count(*) filter(where deleted_at is null and (
           data->>'id' is distinct from id
           or jsonb_typeof(data->'amount') is distinct from 'number'
           or coalesce(data->>'type','') not in
             ('buy_vwce','sell_vwce','buy_security','sell_security','cash_in','cash_out','tax','fee','safe_interest','adjust')
           or coalesce(data->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         ))
  into v_live,v_deleted,v_issues from guardian_e2e.fixture_transactions;
  select count(*) filter(where deleted_at is null and (
    data->>'id' is distinct from id or jsonb_typeof(data->'amount') is distinct from 'number'
  )) into v_goal_bad from guardian_e2e.fixture_goals;
  select count(*) filter(where deleted_at is null and
    data->>'id' is distinct from id
  ) into v_setting_bad from guardian_e2e.fixture_settings;
  v_issues := v_issues + v_goal_bad + v_setting_bad;
  v_status := case when v_issues>0 then 'review' else 'pass_basic_checks' end;
  v_streak := case when v_status='review' then v_state.bad_streak+1 else 0 end;

  update guardian_e2e.state set bad_streak=v_streak,
    last_scan_status=v_status,last_scan_at=now() where singleton;
  v_action := 'noop';
  if v_status='review' and v_streak >=2 then
    if exists(select 1 from guardian_e2e.deliveries
              where fingerprint='synthetic-structural-issue'
                and status in ('reserved','sent')) then
      v_action := 'deduplicated';
    else
      insert into guardian_e2e.deliveries(fingerprint)
        values('synthetic-structural-issue') returning id into v_delivery;
      v_action := 'send';
    end if;
  end if;

  insert into guardian_e2e.scans(status,bad_streak,issues,live_transactions,tombstones,decision)
    values(v_status,v_streak,v_issues,v_live,v_deleted,v_action);
  if v_action='send' then
    return jsonb_build_object('accepted',true,'action','send','kind','alert',
      'delivery_id',v_delivery,'test_only',true);
  end if;
  return jsonb_build_object('accepted',true,'action','noop','status',v_status,
    'bad_streak',v_streak,'reason',v_action,'test_only',true);
end;
$fn$;

create function public.guardian_e2e_finish(
  p_delivery_id uuid,p_ok boolean,p_provider_id text default null
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare v_changed integer;
begin
  update guardian_e2e.deliveries
    set status=case when p_ok then 'sent' else 'failed' end,
        finished_at=now(),
        provider_id=case when p_ok then left(coalesce(p_provider_id,''),100) else null end
    where id=p_delivery_id and status='reserved';
  get diagnostics v_changed = row_count;
  return v_changed=1;
end;
$fn$;

revoke all on function public.guardian_e2e_claim(text) from public,anon,authenticated;
revoke all on function public.guardian_e2e_finish(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.guardian_e2e_claim(text) to service_role;
grant execute on function public.guardian_e2e_finish(uuid,boolean,text) to service_role;
