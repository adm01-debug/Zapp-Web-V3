-- M42: F6-15 — Fix api_type for "WPP Marketing (Cloud API Oficial)" connection
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem (F6-15):
--   Row in zapp.whatsapp_connections:
--     name='WPP Marketing (Cloud API Oficial)', api_type='evolution',
--     instance_id=NULL, is_active=false, health_status='provisioned'
--   Name unambiguously signals Meta Cloud API (Oficial), but api_type='evolution'
--   (Evolution WhatsApp API). Operator confusion: admins treating it as Cloud API
--   while system routes it as Evolution. Dormant connection (is_active=false).
--
-- Root cause: connection was created with the wrong api_type — likely a UI bug
--   that allowed mismatched name/type. No validation prevented "Cloud API Oficial"
--   as a name with api_type='evolution'.
--
-- Fix (safe — no destructive deletes):
--   STEP 1 — UPDATE all connections where name suggests Meta Cloud API
--             (contains 'Cloud API' or 'Oficial', case-insensitive) but
--             api_type='evolution'. Set api_type='official' and
--             api_url='https://graph.facebook.com/v21.0' (canonical Meta endpoint).
--
--             Note: The trg_validate_whatsapp_connection_url trigger (M37)
--             fires BEFORE INSERT OR UPDATE OF api_url and skips when
--             api_type='official' — UPDATE is safe even with that trigger active.
--
-- Note on F6-15 UI validation:
--   useConnectionsActions.handleAddConnection now auto-corrects api_type to
--   'official' when the connection name contains 'Cloud API' or 'Oficial'.
--   This prevents future mismatches at the application layer.
--   (See src/features/connections/hooks/parts/useConnectionsActions.ts)
--
-- Rollback:
--   UPDATE zapp.whatsapp_connections
--      SET api_type = 'evolution',
--          api_url  = NULL,
--          updated_at = now()
--    WHERE name ILIKE '%Cloud API%' OR name ILIKE '%Oficial%';
--   (Reverting api_type back to 'evolution' — only do this if truly intended)
--
-- Idempotent: the WHERE clause matches only connections in the wrong state;
--   re-running on an already-corrected row is a no-op (api_type='official' ≠ 'evolution').

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Correct api_type and api_url for Cloud API connections
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_updated INTEGER;
  v_conn    RECORD;
BEGIN
  -- Log which rows will be affected before updating
  FOR v_conn IN
    SELECT id, name, api_type, api_url, is_active
      FROM zapp.whatsapp_connections
     WHERE (name ILIKE '%Cloud API%' OR name ILIKE '%Oficial%')
       AND api_type = 'evolution'
  LOOP
    RAISE NOTICE 'M42 STEP 1: correcting connection id=%, name=%, is_active=%',
      v_conn.id, v_conn.name, v_conn.is_active;
  END LOOP;

  UPDATE zapp.whatsapp_connections
     SET api_type   = 'official',
         api_url    = 'https://graph.facebook.com/v21.0',
         updated_at = pg_catalog.now()
   WHERE (name ILIKE '%Cloud API%' OR name ILIKE '%Oficial%')
     AND api_type = 'evolution';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    RAISE NOTICE 'M42 STEP 1: % connection(s) corrected — api_type=evolution → official; api_url set to Meta Graph API ✓', v_updated;
  ELSE
    RAISE NOTICE 'M42 STEP 1: no mismatched connections found (already corrected or none exist) ✓';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_mismatch_count INTEGER;
  v_ok             BOOLEAN := TRUE;
  v_report         TEXT    := '';
BEGIN
  -- Check no connections remain with Cloud API name but evolution type
  SELECT COUNT(*)
    INTO v_mismatch_count
    FROM zapp.whatsapp_connections
   WHERE (name ILIKE '%Cloud API%' OR name ILIKE '%Oficial%')
     AND api_type = 'evolution';

  IF v_mismatch_count = 0 THEN
    v_report := v_report || E'\n  [OK]   F6-15: 0 connections with Cloud API name + evolution type ✓';
  ELSE
    v_report := v_report || format(
      E'\n  [FAIL] F6-15: %s connection(s) still have Cloud API name + api_type=evolution',
      v_mismatch_count
    );
    v_ok := FALSE;
  END IF;

  -- Informational: show all official connections
  DECLARE
    v_official_count INTEGER;
  BEGIN
    SELECT COUNT(*) INTO v_official_count
      FROM zapp.whatsapp_connections
     WHERE api_type = 'official';
    v_report := v_report || format(E'\n  [INFO] M42: %s official-type connection(s) in whatsapp_connections', v_official_count);
  END;

  RAISE NOTICE E'M42 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M42 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
