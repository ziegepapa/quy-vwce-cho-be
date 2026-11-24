-- Only on disposable runner DB. Test the operation, not just ACL metadata.
-- Every attempted TRUNCATE is inside an exception subtransaction; success fails the job and rolls back.
DO $probe$
DECLARE t text; r text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='h5_disposable_003_marker' AND NOT rolcanlogin) THEN RAISE EXCEPTION 'not H5 local fixture'; END IF;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH t IN ARRAY ARRAY['profiles','app_settings','goals','transactions','annual_checklists','monthly_snapshots'] LOOP
   BEGIN
    EXECUTE format('SET LOCAL ROLE %I',r);
    EXECUTE format('TRUNCATE TABLE public.%I',t);
    RAISE EXCEPTION 'TRUNCATE unexpectedly succeeded for % on %',r,t;
   EXCEPTION WHEN insufficient_privilege THEN
    NULL;
   END;
   RESET ROLE;
  END LOOP;
 END LOOP;
END $probe$;
SELECT 'PASS: all 12 actual client-role TRUNCATE attempts denied in isolated database' AS evidence;
