-- R29: Grant EXECUTE on SECDEF functions used by security_invoker views
-- Context: public.contacts and zapp.contacts are security_invoker views.
-- They call get_default_workspace_id() and get_connection_id_for_instance(text),
-- both SECURITY DEFINER owned by postgres. With security_invoker, the CALLER
-- (authenticated) needs EXECUTE — not just the owner.
-- Symptom: GET /rest/v1/contacts → 403 (PostgREST denies because authenticated
-- can't execute the functions referenced by the invoker view).
-- Fixed: 2026-08-01 ~18:50 UTC (applied directly, this migration documents it).

DO $$
BEGIN
  -- get_default_workspace_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'zapp'
      AND routine_name = 'get_default_workspace_id'
      AND grantee = 'authenticated'
      AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE NOTICE 'R29: GRANT EXECUTE ON zapp.get_default_workspace_id() TO authenticated';
  ELSE
    RAISE NOTICE 'R29: zapp.get_default_workspace_id — authenticated already has EXECUTE (skip)';
  END IF;

  -- get_connection_id_for_instance
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'zapp'
      AND routine_name = 'get_connection_id_for_instance'
      AND grantee = 'authenticated'
      AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE NOTICE 'R29: GRANT EXECUTE ON zapp.get_connection_id_for_instance(text) TO authenticated';
  ELSE
    RAISE NOTICE 'R29: zapp.get_connection_id_for_instance — authenticated already has EXECUTE (skip)';
  END IF;
END $$;

-- Apply the grants unconditionally (the DO block above is for logging only;
-- GRANT is idempotent in PostgreSQL — no harm in re-granting).
GRANT EXECUTE ON FUNCTION zapp.get_default_workspace_id() TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.get_connection_id_for_instance(text) TO authenticated;

-- Verify
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(p.proname) INTO v_missing
  FROM pg_proc p
  WHERE p.pronamespace = 'zapp'::regnamespace
    AND p.proname IN ('get_connection_id_for_instance', 'get_default_workspace_id')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'R29 FAILED: authenticated still missing EXECUTE on: %', array_to_string(v_missing, ', ');
  END IF;
  RAISE NOTICE 'R29 OK: authenticated has EXECUTE on both functions';
END $$;
