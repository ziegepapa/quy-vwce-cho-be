-- Local rollback rehearsal, preserves financial rows and membership audit metadata.
begin;
do $guard$
begin
  if not exists(select 1 from pg_roles where rolname='mu2_disposable_marker' and not rolcanlogin)
    or not exists(select 1 from pg_roles where rolname='h5_disposable_003_marker' and not rolcanlogin) then
    raise exception 'MU2 rollback refuses non-rehearsal execution';
  end if;
end $guard$;
-- Remove all shared access atomically, then freeze the membership register.
do $rollback$
declare t text;
begin
  for t in select unnest(array['app_settings','goals','transactions','annual_checklists','monthly_snapshots'])
  loop
    execute format('drop policy mu2_shared_select on public.%I',t);
    execute format('drop policy mu2_admin_insert on public.%I',t);
    execute format('drop policy mu2_admin_update on public.%I',t);
    execute format('drop policy mu2_admin_delete on public.%I',t);
    execute format('drop trigger mu2_immutable_owner on public.%I',t);
  end loop;
end $rollback$;
update public.vault_memberships set status='revoked' where status<>'revoked';
drop policy mu2_membership_select on public.vault_memberships;
drop policy mu2_membership_manage on public.vault_memberships;
revoke all on public.vault_memberships from public, anon, authenticated, service_role;
revoke update(role,status) on public.vault_memberships from authenticated;
revoke execute on function mu2_private.is_active_admin(uuid) from authenticated;
revoke usage on schema mu2_private from authenticated;
commit;
