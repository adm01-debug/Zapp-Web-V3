-- M50: Fix fn_wconn_status_auto_resolve — search_path + UUID namespace mismatch
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problems (M26 STEP 4):
--
--   P1 — search_path includes 'evo' and 'public' (hardening violation):
--     M26 set:
--       SET search_path TO pg_catalog, zapp, evo, public
--     Project rule: SECURITY DEFINER functions must NOT include 'evo' or 'public'.
--     The function accesses only zapp.evolution_alerts and zapp.instance_registry
--     (both in zapp schema). Neither 'evo' nor 'public' is required.
--     Including them allows shadow-object attacks: an attacker could place a
--     zapp.evo.evolution_alerts surrogate to intercept the UPDATE.
--
--   P2 — UUID namespace mismatch (M26:729):
--     The function uses:
--       WHERE instance_id = NEW.id
--     But:
--       - evolution_alerts.instance_id is FK to instance_registry.id (UUID)
--       - NEW.id is whatsapp_connections.id (different UUID namespace)
--     These two UUIDs are never equal in practice — the UPDATE always matches
--     0 rows. Disconnection alerts are NEVER auto-resolved when an instance
--     reconnects, causing permanent alert backlog (F6-08 root cause).
--
--     Fix: look up instance_registry.id via instance_name (the common key
--     between whatsapp_connections and instance_registry).
--
-- Fix:
--   1. CREATE OR REPLACE with SET search_path TO 'pg_catalog', 'zapp'.
--   2. SELECT ir.id FROM zapp.instance_registry WHERE ir.instance_name = NEW.instance_name
--      to obtain v_registry_id; use that in the UPDATE predicate.
--
-- Idempotent: CREATE OR REPLACE function; trigger trg_wconn_auto_resolve_alerts
--   was already created by M26 and continues pointing to the same function.
--
-- Rollback:
--   Restore M26 STEP 4 CREATE OR REPLACE (restores buggy version).
--   Not recommended — P1 and P2 both return.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Replace fn_wconn_status_auto_resolve with corrected version
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_wconn_status_auto_resolve()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp'
AS $fn$
DECLARE
  v_registry_id UUID;
  v_resolved    INT := 0;
BEGIN
  -- Only act when transitioning TO 'connected' (from a non-connected state).
  IF NEW.status IS DISTINCT FROM 'connected'
  OR OLD.status IS NOT DISTINCT FROM 'connected' THEN
    RETURN NEW;
  END IF;

  -- Look up the instance_registry.id for this whatsapp_connection.
  -- evolution_alerts.instance_id is FK to instance_registry.id, NOT to
  -- whatsapp_connections.id — these are different UUID namespaces.
  -- instance_name is the shared key between the two tables.
  SELECT ir.id INTO v_registry_id
    FROM zapp.instance_registry ir
   WHERE ir.instance_name = NEW.instance_name
   LIMIT 1;

  IF v_registry_id IS NULL THEN
    -- Connection has no instance_registry row (orphaned connection — F6-14).
    -- Log and skip gracefully; do not fail the UPDATE trigger.
    RAISE NOTICE
      'fn_wconn_status_auto_resolve: no instance_registry row for instance_name=%, '
      'disconnection alerts not auto-resolved',
      NEW.instance_name;
    RETURN NEW;
  END IF;

  -- Resolve all open disconnection-class alerts for this instance.
  UPDATE zapp.evolution_alerts
     SET resolved_at = pg_catalog.now(),
         updated_at  = pg_catalog.now()
   WHERE instance_id = v_registry_id
     AND resolved_at IS NULL
     AND alert_type IN ('disconnection', 'auth_failure', 'health_degraded');

  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  IF v_resolved > 0 THEN
    RAISE NOTICE
      'fn_wconn_status_auto_resolve: resolved % alert(s) for instance_name=% (registry_id=%)',
      v_resolved, NEW.instance_name, v_registry_id;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_wconn_status_auto_resolve()
  IS 'AFTER UPDATE OF status trigger (M26/M50 fix/F6-08): auto-resolves open '
     'disconnection alerts in zapp.evolution_alerts when a whatsapp_connection '
     'transitions to connected. Looks up instance_registry.id via instance_name '
     '(correct UUID namespace). M50 fix: removed evo/public from search_path; '
     'replaced NEW.id with instance_registry.id lookup (P2 UUID namespace mismatch).';

REVOKE EXECUTE ON FUNCTION zapp.fn_wconn_status_auto_resolve() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_wconn_status_auto_resolve() TO service_role;

DO $$ BEGIN RAISE NOTICE 'M50 STEP 1: fn_wconn_status_auto_resolve replaced (search_path=pg_catalog,zapp; UUID fix) ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_secdef  BOOLEAN;
  v_proconfig  TEXT;
  v_trg_exists BOOLEAN;
  v_ok         BOOLEAN := TRUE;
  v_report     TEXT    := '';
BEGIN
  -- Function: exists, is SECURITY DEFINER, search_path correct
  SELECT p.prosecdef,
         pg_catalog.array_to_string(p.proconfig, ', ')
    INTO v_fn_secdef, v_proconfig
    FROM pg_catalog.pg_proc     p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_wconn_status_auto_resolve'
   LIMIT 1;

  IF v_fn_secdef IS NULL THEN
    v_report := v_report || E'\n  [FAIL] M50: fn_wconn_status_auto_resolve NOT FOUND';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   M50: fn_wconn_status_auto_resolve exists ✓';

    IF v_fn_secdef THEN
      v_report := v_report || E'\n  [OK]   M50: SECURITY DEFINER ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M50: NOT SECURITY DEFINER';
      v_ok := FALSE;
    END IF;

    -- P1: search_path must contain zapp
    IF v_proconfig IS NOT NULL AND position('zapp' IN v_proconfig) > 0 THEN
      v_report := v_report || E'\n  [OK]   M50/P1: search_path contains zapp ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M50/P1: search_path missing zapp';
      v_ok := FALSE;
    END IF;

    -- P1: search_path must NOT contain 'evo'
    IF v_proconfig IS NOT NULL AND position('evo' IN v_proconfig) > 0 THEN
      v_report := v_report || E'\n  [FAIL] M50/P1: search_path still contains evo';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M50/P1: search_path free of evo ✓';
    END IF;

    -- P1: search_path must NOT contain 'public'
    IF v_proconfig IS NOT NULL AND position('public' IN v_proconfig) > 0 THEN
      v_report := v_report || E'\n  [FAIL] M50/P1: search_path still contains public';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M50/P1: search_path free of public ✓';
    END IF;
  END IF;

  -- Trigger: must exist on whatsapp_connections
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger   t
      JOIN pg_catalog.pg_class     c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'zapp'
       AND c.relname = 'whatsapp_connections'
       AND t.tgname  = 'trg_wconn_auto_resolve_alerts'
       AND NOT t.tgisinternal
  ) INTO v_trg_exists;

  IF v_trg_exists THEN
    v_report := v_report || E'\n  [OK]   M50: trg_wconn_auto_resolve_alerts trigger exists ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] M50: trg_wconn_auto_resolve_alerts trigger NOT FOUND (was it created by M26?)';
    v_ok := FALSE;
  END IF;

  RAISE NOTICE E'M50 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M50 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
