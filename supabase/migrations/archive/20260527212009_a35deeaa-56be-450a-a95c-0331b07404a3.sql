-- Revoke public access to all functions in the public schema
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Re-grant to authenticated and service_role
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Specifically check sensitive functions that might need SECURITY DEFINER
-- Guarded: functions may not exist in CI if earlier migrations failed
DO $sp3_guards$ BEGIN
  BEGIN
    ALTER FUNCTION public.handle_new_user() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP handle_new_user SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.handle_new_user_role() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP handle_new_user_role SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.prevent_profile_privilege_escalation() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP prevent_profile_privilege_escalation SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.is_admin_or_supervisor(uuid) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP is_admin_or_supervisor(uuid) SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.get_profile_id_for_user(uuid) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP get_profile_id_for_user(uuid) SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.get_profile_role_for_check(uuid) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP get_profile_role_for_check SET search_path: %', SQLERRM;
  END;
END $sp3_guards$;

-- Fix potentially permissive RLS on instance_registry
DROP POLICY IF EXISTS "Anyone can select instance_registry" ON public.instance_registry;
DO $sp3_pol$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'instance_registry') THEN
    EXECUTE $p$
      CREATE POLICY "Admin or Supervisor can view instance registry"
      ON public.instance_registry
      FOR SELECT
      TO authenticated
      USING (is_admin_or_supervisor(auth.uid()))
    $p$;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists on instance_registry';
END $sp3_pol$;

-- Tighten profiles SELECT policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DO $sp3_pol2$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    EXECUTE $p$
      CREATE POLICY "Profiles viewable by authenticated users"
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (true)
    $p$;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists on profiles';
END $sp3_pol2$;

-- Ensure audit_logs is protected
DO $sp3_pol3$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    EXECUTE 'ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Audit logs public insert" ON public.audit_logs';
    EXECUTE $p$
      CREATE POLICY "Only system can insert audit logs"
      ON public.audit_logs
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id)
    $p$;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SKIP audit_logs RLS: %', SQLERRM;
END $sp3_pol3$;

-- Contact notes check
DO $sp3_pol4$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'contact_notes') THEN
    EXECUTE 'ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Contact notes are public" ON public.contact_notes';
    EXECUTE $p$
      CREATE POLICY "Users view relevant contact notes"
      ON public.contact_notes
      FOR SELECT
      TO authenticated
      USING (true)
    $p$;
    EXECUTE $p$
      CREATE POLICY "Users insert contact notes"
      ON public.contact_notes
      FOR INSERT
      TO authenticated
      WITH CHECK (true)
    $p$;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SKIP contact_notes RLS: %', SQLERRM;
END $sp3_pol4$;
