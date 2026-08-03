-- M45: Fix fn_alert_instance_disconnection_watchdog — P2 (INNER JOIN) + P3 (dead field)
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem:
--   M39 fixed M35's UUID namespace mismatch and search_path, but introduced two
--   remaining issues:
--
--   P2 (M39:77): INNER JOIN on instance_registry silently drops active Evolution
--       connections that have no corresponding row in zapp.instance_registry.
--       A connection can be active (is_active=TRUE, api_type='evolution') but never
--       have been provisioned in instance_registry (e.g. orphaned connections from
--       F6-14, connections created before the registry was populated, or connections
--       whose instance was deleted from Evolution but the whatsapp_connections row
--       persists). The INNER JOIN makes the watchdog blind to these instances —
--       they are disconnected and will never generate an alert.
--
--   P3 (M39:71): wc.id AS wconn_id is selected in the FOR loop but never referenced
--       in the function body. v_conn.wconn_id is never used after the SELECT —
--       not in the anti-flood guard (uses registry_id), not in the alert call
--       (uses registry_id), not in RAISE NOTICE (uses instance_name/registry_id).
--       Dead field selection adds noise to the record type without purpose.
--
-- Fix:
--   1. P2: Change JOIN → LEFT JOIN. After the connected-status CONTINUE, add an
--      explicit guard: IF v_conn.registry_id IS NULL → RAISE NOTICE + v_skipped++
--      + CONTINUE. This ensures no alert is silently suppressed and operators see
--      the warning in pg logs.
--   2. P3: Remove wc.id AS wconn_id from the SELECT list.
--   3. Verification block uses position() instead of ~* '\bname\b' (PostgreSQL
--      regex \b is a backspace char, not a word boundary anchor — M39 verification
--      had this bug but was harmless there; avoid repeating it).
--
-- Idempotent: CREATE OR REPLACE; safe to re-run.
--
-- Rollback:
--   Re-apply M39 STEP 1 CREATE OR REPLACE to restore the M39 version.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — CREATE OR REPLACE with P2 + P3 fixes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_alert_instance_disconnection_watchdog(
  p_instance_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp'
AS $fn$
DECLARE
  v_conn          RECORD;
  v_flooded       BOOLEAN;
  v_alerted       INTEGER := 0;
  v_skipped       INTEGER := 0;
  v_instance_info TEXT;
BEGIN
  -- Iterate active Evolution API connections, LEFT JOINed to instance_registry.
  -- LEFT JOIN (P2 fix): connections without an instance_registry row are included
  -- in the loop so they can be explicitly logged and skipped — not silently dropped.
  -- evolution_alerts.instance_id references instance_registry.id, NOT
  -- whatsapp_connections.id — they are different UUID namespaces.
  -- wc.id removed from SELECT (P3 fix): wconn_id was never referenced in the body.
  FOR v_conn IN
    SELECT
      ir.id          AS registry_id,
      wc.instance_name,
      wc.display_name,
      wc.status
    FROM zapp.whatsapp_connections wc
    LEFT JOIN zapp.instance_registry ir ON ir.instance_name = wc.instance_name
    WHERE wc.is_active = TRUE
      AND wc.api_type  = 'evolution'
      AND (p_instance_name IS NULL OR wc.instance_name = p_instance_name)
  LOOP
    -- Only alert when the instance is not connected
    IF v_conn.status IS NOT DISTINCT FROM 'connected' THEN
      CONTINUE;
    END IF;

    -- P2 fix: no instance_registry row → log warning and skip.
    -- We cannot raise an alert without a valid registry UUID (FK target).
    IF v_conn.registry_id IS NULL THEN
      RAISE NOTICE 'fn_alert_instance_disconnection_watchdog: active Evolution connection ''%'' has no instance_registry row — skipping alert (P2 fix; provision instance or add registry row)',
        v_conn.instance_name;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Anti-flood: skip if an unresolved disconnection alert was raised in the last 60 min.
    -- evolution_alerts.instance_id is a FK to instance_registry.id → use registry_id.
    SELECT EXISTS (
      SELECT 1
        FROM zapp.evolution_alerts ea
       WHERE ea.instance_id = v_conn.registry_id
         AND ea.alert_type  = 'disconnection'
         AND ea.resolved_at IS NULL
         AND ea.created_at  > pg_catalog.now() - INTERVAL '60 minutes'
    ) INTO v_flooded;

    IF v_flooded THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Build context string for the alert message
    v_instance_info := pg_catalog.coalesce(v_conn.display_name, v_conn.instance_name);

    -- Raise the alert using the single-alert helper (M26).
    -- p_instance_id must be instance_registry.id (v_conn.registry_id).
    PERFORM zapp.fn_alert_instance_disconnection(
      v_conn.registry_id,                              -- p_instance_id  UUID (instance_registry.id)
      'disconnection',                                  -- p_alert_type   TEXT
      'Instance disconnected: ' || v_instance_info,    -- p_message       TEXT
      pg_catalog.jsonb_build_object(
        'instance_name', v_conn.instance_name,
        'display_name',  v_conn.display_name,
        'status',        v_conn.status,
        'detected_at',   pg_catalog.now()
      )                                                 -- p_details       JSONB
    );

    v_alerted := v_alerted + 1;
    RAISE NOTICE 'M45 ALERT: disconnection alert raised for instance % (registry_id: %)',
      v_conn.instance_name, v_conn.registry_id;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'alerted',     v_alerted,
    'skipped',     v_skipped,
    'checked_at',  pg_catalog.now()
  );
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_alert_instance_disconnection_watchdog(text)
  IS 'Watchdog (M35/M39/M45 fix/F6-06): iterates all active Evolution connections (LEFT '
     'JOINed to instance_registry — P2 fix: INNER JOIN silently dropped unregistered '
     'instances) and fires disconnection alerts for any instance not in connected state. '
     'Anti-flood: skips instances with unresolved alerts in last 60 minutes. '
     'Connections without registry rows: logged and skipped (not silently dropped). '
     'wconn_id removed from SELECT (P3 fix: dead field). '
     'SECURITY DEFINER SET search_path = pg_catalog, zapp.';

REVOKE EXECUTE ON FUNCTION zapp.fn_alert_instance_disconnection_watchdog(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_alert_instance_disconnection_watchdog(text) TO service_role;

DO $$ BEGIN RAISE NOTICE 'M45 STEP 1: fn_alert_instance_disconnection_watchdog replaced (P2+P3 fix) ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_secdef  BOOLEAN;
  v_fn_body    TEXT;
  v_ok         BOOLEAN := TRUE;
  v_report     TEXT    := '';
BEGIN
  SELECT p.prosecdef, pg_catalog.pg_get_functiondef(p.oid)
    INTO v_fn_secdef, v_fn_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_alert_instance_disconnection_watchdog'
   LIMIT 1;

  IF v_fn_body IS NULL THEN
    v_report := v_report || E'\n  [FAIL] M45: fn_alert_instance_disconnection_watchdog NOT FOUND';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   M45: fn_alert_instance_disconnection_watchdog exists ✓';

    IF v_fn_secdef IS TRUE THEN
      v_report := v_report || E'\n  [OK]   M45: SECURITY DEFINER ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M45: NOT SECURITY DEFINER';
      v_ok := FALSE;
    END IF;

    -- P2 fix: must use LEFT JOIN (not INNER JOIN) on instance_registry
    IF position('left join' IN lower(v_fn_body)) > 0
       AND position('instance_registry' IN lower(v_fn_body)) > 0
    THEN
      v_report := v_report || E'\n  [OK]   M45/P2: LEFT JOIN instance_registry present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M45/P2: LEFT JOIN instance_registry not found — INNER JOIN may still be present';
      v_ok := FALSE;
    END IF;

    -- P2 fix: must have NULL registry_id guard
    IF position('registry_id is null' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M45/P2: NULL registry_id guard present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M45/P2: NULL registry_id guard missing';
      v_ok := FALSE;
    END IF;

    -- P3 fix: wconn_id must NOT appear in function body
    IF position('wconn_id' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [FAIL] M45/P3: wconn_id still present in function body (dead field not removed)';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M45/P3: wconn_id removed (dead field eliminated) ✓';
    END IF;

    -- Must still use registry_id for anti-flood and alert call
    IF position('instance_id = v_conn.registry_id' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M45: anti-flood uses registry_id ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M45: anti-flood does not use registry_id';
      v_ok := FALSE;
    END IF;

    IF position('fn_alert_instance_disconnection(' IN lower(v_fn_body)) > 0
       AND position('v_conn.registry_id' IN lower(v_fn_body)) > 0
    THEN
      v_report := v_report || E'\n  [OK]   M45: alert call uses registry_id ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M45: alert call does not use registry_id';
      v_ok := FALSE;
    END IF;

    -- search_path must NOT contain 'evo' or 'public'
    IF position(', ''evo''' IN lower(v_fn_body)) > 0
       OR position(', ''public''' IN lower(v_fn_body)) > 0
    THEN
      v_report := v_report || E'\n  [FAIL] M45: search_path still contains evo or public';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M45: search_path free of evo/public ✓';
    END IF;
  END IF;

  RAISE NOTICE E'M45 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M45 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
