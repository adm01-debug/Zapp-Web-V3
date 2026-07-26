-- MIGRATION: Final QA Improvements (Round 2 Fable 5)
-- Generated: 2026-07-26
-- Purpose: Final 10/10 fixes identified after production logs analysis

-- =============================================================================
-- IMPROVEMENT 1: Add index for zapp.contact_intelligence queries
-- =============================================================================
-- Query: .select('*').or(`contact_id.eq.X, phone.eq.Y`)
-- Issue: Without index, full table scan on 14k+ records
CREATE INDEX IF NOT EXISTS idx_zapp_contact_intelligence_contact_id
  ON zapp.contact_intelligence (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_zapp_contact_intelligence_phone
  ON zapp.contact_intelligence (phone)
  WHERE phone IS NOT NULL;

-- =============================================================================
-- IMPROVEMENT 2: Add index for evolution_messages queries
-- =============================================================================
-- Query: .or(`contact_id.eq.X, remote_jid.eq.Y`)
-- Issue: Without index, slow on partitioned table
CREATE INDEX IF NOT EXISTS idx_evo_evolution_messages_contact_id
  ON evo.evolution_messages (contact_id)
  WHERE contact_id IS NOT NULL;

-- =============================================================================
-- IMPROVEMENT 3: Add missing function for graceful degradation
-- =============================================================================
-- Used by evolution-api when upstream returns 5xx
CREATE OR REPLACE FUNCTION zapp.fn_evolution_status_unknown(p_instance_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $$
DECLARE
  v_status text := 'unknown';
  v_message text;
BEGIN
  -- Record the unknown status in the connection log
  BEGIN
    UPDATE zapp.whatsapp_connections
    SET status = 'unknown',
        updated_at = now()
    WHERE instance_name = p_instance_name;
  EXCEPTION
    WHEN OTHERS THEN
      -- Log but don't fail
      RAISE WARNING 'Failed to update status for %: %', p_instance_name, SQLERRM;
  END;

  v_message := format('Evolution API status unknown for instance %s', p_instance_name);

  RETURN jsonb_build_object(
    'status', v_status,
    'state', null,
    'instance', p_instance_name,
    'message', v_message,
    'timestamp', extract(epoch from now())
  );
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.fn_evolution_status_unknown(text) TO authenticated, anon;

-- =============================================================================
-- IMPROVEMENT 4: Materialized view for role_permissions with permission names
-- =============================================================================
-- This eliminates the need for JOIN in every query
CREATE MATERIALIZED VIEW IF NOT EXISTS zapp.mv_role_permissions_full AS
SELECT
  rp.role,
  rp.permission_id,
  p.name AS permission_name,
  p.category,
  p.description
FROM zapp.role_permissions rp
JOIN zapp.permissions p ON p.id = rp.permission_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_role_permissions_full
  ON zapp.mv_role_permissions_full (role, permission_id);

GRANT SELECT ON zapp.mv_role_permissions_full TO authenticated, anon;

-- Refresh function (can be called from cron)
CREATE OR REPLACE FUNCTION zapp.fn_refresh_role_permissions_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY zapp.mv_role_permissions_full;
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.fn_refresh_role_permissions_mv() TO service_role;

-- =============================================================================
-- IMPROVEMENT 5: Add helper function for safe phone normalization
-- =============================================================================
CREATE OR REPLACE FUNCTION zapp.fn_normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
BEGIN
  -- Remove all non-digit chars
  v_digits := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  -- Brazilian phone: must have 10-13 digits
  IF length(v_digits) < 10 OR length(v_digits) > 13 THEN
    RETURN NULL;
  END IF;

  -- Add country code if missing
  IF length(v_digits) IN (10, 11) THEN
    v_digits := '55' || v_digits;
  END IF;

  RETURN v_digits;
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.fn_normalize_phone(text) TO authenticated, anon, service_role;

-- =============================================================================
-- IMPROVEMENT 6: Add updated_at trigger to zapp.role_permissions
-- =============================================================================
CREATE OR REPLACE FUNCTION zapp.fn_touch_role_permissions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp'
    AND table_name = 'role_permissions'
    AND column_name = 'updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_role_permissions_updated_at ON zapp.role_permissions;
    CREATE TRIGGER trg_role_permissions_updated_at
      BEFORE UPDATE ON zapp.role_permissions
      FOR EACH ROW
      EXECUTE FUNCTION zapp.fn_touch_role_permissions_updated_at();
  END IF;
END $$;

-- =============================================================================
-- IMPROVEMENT 7: Add safety check to zapp.contact_intelligence
-- =============================================================================
-- Ensure contact_id is always valid UUID when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'zapp'
    AND table_name = 'contact_intelligence'
  ) THEN
    -- Add CHECK constraint for contact_id format
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.check_constraints
      WHERE constraint_name = 'zapp_contact_intelligence_contact_id_check'
    ) THEN
      ALTER TABLE zapp.contact_intelligence
        ADD CONSTRAINT zapp_contact_intelligence_contact_id_check
        CHECK (contact_id IS NULL OR contact_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
    END IF;
  END IF;
END $$;

-- =============================================================================
-- DONE — All improvements are idempotent
-- =============================================================================
SELECT 'QA Round 2 improvements applied successfully' AS status;
