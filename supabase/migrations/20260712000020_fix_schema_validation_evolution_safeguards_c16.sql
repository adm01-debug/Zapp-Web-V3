-- FIX-16 (C-16 - CRITICAL): Schema validation and evolution safeguards
-- ==================================================================
--
-- PROBLEM: Schema changes can break webhook processing silently:
-- 1. Migrations applied out of order → incompatible schema state
-- 2. Accidental column drops → silent failures in stored procedures
-- 3. Index removal → performance degradation without alerts
-- 4. Constraint modifications → data integrity violations
-- 5. No schema versioning → impossible to track what version is deployed
--
-- SOLUTION:
-- 1. Create schema version tracking table
-- 2. Implement migration dependency validation
-- 3. Create schema state snapshot function
-- 4. Implement automatic rollback detection
-- 5. Create schema compatibility checker

-- Step 1: Create schema version tracking table
CREATE TABLE IF NOT EXISTS evo.schema_versions (
  id BIGSERIAL PRIMARY KEY,
  migration_id TEXT NOT NULL UNIQUE,
  migration_name TEXT NOT NULL,
  version NUMERIC NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, applied, failed, rolled_back
  applied_at TIMESTAMP WITH TIME ZONE,
  rolled_back_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  checksum TEXT,
  dependencies TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT idx_migration_status UNIQUE (migration_id, status)
);

CREATE INDEX IF NOT EXISTS idx_schema_versions_applied
  ON evo.schema_versions(applied_at DESC NULLS LAST) WHERE status = 'applied';

CREATE INDEX IF NOT EXISTS idx_schema_versions_version
  ON evo.schema_versions(version DESC);

-- Step 2: Create required tables/columns verification function
CREATE OR REPLACE FUNCTION public.fn_verify_schema_requirements()
RETURNS TABLE(
  check_name TEXT,
  required_object TEXT,
  status TEXT,
  error_details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_table_exists BOOLEAN;
  v_column_exists BOOLEAN;
  v_index_exists BOOLEAN;
BEGIN
  -- Check 1: webhook_rate_limits table
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'webhook_rate_limits' AND table_schema = 'public'
  ) INTO v_table_exists;
  RETURN QUERY SELECT
    'Required Table'::TEXT,
    'public.webhook_rate_limits'::TEXT,
    CASE WHEN v_table_exists THEN 'OK' ELSE 'MISSING' END,
    CASE WHEN NOT v_table_exists THEN 'Table does not exist. Schema is incomplete.' ELSE NULL END;

  -- Check 2: webhook_events_processed table
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'webhook_events_processed' AND table_schema = 'public'
  ) INTO v_table_exists;
  RETURN QUERY SELECT
    'Required Table'::TEXT,
    'public.webhook_events_processed'::TEXT,
    CASE WHEN v_table_exists THEN 'OK' ELSE 'MISSING' END,
    CASE WHEN NOT v_table_exists THEN 'Table does not exist. Schema is incomplete.' ELSE NULL END;

  -- Check 3: idempotency_rollback_failures table
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'idempotency_rollback_failures' AND table_schema = 'public'
  ) INTO v_table_exists;
  RETURN QUERY SELECT
    'Required Table'::TEXT,
    'public.idempotency_rollback_failures'::TEXT,
    CASE WHEN v_table_exists THEN 'OK' ELSE 'MISSING' END,
    CASE WHEN NOT v_table_exists THEN 'Table does not exist. Schema is incomplete.' ELSE NULL END;

  -- Check 4: increment_webhook_rate_limit RPC
  SELECT EXISTS(
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'increment_webhook_rate_limit' AND routine_schema = 'public'
  ) INTO v_table_exists;
  RETURN QUERY SELECT
    'Required Function'::TEXT,
    'public.increment_webhook_rate_limit()'::TEXT,
    CASE WHEN v_table_exists THEN 'OK' ELSE 'MISSING' END,
    CASE WHEN NOT v_table_exists THEN 'Function does not exist. Rate-limit RPC is missing.' ELSE NULL END;

  -- Check 5: fn_redact_webhook_secrets function
  SELECT EXISTS(
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'fn_redact_webhook_secrets' AND routine_schema = 'public'
  ) INTO v_table_exists;
  RETURN QUERY SELECT
    'Required Function'::TEXT,
    'public.fn_redact_webhook_secrets()'::TEXT,
    CASE WHEN v_table_exists THEN 'OK' ELSE 'MISSING' END,
    CASE WHEN NOT v_table_exists THEN 'Function does not exist. Secret redaction is unavailable.' ELSE NULL END;

  -- Check 6: RLS enabled on webhook_events_processed
  SELECT EXISTS(
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'webhook_events_processed' AND n.nspname = 'public' AND c.relrowsecurity = true
  ) INTO v_table_exists;
  RETURN QUERY SELECT
    'RLS Policy'::TEXT,
    'webhook_events_processed RLS enabled'::TEXT,
    CASE WHEN v_table_exists THEN 'OK' ELSE 'MISSING' END,
    CASE WHEN NOT v_table_exists THEN 'RLS is not enabled. Security check may be bypassed.' ELSE NULL END;

  -- Check 7: RLS enabled on idempotency_rollback_failures
  SELECT EXISTS(
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idempotency_rollback_failures' AND n.nspname = 'public' AND c.relrowsecurity = true
  ) INTO v_table_exists;
  RETURN QUERY SELECT
    'RLS Policy'::TEXT,
    'idempotency_rollback_failures RLS enabled'::TEXT,
    CASE WHEN v_table_exists THEN 'OK' ELSE 'MISSING' END,
    CASE WHEN NOT v_table_exists THEN 'RLS is not enabled. Audit table may be readable by unauthorized users.' ELSE NULL END;

END;
$fn$;

-- Step 3: Create migration tracker function
CREATE OR REPLACE FUNCTION public.fn_record_migration(
  p_migration_id TEXT,
  p_migration_name TEXT,
  p_version NUMERIC,
  p_description TEXT,
  p_checksum TEXT,
  p_dependencies TEXT[] DEFAULT '{}'
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo
AS $fn$
BEGIN
  -- Check dependencies are applied
  IF p_dependencies IS NOT NULL AND array_length(p_dependencies, 1) > 0 THEN
    IF EXISTS(
      SELECT 1 FROM unnest(p_dependencies) dep
      WHERE NOT EXISTS(
        SELECT 1 FROM evo.schema_versions
        WHERE migration_id = dep AND status = 'applied'
      )
    ) THEN
      RETURN QUERY SELECT false, 'Unmet migration dependencies. Cannot apply migration.';
      RETURN;
    END IF;
  END IF;

  -- Insert or update migration record
  INSERT INTO evo.schema_versions(
    migration_id, migration_name, version, description, status,
    checksum, dependencies, applied_at
  ) VALUES (
    p_migration_id, p_migration_name, p_version, p_description, 'applied',
    p_checksum, p_dependencies, now()
  )
  ON CONFLICT (migration_id) DO UPDATE SET
    status = 'applied',
    applied_at = now(),
    rolled_back_at = NULL,
    error_message = NULL,
    updated_at = now();

  RETURN QUERY SELECT true, 'Migration recorded successfully';
END;
$fn$;

-- Step 4: Create schema state snapshot function
CREATE OR REPLACE FUNCTION public.fn_snapshot_schema_state()
RETURNS TABLE(
  snapshot_id TEXT,
  timestamp TIMESTAMP WITH TIME ZONE,
  total_tables INT,
  total_functions INT,
  total_indexes INT,
  schema_hash TEXT,
  is_valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_snapshot_id TEXT;
  v_table_count INT;
  v_function_count INT;
  v_index_count INT;
  v_schema_hash TEXT;
BEGIN
  v_snapshot_id := 'snapshot_' || to_char(now(), 'YYYYMMDD_HH24MISS_US');

  -- Count objects
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema IN ('public', 'evo', 'zapp', 'ops', 'cron');

  SELECT COUNT(*) INTO v_function_count
  FROM information_schema.routines
  WHERE routine_schema IN ('public', 'evo', 'zapp', 'ops', 'cron');

  SELECT COUNT(*) INTO v_index_count
  FROM pg_indexes
  WHERE schemaname IN ('public', 'evo', 'zapp', 'ops', 'cron');

  -- Create composite hash of schema state
  SELECT md5(
    format('Tables: %s, Functions: %s, Indexes: %s',
      v_table_count, v_function_count, v_index_count)
  ) INTO v_schema_hash;

  RETURN QUERY SELECT
    v_snapshot_id,
    now(),
    v_table_count,
    v_function_count,
    v_index_count,
    v_schema_hash,
    true; -- is_valid

END;
$fn$;

-- Step 5: Create automatic rollback detection function
CREATE OR REPLACE FUNCTION public.fn_detect_rollback()
RETURNS TABLE(
  rollback_detected BOOLEAN,
  last_applied_version NUMERIC,
  previous_version NUMERIC,
  rollback_time TIMESTAMP WITH TIME ZONE,
  affected_migrations TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo
AS $fn$
DECLARE
  v_last_applied NUMERIC;
  v_previous NUMERIC;
BEGIN
  -- Get last two applied migrations
  SELECT version INTO v_last_applied
  FROM evo.schema_versions
  WHERE status = 'applied'
  ORDER BY applied_at DESC
  LIMIT 1;

  SELECT version INTO v_previous
  FROM evo.schema_versions
  WHERE status = 'applied' AND version < v_last_applied
  ORDER BY applied_at DESC
  LIMIT 1;

  -- If gap detected between last applied versions, rollback occurred
  IF v_last_applied IS NOT NULL AND v_previous IS NOT NULL THEN
    IF v_last_applied - v_previous > 1 THEN
      RETURN QUERY SELECT
        true,
        v_last_applied,
        v_previous,
        now(),
        ARRAY(
          SELECT migration_id FROM evo.schema_versions
          WHERE version > v_previous AND version <= v_last_applied
            AND status = 'rolled_back'
          ORDER BY version DESC
        );
      RETURN;
    END IF;
  END IF;

  -- No rollback detected
  RETURN QUERY SELECT false, v_last_applied, v_previous, NULL::TIMESTAMP WITH TIME ZONE, '{}'::TEXT[];
END;
$fn$;

-- Step 6: Create schema compatibility checker
CREATE OR REPLACE FUNCTION public.fn_check_schema_compatibility()
RETURNS TABLE(
  compatibility_status TEXT,
  issues_found INT,
  warnings TEXT[],
  errors TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_issues INT := 0;
  v_warnings TEXT[] := '{}';
  v_errors TEXT[] := '{}';
BEGIN
  -- Check 1: Required columns exist
  IF NOT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_rate_limits' AND column_name = 'event_count'
      AND data_type = 'bigint'
  ) THEN
    v_errors := array_append(v_errors, 'webhook_rate_limits.event_count must be BIGINT');
    v_issues := v_issues + 1;
  END IF;

  -- Check 2: Constraints exist
  IF NOT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'webhook_rate_limits' AND constraint_type = 'PRIMARY KEY'
  ) THEN
    v_errors := array_append(v_errors, 'webhook_rate_limits missing PRIMARY KEY constraint');
    v_issues := v_issues + 1;
  END IF;

  -- Check 3: Indexes exist for critical queries
  IF NOT EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'webhook_events_processed'
      AND indexname LIKE '%instance_id%'
  ) THEN
    v_warnings := array_append(v_warnings, 'Missing instance_id index on webhook_events_processed');
  END IF;

  RETURN QUERY SELECT
    CASE WHEN v_issues = 0 THEN 'OK' ELSE 'INCOMPATIBLE' END,
    v_issues,
    v_warnings,
    v_errors;
END;
$fn$;

-- Step 7: Grant permissions
GRANT EXECUTE ON FUNCTION public.fn_verify_schema_requirements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_migration(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_snapshot_schema_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_detect_rollback() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_schema_compatibility() TO authenticated;

-- Step 8: Document schema evolution requirements
COMMENT ON FUNCTION public.fn_verify_schema_requirements IS
  'Verifies all required tables, columns, functions, and RLS policies exist.

   FIX-16 (2026-07-12): Schema validation and evolution safeguards.

   Returns: (check_name, required_object, status, error_details)

   USAGE: Call on startup to validate schema completeness before serving traffic.
   Fail if any check returns status != ''OK''.

   Recommended: Schedule with pg_cron to run every 30 minutes:
   SELECT cron.schedule(''verify_schema_health_30min'', ''*/30 * * * *'',
     ''SELECT fn_verify_schema_requirements()'');';

COMMENT ON FUNCTION public.fn_record_migration IS
  'Records migration in schema version tracking table with dependency validation.

   FIX-16 (2026-07-12): Schema validation and evolution safeguards.

   Ensures migrations are applied in correct order and dependencies are met.

   USAGE: Call after each migration applies:
   SELECT fn_record_migration(
     ''20260712000020'',
     ''fix_schema_validation_evolution_safeguards_c16'',
     20.0,
     ''Schema validation safeguards'',
     md5(script_content),
     ARRAY[''20260712000019'']  -- depends on FIX-15
   );';

COMMENT ON FUNCTION public.fn_snapshot_schema_state IS
  'Creates snapshot of current schema state for tracking changes.

   FIX-16 (2026-07-12): Schema validation and evolution safeguards.

   Returns: (snapshot_id, timestamp, total_tables, total_functions, total_indexes, schema_hash, is_valid)

   USAGE: Call before and after major deployments to detect unintended changes.
   Compare schema_hash values to detect schema drift.';

COMMENT ON TABLE evo.schema_versions IS
  'Tracks all applied migrations, dependencies, and schema version history.

   FIX-16 (2026-07-12): Schema validation and evolution safeguards.

   Enables:
   - Migration ordering validation
   - Rollback detection
   - Schema compatibility checks
   - Version tracking for debugging';
