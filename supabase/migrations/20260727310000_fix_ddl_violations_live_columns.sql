-- Migration: 20260727310000_fix_ddl_violations_live_columns
-- Purpose: Migration 20260727000001 created ops.ddl_violations_live with a
--          minimal column set (id, schema_name, object_type, object_name,
--          ddl_sql, pid, username, created_at). Migration 20260727300001
--          attempted CREATE TABLE IF NOT EXISTS with a complete column set
--          including detected_at, command_tag, resolved, resolved_at, notes —
--          but IF NOT EXISTS is a silent no-op, so those columns were never
--          added. Views and functions in 300001+ reference these missing columns
--          causing runtime errors.
--
-- Fix: ADD COLUMN IF NOT EXISTS for all columns defined in 300001 that are
--      missing from the 000001 table, then recreate the view.
-- Risk: LOW — all ADDs are IF NOT EXISTS / non-destructive.
-- Rollback: ALTER TABLE ops.ddl_violations_live DROP COLUMN detected_at,
--           DROP COLUMN created_by, DROP COLUMN command_tag, DROP COLUMN resolved,
--           DROP COLUMN resolved_at, DROP COLUMN notes;

SET search_path = ops;

-- Add columns that 300001 expected but 000001 never created
ALTER TABLE ops.ddl_violations_live
  ADD COLUMN IF NOT EXISTS detected_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by   text        NOT NULL DEFAULT session_user,
  ADD COLUMN IF NOT EXISTS command_tag  text,
  ADD COLUMN IF NOT EXISTS resolved     boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS notes        text;

-- Backfill detected_at from created_at for pre-existing rows
-- (both columns represent the same moment; created_at was the 000001 column)
UPDATE ops.ddl_violations_live
SET detected_at = created_at
WHERE detected_at IS DISTINCT FROM created_at
  AND created_at IS NOT NULL;

-- Recreate the view that 300001 defined — it references resolved and
-- detected_at which now exist in the physical table
CREATE OR REPLACE VIEW ops.v_ddl_violations_unresolved
WITH (security_invoker = on) AS
SELECT
    id,
    detected_at,
    schema_name,
    object_name,
    object_type,
    created_by,
    now() - detected_at AS age
FROM ops.ddl_violations_live
WHERE resolved = false
ORDER BY detected_at DESC;

COMMENT ON VIEW ops.v_ddl_violations_unresolved IS
  'Unresolved DDL violations (objects outside migration flow). '
  'Populated by ops.fn_guardrails_check via the ops-guardrails-deadman cron.';
