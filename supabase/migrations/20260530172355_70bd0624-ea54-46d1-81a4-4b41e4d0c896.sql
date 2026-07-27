-- 1. Fix SECURITY DEFINER search_path for handle_new_user_settings
-- Guarded: function may not exist in CI if earlier migrations failed
DO $sp4_guards$ BEGIN
  BEGIN
    ALTER FUNCTION public.handle_new_user_settings() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP handle_new_user_settings SET search_path: %', SQLERRM;
  END;
END $sp4_guards$;

-- 2. Hardening whatsapp_connections policies
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Staff can view connections" ON public.whatsapp_connections;

-- Create a more restrictive one
DO $sp4_pol$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'whatsapp_connections') THEN
    EXECUTE $p$
      CREATE POLICY "Staff can view their assigned connections"
      ON public.whatsapp_connections
      FOR SELECT
      TO authenticated
      USING (
        is_admin_or_supervisor(auth.uid())
        OR
        (EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'dev'::app_role
        ))
        OR
        (created_by = auth.uid())
      )
    $p$;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists on whatsapp_connections';
WHEN OTHERS THEN
  RAISE NOTICE 'SKIP whatsapp_connections policy: %', SQLERRM;
END $sp4_pol$;

-- 3. Ensure audit_logs is secure
DO $sp4_rl$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    EXECUTE 'ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY';
  END IF;
END $sp4_rl$;

-- 4. Set search_path for SECURITY DEFINER functions that are missing it.
-- Uses pg_get_function_identity_arguments to include argument types so
-- ALTER FUNCTION succeeds even for functions with parameters.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, n.nspname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.prosecdef = true
      AND n.nspname = 'public'
      AND (p.proconfig IS NULL OR NOT p.proconfig @> ARRAY['search_path=public'])
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public',
                     r.nspname, r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'SKIP ALTER FUNCTION %.%(%) SET search_path: %',
                   r.nspname, r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;
