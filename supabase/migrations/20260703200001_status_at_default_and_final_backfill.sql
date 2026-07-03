-- =============================================================================
-- Migration: 20260703200001_status_at_default_and_final_backfill
-- Sequel to: 20260703200000_backfill_status_at.sql
--
-- After the main backfill, 17 rows were inserted (by the edge function
-- processing webhook events) with status_at IS NULL. Root cause: the base
-- table had no DEFAULT on status_at, so new INSERTs from the edge function
-- (which write to evo.evolution_messages directly) got NULL.
--
-- Fix:
--   1. Add DEFAULT now() to status_at — any future INSERT that omits
--      status_at gets the current timestamp automatically.
--   2. Backfill the 17 residual rows.
-- =============================================================================

-- 1. Add DEFAULT so future INSERTs always have status_at populated
ALTER TABLE evo.evolution_messages
  ALTER COLUMN status_at SET DEFAULT now();

-- 2. Backfill any remaining NULLs (idempotent)
UPDATE evo.evolution_messages
SET status_at = COALESCE(updated_at, created_at, now())
WHERE status_at IS NULL;

-- Verify: zero NULLs remain
DO $$
DECLARE v_remaining bigint;
BEGIN
  SELECT count(*) INTO v_remaining FROM evo.evolution_messages WHERE status_at IS NULL;
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % rows still have status_at IS NULL', v_remaining;
  END IF;
  RAISE NOTICE 'OK: status_at = 0 NULLs. DEFAULT now() set for future INSERTs.';
END;
$$;
