-- =============================================================================
-- Migration: 20260703190000_fix_idempotency_cleanup_and_drop_instance_default
-- Description:
--   MELHORIA 2: Fix cleanup_evolution_send_idempotency to delete from base table
--   MELHORIA 3: Drop hardcoded DEFAULT 'wpp2' from instance_name column
-- Applied: 2026-07-03 (via exhaustive 200-commit audit)
-- =============================================================================

-- ----------------------------------------------------------------------------
-- MELHORIA 2: cleanup_evolution_send_idempotency
--
-- BUG: The function deleted from public.evolution_send_idempotency (VIEW).
-- PostgreSQL auto-rewrites this DELETE to the base table today — but only because
-- the view is currently simple. If the view gains a WHERE clause, JOIN, or
-- security filter, the function would silently stop deleting rows.
-- Targeting the base table directly is explicit and immune to future view changes.
--
-- ALSO FIXED: Added SET search_path = evo, public (required for SECURITY DEFINER
-- per hardening standard in PR #102).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_evolution_send_idempotency()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  -- Delete directly from the base table, not the public.evolution_send_idempotency VIEW.
  DELETE FROM evo.evolution_send_idempotency
  WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ----------------------------------------------------------------------------
-- MELHORIA 3: Drop DEFAULT 'wpp2' from evo.evolution_messages.instance_name
--
-- BUG: Any INSERT omitting instance_name silently attributed data to 'wpp2',
-- the primary production instance — silent data corruption for multi-instance setups.
--
-- SAFE: Column is NOT NULL. Dropping DEFAULT means omitting instance_name in
-- an INSERT will now raise a proper NOT NULL violation instead of corrupt data.
-- All INSERT paths (edge functions) provide instance_name from webhook payload.
-- ----------------------------------------------------------------------------
ALTER TABLE evo.evolution_messages
  ALTER COLUMN instance_name DROP DEFAULT;

-- Verify
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'evo'
      AND table_name   = 'evolution_messages'
      AND column_name  = 'instance_name'
      AND column_default IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: instance_name still has a DEFAULT value';
  END IF;
  RAISE NOTICE 'OK: instance_name DEFAULT removed. NOT NULL constraint enforced.';
END;
$$;
