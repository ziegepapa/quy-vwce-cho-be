-- Local assertion only, no data or permission changes.
begin;
do $check$
declare t text; r text; p text; rel regclass;
begin
  if not exists(select 1 from pg_class where oid='public.vault_memberships'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'MU2 membership FORCE RLS missing'; end if;
  if (select count(*) from pg_policy where polrelid='public.vault_memberships'::regclass) <> 2 then raise exception 'MU2 membership policy count'; end if;
  foreach r in array array['anon','authenticated'] loop
    foreach p in array array['INSERT','DELETE','TRUNCATE','REFERENCES','TRIGGER','UPDATE'] loop
      if has_table_privilege(r,'public.vault_memberships',p) then raise exception 'MU2 broad membership grant: % %',r,p; end if;
    end loop;
    if has_column_privilege(r,'public.vault_memberships','owner_user_id','UPDATE') or has_column_privilege(r,'public.vault_memberships','member_user_id','UPDATE') or has_column_privilege(r,'public.vault_memberships','activated_at','UPDATE') then raise exception 'MU2 immutable membership columns grant'; end if;
  end loop;
  if has_table_privilege('anon','public.vault_memberships','SELECT') or not has_table_privilege('authenticated','public.vault_memberships','SELECT') or not has_column_privilege('authenticated','public.vault_memberships','role','UPDATE') or not has_column_privilege('authenticated','public.vault_memberships','status','UPDATE') then raise exception 'MU2 membership grants mismatch'; end if;
  if has_schema_privilege('anon','mu2_private','USAGE') or has_schema_privilege('authenticated','mu2_private','CREATE') or has_function_privilege('anon','mu2_private.is_active_admin(uuid)','EXECUTE') or not has_function_privilege('authenticated','mu2_private.is_active_admin(uuid)','EXECUTE') then raise exception 'MU2 private helper ACL mismatch'; end if;
  if not exists(select 1 from pg_proc where oid='mu2_private.is_active_admin(uuid)'::regprocedure and prosecdef and provolatile='s') then raise exception 'MU2 private helper contract'; end if;
  foreach t in array array['app_settings','goals','transactions','annual_checklists','monthly_snapshots'] loop
    rel:=to_regclass(format('public.%I',t));
    if not exists(select 1 from pg_class where oid=rel and relrowsecurity and relforcerowsecurity) or (select count(*) from pg_policy where polrelid=rel)<>8 then raise exception 'MU2 entity policy baseline %',t; end if;
    if exists(select 1 from pg_policy where polrelid=rel and (polcmd='*' or polroles<>array[(select oid from pg_roles where rolname='authenticated')])) then raise exception 'MU2 unexpected broad policy %',t; end if;
    if not exists(select 1 from pg_trigger where tgrelid=rel and tgname='mu2_immutable_owner' and tgenabled='O') then raise exception 'MU2 owner immutability trigger missing %',t; end if;
    if has_table_privilege('anon',rel,'SELECT') or has_table_privilege('authenticated',rel,'TRUNCATE') then raise exception 'MU2 entity grant regression %',t; end if;
  end loop;
end $check$;
commit;
