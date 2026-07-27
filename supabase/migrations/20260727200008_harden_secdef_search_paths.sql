-- Migration: harden_secdef_search_paths
--
-- Fixes search_path vulnerabilities in SECURITY DEFINER functions that were
-- either missing SET search_path entirely or had 'public' as the first entry.
--
-- Vulnerability: a SECURITY DEFINER function without a fixed search_path (or
-- with 'public' first) can be exploited by a compromised caller creating shadow
-- objects in the public schema that resolve before pg_catalog or the intended
-- schemas, enabling privilege escalation under the function's elevated context.
--
-- Functions fixed:
--   1. fn_webhook_pipeline_score (HIGH): had search_path starting with 'public'
--   2. search_knowledge_base (HIGH): no SET search_path
--   3. rpc_upsert_contact (HIGH): no SET search_path
--   4. handle_new_user_settings (HIGH): trigger function, no SET search_path
--   5. fn_touch_updated_at (HIGH): trigger function, no SET search_path
--   6. fn_touch_role_permissions_updated_at (HIGH): trigger function, no SET search_path

-- ── 1. fn_webhook_pipeline_score — 'public' first → remove public, fix order ─
-- The function body references zapp, evo, ops, cron objects; pg_catalog must
-- come before public to prevent shadow-function attacks.
DO $do$
DECLARE
  v_schema text;
  v_name   text;
BEGIN
  -- Only patch if the function exists; it may live in ops or zapp schema
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('zapp','ops','public')
      AND p.proname = 'fn_webhook_pipeline_score'
  ) THEN
    SELECT n.nspname INTO v_schema
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'fn_webhook_pipeline_score'
     LIMIT 1;
    EXECUTE format(
      'ALTER FUNCTION %I.fn_webhook_pipeline_score(text) '
      'SET search_path = zapp, evo, ops, cron, pg_catalog',
      v_schema
    );
  END IF;
END $do$;

-- ── 2. search_knowledge_base — add SET search_path ───────────────────────────
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'search_knowledge_base'
  ) THEN
    -- Function may be overloaded; patch all variants
    UPDATE pg_proc SET proconfig = array_append(
      array_remove(proconfig, (SELECT elem FROM unnest(proconfig) elem WHERE elem LIKE 'search_path%')),
      'search_path=zapp, evo, pg_catalog'
    )
    FROM pg_namespace n
    WHERE pg_proc.pronamespace = n.oid
      AND n.nspname = 'zapp'
      AND pg_proc.proname = 'search_knowledge_base';
  END IF;
END $do$;

-- ── 3. rpc_upsert_contact — add SET search_path ──────────────────────────────
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'rpc_upsert_contact'
  ) THEN
    UPDATE pg_proc SET proconfig = array_append(
      array_remove(proconfig, (SELECT elem FROM unnest(proconfig) elem WHERE elem LIKE 'search_path%')),
      'search_path=zapp, evo, pg_catalog'
    )
    FROM pg_namespace n
    WHERE pg_proc.pronamespace = n.oid
      AND n.nspname = 'zapp'
      AND pg_proc.proname = 'rpc_upsert_contact';
  END IF;
END $do$;

-- ── 4. handle_new_user_settings — trigger function, add SET search_path ──────
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'handle_new_user_settings'
  ) THEN
    ALTER FUNCTION zapp.handle_new_user_settings()
      SET search_path = zapp, pg_catalog;
  END IF;
END $do$;

-- ── 5. fn_touch_updated_at — trigger function, add SET search_path ───────────
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_touch_updated_at'
  ) THEN
    ALTER FUNCTION zapp.fn_touch_updated_at()
      SET search_path = zapp, pg_catalog;
  END IF;
END $do$;

-- ── 6. fn_touch_role_permissions_updated_at — trigger function ───────────────
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_touch_role_permissions_updated_at'
  ) THEN
    ALTER FUNCTION zapp.fn_touch_role_permissions_updated_at()
      SET search_path = zapp, pg_catalog;
  END IF;
END $do$;

-- ── Comments for audit trail ─────────────────────────────────────────────────
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_touch_updated_at'
  ) THEN
    COMMENT ON FUNCTION zapp.fn_touch_updated_at() IS
      'Trigger function: sets updated_at = NOW() on any row modification. '
      'SECURITY DEFINER with fixed search_path = zapp, pg_catalog.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_touch_role_permissions_updated_at'
  ) THEN
    COMMENT ON FUNCTION zapp.fn_touch_role_permissions_updated_at() IS
      'Trigger function: sets updated_at = NOW() on role_permissions modifications. '
      'SECURITY DEFINER with fixed search_path = zapp, pg_catalog.';
  END IF;
END $do$;

-- ── ops.check_critical_fks: restrict execution to service_role ───────────────
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'ops' AND p.proname = 'check_critical_fks'
  ) THEN
    REVOKE EXECUTE ON FUNCTION ops.check_critical_fks() FROM PUBLIC;
    -- service_role already has EXECUTE via superuser grant; explicit grant for clarity
    EXECUTE 'GRANT EXECUTE ON FUNCTION ops.check_critical_fks() TO service_role';
  END IF;
END $do$;
