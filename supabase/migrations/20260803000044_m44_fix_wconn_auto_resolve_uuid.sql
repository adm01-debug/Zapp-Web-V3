-- M44: Fix fn_wconn_status_auto_resolve — UUID namespace mismatch
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem:
--   zapp.fn_wconn_status_auto_resolve() (defined in M26) fires AFTER UPDATE OF status
--   ON zapp.whatsapp_connections. When a connection transitions to 'connected', it
--   attempts to auto-resolve open evolution_alerts:
--
--     UPDATE zapp.evolution_alerts
--        SET resolved_at = ..., updated_at = ...
--      WHERE instance_id = NEW.id          ← BUG: NEW.id is whatsapp_connections.id
--        AND resolved_at IS NULL
--        AND alert_type IN (...);
--
--   But evolution_alerts.instance_id is a UUID FK referencing zapp.instance_registry(id)
--   (confirmed in M26 CREATE TABLE, line 595–608).
--   NEW.id is whatsapp_connections.id — a DIFFERENT UUID namespace.
--   The WHERE predicate NEVER matches any row → alerts are never auto-resolved.
--
--   Additionally, M26's function declares:
--     SET search_path TO pg_catalog, zapp, evo, public
--   which violates project hardening rules: 'evo' and 'public' must not appear in
--   SECURITY DEFINER search_path.
--
-- Root cause (same class as M35 P0, fixed by M39):
--   M39 fixed fn_check_instance_health_watchdog by JOINing instance_registry
--   to obtain registry_id. fn_wconn_status_auto_resolve was never updated
--   with the same correction.
--
-- Fix:
--   1. JOIN zapp.instance_registry ON instance_name to obtain the correct
--      instance_registry.id (the UUID stored in evolution_alerts.instance_id).
--   2. Guard: if instance_name IS NULL or no matching registry row exists,
--      log and return TRIGGER without error (fail-safe).
--   3. Fix search_path: remove 'evo' and 'public' — use only 'pg_catalog', 'zapp'.
--   4. Re-bind the trigger (DROP IF EXISTS + CREATE) to replace the M26 binding.
--
-- Idempotent: CREATE OR REPLACE + DROP/CREATE trigger; safe to re-run.
--
-- Rollback:
--   Re-apply the M26 STEP 4 CREATE OR REPLACE to restore the old (broken) version.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — CREATE OR REPLACE fn_wconn_status_auto_resolve with correct UUID lookup
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_wconn_status_auto_resolve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp'
AS $fn$
DECLARE
  v_registry_id UUID;
BEGIN
  IF NEW.status = 'connected' AND (OLD.status IS DISTINCT FROM 'connected') THEN

    -- Guard: whatsapp_connections.instance_name may be NULL for official-API connections
    -- that were never provisioned in Evolution (no instance_registry row expected).
    IF NEW.instance_name IS NULL THEN
      RAISE NOTICE 'fn_wconn_status_auto_resolve: connection id=% has NULL instance_name — skipping alert resolution',
        NEW.id;
      RETURN NEW;
    END IF;

    -- Look up the instance_registry.id that corresponds to this connection's instance_name.
    -- evolution_alerts.instance_id FK references instance_registry(id), NOT whatsapp_connections(id).
    SELECT ir.id INTO v_registry_id
      FROM zapp.instance_registry ir
     WHERE ir.instance_name = NEW.instance_name
     LIMIT 1;

    IF v_registry_id IS NULL THEN
      -- No registry row found — instance was never provisioned or already removed.
      -- Silently skip; this is not an error condition.
      RAISE NOTICE 'fn_wconn_status_auto_resolve: no instance_registry row for instance_name=% (connection id=%) — skipping alert resolution',
        NEW.instance_name, NEW.id;
      RETURN NEW;
    END IF;

    -- Resolve all open disconnection/auth_failure/health_degraded alerts for this instance.
    UPDATE zapp.evolution_alerts
       SET resolved_at = pg_catalog.now(),
           updated_at  = pg_catalog.now()
     WHERE instance_id = v_registry_id        -- FK to instance_registry.id (correct UUID)
       AND resolved_at IS NULL
       AND alert_type IN ('disconnection', 'auth_failure', 'health_degraded');

    RAISE NOTICE 'fn_wconn_status_auto_resolve: resolved open alerts for instance_name=% (registry_id=%)',
      NEW.instance_name, v_registry_id;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_wconn_status_auto_resolve()
  IS 'Trigger: auto-resolves open evolution_alerts when a whatsapp_connections row '
     'transitions to status=connected. Looks up instance_registry.id via instance_name '
     'to resolve the correct UUID (evolution_alerts.instance_id FK → instance_registry.id, '
     'NOT whatsapp_connections.id). M44 fix: UUID namespace correction + search_path hardening.';

REVOKE EXECUTE ON FUNCTION zapp.fn_wconn_status_auto_resolve() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_wconn_status_auto_resolve() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Re-bind trigger (DROP IF EXISTS + CREATE to pick up the new function body)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_wconn_auto_resolve_alerts ON zapp.whatsapp_connections;

CREATE TRIGGER trg_wconn_auto_resolve_alerts
  AFTER UPDATE OF status ON zapp.whatsapp_connections
  FOR EACH ROW
  EXECUTE FUNCTION zapp.fn_wconn_status_auto_resolve();

DO $$ BEGIN RAISE NOTICE 'M44 STEP 2: trigger trg_wconn_auto_resolve_alerts re-bound ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_secdef  BOOLEAN;
  v_fn_body    TEXT;
  v_fn_sp      TEXT;
  v_trg_exists BOOLEAN;
  v_ok         BOOLEAN := TRUE;
  v_report     TEXT    := '';
BEGIN
  SELECT p.prosecdef, pg_catalog.pg_get_functiondef(p.oid)
    INTO v_fn_secdef, v_fn_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_wconn_status_auto_resolve'
   LIMIT 1;

  IF v_fn_body IS NULL THEN
    v_report := v_report || E'\n  [FAIL] M44: fn_wconn_status_auto_resolve NOT FOUND';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   M44: fn_wconn_status_auto_resolve exists ✓';

    IF v_fn_secdef IS TRUE THEN
      v_report := v_report || E'\n  [OK]   M44: SECURITY DEFINER ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M44: NOT SECURITY DEFINER';
      v_ok := FALSE;
    END IF;

    -- search_path must NOT contain 'evo' or 'public'
    IF v_fn_body ~* 'set search_path[^;]*(''evo''|, evo |,evo,)' THEN
      v_report := v_report || E'\n  [FAIL] M44: search_path still contains evo';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M44: search_path free of evo ✓';
    END IF;

    IF v_fn_body ~* 'set search_path[^;]*(''public''|, public |,public,)' THEN
      v_report := v_report || E'\n  [FAIL] M44: search_path still contains public';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M44: search_path free of public ✓';
    END IF;

    -- Must NOT use NEW.id in the evolution_alerts WHERE clause
    IF v_fn_body ~* 'instance_id\s*=\s*NEW\.id' THEN
      v_report := v_report || E'\n  [FAIL] M44: still uses instance_id = NEW.id (wrong UUID namespace)';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M44: no instance_id = NEW.id in function body ✓';
    END IF;

    -- Must use v_registry_id for the evolution_alerts WHERE clause
    IF v_fn_body ~* 'instance_id\s*=\s*v_registry_id' THEN
      v_report := v_report || E'\n  [OK]   M44: uses instance_id = v_registry_id (correct UUID) ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M44: v_registry_id not found in evolution_alerts WHERE clause';
      v_ok := FALSE;
    END IF;

    -- Must JOIN instance_registry to resolve UUID
    IF position('instance_registry' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M44: references instance_registry for UUID lookup ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M44: no instance_registry reference (UUID lookup missing)';
      v_ok := FALSE;
    END IF;
  END IF;

  -- Trigger existence check
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'zapp'
       AND c.relname = 'whatsapp_connections'
       AND t.tgname  = 'trg_wconn_auto_resolve_alerts'
       AND NOT t.tgisinternal
  ) INTO v_trg_exists;

  IF v_trg_exists THEN
    v_report := v_report || E'\n  [OK]   M44: trg_wconn_auto_resolve_alerts trigger active ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] M44: trg_wconn_auto_resolve_alerts trigger NOT FOUND';
    v_ok := FALSE;
  END IF;

  RAISE NOTICE E'M44 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M44 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
