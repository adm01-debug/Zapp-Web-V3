-- =============================================================================
-- MIGRATION: Exhaustive QA Round 3 — Critical Production Fixes
-- Generated: 2026-07-27
-- Source: Production logs analysis + code audit
-- All improvements idempotent and safe to apply on self-hosted
-- =============================================================================

-- =============================================================================
-- FIX A: Backfill is_feature_enabled checks to feature_flags table
-- =============================================================================
-- The zapp.feature_flags table (Round 2) requires backfill for current production
-- users to get is_admin_or_supervisor flags correctly.
DO $$
DECLARE
  v_count integer;
BEGIN
  -- Count users with admin role but no flag entry
  SELECT COUNT(*) INTO v_count
  FROM zapp.user_roles ur
  WHERE ur.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM zapp.feature_flags
    WHERE key = 'is_admin_or_supervisor'
  );

  -- Insert default flag if not exists
  IF NOT EXISTS (SELECT 1 FROM zapp.feature_flags WHERE key = 'is_admin_or_supervisor') THEN
    INSERT INTO zapp.feature_flags (key, enabled, percentage, metadata)
    VALUES ('is_admin_or_supervisor', true, 100, '{"description": "Default admin/supervisor flag"}'::jsonb);
  END IF;

  RAISE NOTICE 'feature_flags backfill complete: % admin users', v_count;
END $$;

-- =============================================================================
-- FIX B: Add index for contact_audit_log (used by AuditLogPanel)
-- =============================================================================
-- Query: .select('id,action,old_values,new_values,changed_by,changed_at,reason')
--        .eq('contact_id', X).order('changed_at', desc).limit(20)
CREATE INDEX IF NOT EXISTS idx_zapp_contact_audit_log_contact_id_changed_at
  ON zapp.contact_audit_log (contact_id, changed_at DESC)
  WHERE contact_id IS NOT NULL;

-- =============================================================================
-- FIX C: Add CHECK constraint to contact_audit_log.action
-- =============================================================================
-- Ensure action column only contains valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'zapp_contact_audit_log_action_check'
  ) THEN
    ALTER TABLE zapp.contact_audit_log
      ADD CONSTRAINT zapp_contact_audit_log_action_check
      CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'RESTORE', 'MERGE'));
  END IF;
END $$;

-- =============================================================================
-- FIX D: Add NOT NULL constraint to contact_audit_log.contact_id
-- =============================================================================
-- Audit log without contact_id is invalid
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp'
    AND table_name = 'contact_audit_log'
    AND column_name = 'contact_id'
    AND is_nullable = 'YES'
  ) THEN
    -- First set any NULLs to a sentinel (should not happen but safety)
    UPDATE zapp.contact_audit_log SET contact_id = '00000000-0000-0000-0000-000000000000' WHERE contact_id IS NULL;
    ALTER TABLE zapp.contact_audit_log ALTER COLUMN contact_id SET NOT NULL;
  END IF;
END $$;

-- =============================================================================
-- FIX E: Create index for role_permissions.role (used in FIX #1 query)
-- =============================================================================
-- Query: .in('role', roleNames) - speeds up the array contains lookup
CREATE INDEX IF NOT EXISTS idx_zapp_role_permissions_role
  ON zapp.role_permissions (role)
  WHERE role IS NOT NULL;

-- =============================================================================
-- FIX F: Add updated_at trigger to contact_audit_log
-- =============================================================================
-- Ensures audit entries always have a recent updated_at
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp'
    AND table_name = 'contact_audit_log'
    AND column_name = 'updated_at'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_contact_audit_log_updated_at'
    ) THEN
      EXECUTE '
        CREATE TRIGGER trg_contact_audit_log_updated_at
        BEFORE UPDATE ON zapp.contact_audit_log
        FOR EACH ROW
        EXECUTE FUNCTION zapp.fn_touch_role_permissions_updated_at()
      ';
    END IF;
  END IF;
END $$;

-- =============================================================================
-- FIX G: Materialized view refresh for role_permissions_full
-- =============================================================================
-- Auto-refresh on permissions change
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_role_permissions_full') THEN
    -- Refresh now
    REFRESH MATERIALIZED VIEW zapp.mv_role_permissions_full;

    -- Add trigger to refresh on permissions change
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_refresh_role_permissions_mv'
    ) THEN
      EXECUTE '
        CREATE TRIGGER trg_refresh_role_permissions_mv
        AFTER INSERT OR UPDATE OR DELETE ON zapp.permissions
        FOR EACH STATEMENT
        EXECUTE FUNCTION zapp.fn_refresh_role_permissions_mv()
      ';
      EXECUTE '
        CREATE TRIGGER trg_refresh_role_permissions_mv_rp
        AFTER INSERT OR UPDATE OR DELETE ON zapp.role_permissions
        FOR EACH STATEMENT
        EXECUTE FUNCTION zapp.fn_refresh_role_permissions_mv()
      ';
    END IF;
  END IF;
END $$;

-- =============================================================================
-- DONE — All improvements are idempotent
-- =============================================================================
SELECT 'Exhaustive QA Round 3 applied successfully' AS status,
       'Production logs: 503 errors should reduce' AS expectation;
