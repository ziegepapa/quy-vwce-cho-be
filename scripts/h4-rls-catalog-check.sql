-- Supplemental catalog proof for H4. Run only against the disposable local Supabase DB.
-- This does not replace the Auth/JWT/PostgREST behavioral matrix.
DO $h4$
DECLARE
  t text;
  rel oid;
  required_tables text[] := ARRAY[
    'profiles',
    'app_settings',
    'goals',
    'transactions',
    'annual_checklists',
    'monthly_snapshots'
  ];
  table_names text[] := ARRAY[
    'app_settings',
    'goals',
    'transactions',
    'annual_checklists',
    'monthly_snapshots'
  ];
BEGIN
  FOREACH t IN ARRAY required_tables LOOP
    rel := to_regclass(format('public.%I', t));
    IF rel IS NULL THEN
      RAISE EXCEPTION 'H4 catalog: required table public.% is missing', t;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid = rel AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'H4 catalog: RLS is not enabled on public.%', t;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p WHERE p.polrelid = rel
    ) THEN
      RAISE EXCEPTION 'H4 catalog: no policy is installed on public.%', t;
    END IF;
  END LOOP;

  -- Profiles permits the documented own-row SELECT, INSERT and UPDATE only.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polcmd IN ('r', '*')
      AND lower(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) LIKE '%auth.uid()%'
      AND lower(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) LIKE '%id%'
  ) THEN
    RAISE EXCEPTION 'H4 catalog: profiles own-row SELECT policy is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polcmd IN ('w', '*')
      AND lower(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) LIKE '%auth.uid()%'
      AND lower(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) LIKE '%id%'
  ) THEN
    RAISE EXCEPTION 'H4 catalog: profiles own-row UPDATE policy is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polcmd IN ('a', '*')
      AND lower(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) LIKE '%auth.uid()%'
      AND lower(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) LIKE '%id%'
  ) THEN
    RAISE EXCEPTION 'H4 catalog: profiles own-identity INSERT check is missing';
  END IF;

  -- All sync tables must restrict both existing and proposed rows to auth.uid().
  FOREACH t IN ARRAY table_names LOOP
    rel := to_regclass(format('public.%I', t));

    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = rel
        AND p.polcmd = '*'
        AND lower(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) LIKE '%auth.uid()%'
        AND lower(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) LIKE '%user_id%'
        AND lower(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) LIKE '%auth.uid()%'
        AND lower(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) LIKE '%user_id%'
    ) THEN
      RAISE EXCEPTION 'H4 catalog: owner-scoped ALL policy/WITH CHECK missing on public.%', t;
    END IF;
  END LOOP;
END;
$h4$;

SELECT 'PASS: H4 RLS enabled and required owner-scoped policies are present' AS evidence;
