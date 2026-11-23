-- 003_guardian.sql
-- Depends-On: 002_soft_delete_and_triggers.sql
-- A separate, opt-in server-side notification registry. It cannot change the
-- financial ledger and does not change the existing Dexie/backup/sync schemas.
-- IMPORTANT: Do not apply to hosted production before H4/H5 reconciliation
-- and explicit owner approval. No cron job is installed by this migration.

create table if not exists public.guardian_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.guardian_subscriptions enable row level security;
drop policy if exists guardian_own_select on public.guardian_subscriptions;
create policy guardian_own_select on public.guardian_subscriptions
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists guardian_own_insert on public.guardian_subscriptions;
create policy guardian_own_insert on public.guardian_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists guardian_own_update on public.guardian_subscriptions;
create policy guardian_own_update on public.guardian_subscriptions
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.guardian_stamp_enrollment()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.enrolled_at := now();
  elsif new.enabled and not old.enabled then
    new.enrolled_at := now();
  else
    new.enrolled_at := old.enrolled_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists guardian_stamp on public.guardian_subscriptions;
create trigger guardian_stamp before insert or update on public.guardian_subscriptions
  for each row execute function public.guardian_stamp_enrollment();

-- No authenticated user can inspect or manufacture server alert receipts.
create table if not exists public.guardian_alert_deliveries (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_key text not null check (length(event_key) between 3 and 256),
  kind text not null check (kind in ('recorded_sale', 'possible_duplicate_import')),
  status text not null default 'reserved'
    check (status in ('reserved', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  attempted_at timestamptz,
  primary key (user_id, event_key)
);
alter table public.guardian_alert_deliveries enable row level security;
revoke all on public.guardian_alert_deliveries from anon, authenticated;
grant select, insert, update on public.guardian_alert_deliveries to service_role;
-- Service-role calls bypass RLS; no client-side insert/update/delete policy.

-- Subscription is user-owned, while the receipt table remains server-only.
grant select, insert, update on public.guardian_subscriptions to authenticated;
-- As of newer Supabase defaults, new tables do not automatically receive
-- Data API privileges. Service role bypasses RLS but STILL needs SQL GRANTs.
grant select on public.guardian_subscriptions to service_role;

-- Fail-closed operational readiness gate. Never activated by a migration,
-- merge, settings toggle, test, or a frontend request. A privileged operator
-- can mark active ONLY after the Edge secret, email domain and Cron have
-- passed an independent staging/production activation check.
create table if not exists public.guardian_service_status (
  id boolean primary key default true check (id),
  active boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.guardian_service_status enable row level security;
insert into public.guardian_service_status (id, active)
  values (true, false) on conflict (id) do nothing;
revoke all on public.guardian_service_status from anon, authenticated;
grant select on public.guardian_service_status to authenticated;
grant select on public.guardian_service_status to service_role;
drop policy if exists guardian_read_service_status on public.guardian_service_status;
create policy guardian_read_service_status on public.guardian_service_status
  for select to authenticated using (id = true);

-- Server-only operational heartbeat. This is not a ledger or browser API.
-- Every scheduled run reports an attempt, outcome and last completed success.
-- Do not infer successful monitoring merely from an HTTP response.
create table if not exists public.guardian_run_health (
  id boolean primary key default true check (id),
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_outcome text not null default 'never'
    check (last_outcome in ('never','running','success','degraded','disabled','failed')),
  last_error_code text
    check (last_error_code in ('config','cloud_read','cloud_write','provider','partial','unexpected')),
  failure_streak integer not null default 0 check (failure_streak >= 0),
  last_duration_ms integer check (last_duration_ms between 0 and 300000),
  updated_at timestamptz not null default now()
);
alter table public.guardian_run_health enable row level security;
insert into public.guardian_run_health(id) values(true) on conflict(id) do nothing;
revoke all on public.guardian_run_health from public, anon, authenticated;
grant select, update on public.guardian_run_health to service_role;
-- V1 only reads the already-existing transaction ledger; it never modifies it.
grant select on public.transactions to service_role;
-- service_role bypasses RLS, and clients have neither grants nor policies.
