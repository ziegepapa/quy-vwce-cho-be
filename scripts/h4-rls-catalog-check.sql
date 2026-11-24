-- H4/H5 exact owner-only candidate catalog and effective privileges.
DO $h4$
DECLARE t text; rel oid; p record; role_name text; priv text; expected boolean; key_name text; expected_count int;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','app_settings','goals','transactions','annual_checklists','monthly_snapshots'] LOOP
    rel:=to_regclass(format('public.%I',t));
    IF rel IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=rel AND relrowsecurity AND relforcerowsecurity) THEN
      RAISE EXCEPTION 'RLS/FORCE missing: %',t;
    END IF;
    key_name:=case when t='profiles' then 'id' else 'user_id' end;
    expected_count:=case when t='profiles' then 3 else 4 end;
    IF (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>expected_count THEN RAISE EXCEPTION 'Unexpected policy count: %',t; END IF;
    FOR p IN SELECT polname,polcmd,polroles,polpermissive,pg_get_expr(polqual,polrelid) AS qual,pg_get_expr(polwithcheck,polrelid) AS check_expr FROM pg_policy WHERE polrelid=rel LOOP
      IF p.polroles<>ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')] OR NOT p.polpermissive OR
         p.polname<>(t||'_'||(case p.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'invalid' end)||'_own')
      THEN RAISE EXCEPTION 'Unexpected policy: %.%',t,p.polname; END IF;
      IF p.polcmd IN ('r','w','d') AND p.qual IS DISTINCT FROM format('(auth.uid() = %s)',key_name) THEN RAISE EXCEPTION 'Incorrect USING: %.%',t,p.polname; END IF;
      IF p.polcmd IN ('a','w') AND p.check_expr IS DISTINCT FROM format('(auth.uid() = %s)',key_name) THEN RAISE EXCEPTION 'Incorrect WITH CHECK: %.%',t,p.polname; END IF;
    END LOOP;
    IF t<>'profiles' AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='user_id' AND column_default='auth.uid()') THEN RAISE EXCEPTION 'Missing owner default: %',t; END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        expected:=role_name='authenticated' AND (priv IN ('SELECT','INSERT','UPDATE') OR (priv='DELETE' AND t<>'profiles'));
        IF has_table_privilege(role_name,rel,priv) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected effective grant %.% %',t,role_name,priv; END IF;
      END LOOP;
      IF current_setting('server_version_num')::integer >=170000 THEN
        IF has_table_privilege(role_name,rel,'MAINTAIN') THEN RAISE EXCEPTION 'Unexpected MAINTAIN %.%',t,role_name; END IF;
      END IF;
      IF has_function_privilege(role_name,'public.handle_new_user()','EXECUTE') OR has_function_privilege(role_name,'public.bump_version_and_updated_at()','EXECUTE') THEN RAISE EXCEPTION 'Client trigger EXECUTE grant remains: %',role_name; END IF;
    END LOOP;
    IF NOT has_table_privilege('service_role',rel,'SELECT') THEN RAISE EXCEPTION 'Service role read lost: %',t; END IF;
  END LOOP;
END;
$h4$;
SELECT 'PASS: six FORCE RLS tables, 23 exact owner policies, owner defaults and least-privilege effective ACLs' AS evidence;
