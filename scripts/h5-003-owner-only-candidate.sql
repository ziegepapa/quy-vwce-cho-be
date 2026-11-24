-- Candidate 003_owner_only_least_privilege.sql (materialized by CI locally only)
-- Depends-On: 002_soft_delete_and_triggers.sql
-- No hosted application until separately approved migration-history reconciliation.
begin;
do $guard$ begin
  if not exists(select 1 from pg_roles where rolname='h5_disposable_003_marker' and not rolcanlogin) then
    raise exception 'H5 003 refuses non-rehearsal execution';
  end if;
end $guard$;
do $h5$
declare t text; old_name text;
begin
  for t,old_name in select * from (values
    ('app_settings','settings_all_own'),('goals','goals_all_own'),
    ('transactions','tx_all_own'),('annual_checklists','checklist_all_own'),
    ('monthly_snapshots','snap_all_own')) as v(t,n)
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('alter table public.%I alter column user_id set default auth.uid()',t);
    execute format('drop policy if exists %I on public.%I',old_name,t);
    execute format('create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)',t||'_select_own',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)',t||'_insert_own',t);
    execute format('create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',t||'_update_own',t);
    execute format('create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)',t||'_delete_own',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant select,insert,update,delete on table public.%I to authenticated',t);
  end loop;
end $h5$;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
drop policy profiles_select_own on public.profiles;
drop policy profiles_insert_own on public.profiles;
drop policy profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
revoke all on table public.profiles from public, anon, authenticated;
grant select,insert,update on table public.profiles to authenticated;
-- Preserve trigger owner and body; it uses public.profiles explicitly.
alter function public.handle_new_user() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.bump_version_and_updated_at() from public, anon, authenticated;
commit;
