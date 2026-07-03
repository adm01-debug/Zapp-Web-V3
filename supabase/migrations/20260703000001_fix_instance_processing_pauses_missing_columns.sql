-- Migration: add missing columns to instance_processing_pauses
-- Root cause: auto_pause_instance_on_auth_spike() references trigger_count,
-- auto_paused and updated_at but the table was created without them, causing
-- the RPC to fail with:
--   [Warning] [auto-pause] rpc failed: column "trigger_count" of relation
--   "instance_processing_pauses" does not exist
-- This is idempotent (IF NOT EXISTS guards on each ADD COLUMN).

DO $$
BEGIN
  -- 1. Add trigger_count (count of events that triggered this auto-pause)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp'
      AND table_name   = 'instance_processing_pauses'
      AND column_name  = 'trigger_count'
  ) THEN
    ALTER TABLE zapp.instance_processing_pauses
      ADD COLUMN trigger_count integer NOT NULL DEFAULT 0;
  END IF;

  -- 2. Add auto_paused flag (distinguishes human vs. automated pauses)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp'
      AND table_name   = 'instance_processing_pauses'
      AND column_name  = 'auto_paused'
  ) THEN
    ALTER TABLE zapp.instance_processing_pauses
      ADD COLUMN auto_paused boolean NOT NULL DEFAULT false;
  END IF;

  -- 3. Add updated_at (tracks last extend/re-trigger time)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp'
      AND table_name   = 'instance_processing_pauses'
      AND column_name  = 'updated_at'
  ) THEN
    ALTER TABLE zapp.instance_processing_pauses
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END;
$$;

-- 4. Recreate public repoint view to expose the new columns
CREATE OR REPLACE VIEW public.instance_processing_pauses AS
SELECT
  id,
  instance_name,
  paused_by,
  reason,
  paused_at,
  resumed_at,
  paused_until,
  trigger_count,
  auto_paused,
  updated_at
FROM zapp.instance_processing_pauses;

-- 5. Restore grants (view inherits nothing; must be explicit)
GRANT SELECT, INSERT, UPDATE ON public.instance_processing_pauses TO service_role;
GRANT SELECT ON public.instance_processing_pauses TO anon, authenticated;
