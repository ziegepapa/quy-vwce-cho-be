-- MU2 candidate, local rehearsal only. Depends on guarded H5 003.
-- Deliberately NOT an active migration; hosted history reconciliation is separate.
begin;
do $guard$
begin
  if not exists (select 1 from pg_roles where rolname='h5_disposable_003_marker' and not rolcanlogin)
    or not exists (select 1 from pg_roles where rolname='mu2_disposable_marker' and not rolcanlogin)
    or (select count(*) from supabase_migrations.schema_migrations where version in ('001','002','003')) <> 3
    or not exists (select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'MU2 refuses non-rehearsal execution';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relrowsecurity and c.relforcerowsecurity
    and c.relname in ('profiles','app_settings','goals','transactions','annual_checklists','monthly_snapshots')) <> 6
    or (select count(*) from pg_policies where schemaname='public'
    and tablename in ('profiles','app_settings','goals','transactions','annual_checklists','monthly_snapshots')) <> 23 then
    raise exception 'MU2 requires exact H5 baseline';
  end if;
end $guard$;

create schema mu2_private;
revoke all on schema mu2_private from public, anon, authenticated, service_role;
grant usage on schema mu2_private to authenticated;

create table public.vault_memberships (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','member')),
  status text not null default 'invited' check (status in ('invited','pending','active','revoked')),
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  primary key (owner_user_id,member_user_id),
  check (owner_user_id <> member_user_id),
  check (status <> 'active' or (activated_at is not null and revoked_at is null)),
  check ((status = 'revoked') = (revoked_at is not null))
);
create index vault_memberships_member_active_idx on public.vault_memberships(member_user_id,owner_user_id) where status='active';
alter table public.vault_memberships enable row level security;
alter table public.vault_memberships force row level security;
revoke all on table public.vault_memberships from public, anon, authenticated, service_role;
grant select on public.vault_memberships to authenticated;
grant update(role,status) on public.vault_memberships to authenticated;
grant select,insert,update on public.vault_memberships to service_role;

-- Narrow, non-exposed definer predicate avoids recursive membership RLS.
-- No arbitrary principal argument, no row output, no writes, fixed search path.
create function mu2_private.is_active_admin(p_owner uuid)
returns boolean language sql stable security definer set search_path = ''
as $fn$
  select auth.uid() is not null and exists (
    select 1 from public.vault_memberships m
    where m.owner_user_id=p_owner and m.member_user_id=auth.uid()
      and m.status='active' and m.role='admin'
  )
$fn$;
revoke all on function mu2_private.is_active_admin(uuid) from public, anon, authenticated, service_role;
grant execute on function mu2_private.is_active_admin(uuid) to authenticated;

create policy mu2_membership_select on public.vault_memberships for select to authenticated
using (owner_user_id=(select auth.uid()) or member_user_id=(select auth.uid())
  or mu2_private.is_active_admin(owner_user_id));

-- Owner or active ADMIN may change/revoke another active non-owner membership.
-- Invitations and activation stay trusted-service-only; no authenticated INSERT.
create policy mu2_membership_manage on public.vault_memberships for update to authenticated
using (status in ('invited','pending','active') and
  (owner_user_id=(select auth.uid()) or
   (member_user_id<>(select auth.uid()) and mu2_private.is_active_admin(owner_user_id))))
with check (status in ('invited','pending','active','revoked') and
  (owner_user_id=(select auth.uid()) or
   (member_user_id<>(select auth.uid()) and mu2_private.is_active_admin(owner_user_id))));

create function mu2_private.membership_transition()
returns trigger language plpgsql security invoker set search_path = ''
as $fn$
begin
  if new.owner_user_id is distinct from old.owner_user_id
    or new.member_user_id is distinct from old.member_user_id then
    raise exception 'membership identity is immutable' using errcode='42501';
  end if;
  if current_user='authenticated' and new.status is distinct from old.status and new.status <> 'revoked' then
    raise exception 'membership activation is trusted-service-only' using errcode='42501';
  end if;
  if new.status='revoked' and old.status<>'revoked' then new.revoked_at:=now(); end if;
  return new;
end
$fn$;
revoke all on function mu2_private.membership_transition() from public, anon, authenticated, service_role;
create trigger mu2_membership_transition before update on public.vault_memberships
for each row execute function mu2_private.membership_transition();

-- Keep legacy owner policies and ACLs untouched. Add operation-specific sharing
-- only to vault entity rows; profiles and internal Gemini/Guardian remain private.
-- UPDATE must never move a row between vaults, even for two authorized admins.
create function mu2_private.prevent_owner_change()
returns trigger language plpgsql security invoker set search_path = ''
as $fn$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'vault owner is immutable' using errcode='42501';
  end if;
  return new;
end
$fn$;
revoke all on function mu2_private.prevent_owner_change() from public, anon, authenticated, service_role;

do $mu2$
declare t text; reader text; writer text;
begin
  for t in select unnest(array['app_settings','goals','transactions','annual_checklists','monthly_snapshots'])
  loop
    reader := format('exists (select 1 from public.vault_memberships m where m.owner_user_id=%I.user_id and m.member_user_id=(select auth.uid()) and m.status=''active'')',t);
    writer := format('mu2_private.is_active_admin(%I.user_id)',t);
    execute format('create policy mu2_shared_select on public.%I for select to authenticated using (%s)',t,reader);
    execute format('create policy mu2_admin_insert on public.%I for insert to authenticated with check (%s)',t,writer);
    execute format('create policy mu2_admin_update on public.%I for update to authenticated using (%s) with check (%s)',t,writer,writer);
    execute format('create policy mu2_admin_delete on public.%I for delete to authenticated using (%s)',t,writer);
    execute format('create trigger mu2_immutable_owner before update on public.%I for each row execute function mu2_private.prevent_owner_change()',t);
  end loop;
end $mu2$;
commit;
notify pgrst, 'reload schema';
