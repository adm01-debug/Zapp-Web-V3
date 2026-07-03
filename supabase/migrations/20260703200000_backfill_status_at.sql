-- =============================================================================
-- Migration: 20260703200000_backfill_status_at
-- Description: Backfill status_at for 1,784,312 historical messages
--
-- Background:
--   The status_at column was added after the bulk of messages were created.
--   The messages_update_trigger also had a bug (fixed in 20260703180000_*)
--   that prevented status_at from being populated on updates.
--   Result: 1,784,312 rows with status_at IS NULL.
--
-- Fix:
--   Uses COALESCE(updated_at, created_at) as best available proxy:
--     - updated_at: when the message row was last modified (best signal)
--     - created_at: when the row was inserted (fallback for never-updated rows)
--
-- This migration is idempotent: running it again updates 0 rows.
-- =============================================================================

UPDATE evo.evolution_messages
SET status_at = COALESCE(updated_at, created_at)
WHERE status_at IS NULL;

-- Verify
DO $$
DECLARE
  v_remaining bigint;
BEGIN
  SELECT count(*) INTO v_remaining FROM evo.evolution_messages WHERE status_at IS NULL;
  IF v_remaining > 0 THEN
    RAISE WARNING 'backfill_status_at: % rows still have status_at IS NULL after migration', v_remaining;
  ELSE
    RAISE NOTICE 'OK: backfill_status_at complete. All rows have status_at populated.';
  END IF;
END;
$$;
