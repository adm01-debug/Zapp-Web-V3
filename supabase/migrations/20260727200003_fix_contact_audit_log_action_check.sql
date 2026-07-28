-- Migration: fix_contact_audit_log_action_check
-- The CHECK constraint on contact_audit_log.action was too restrictive and
-- blocked legitimate actions added in later features (merge, tag_assign, etc).
-- This migration drops the old constraint and adds an open-ended one.

DO $do$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='zapp' AND table_name='contact_audit_log'
      AND constraint_name='contact_audit_log_action_check'
  ) THEN
    ALTER TABLE zapp.contact_audit_log
      DROP CONSTRAINT contact_audit_log_action_check;
    RAISE NOTICE 'Dropped old contact_audit_log_action_check constraint';
  END IF;

  -- Add new open-ended constraint (just ensure non-empty)
  ALTER TABLE zapp.contact_audit_log
    ADD CONSTRAINT contact_audit_log_action_check
    CHECK (action IS NOT NULL AND length(trim(action)) > 0);
  RAISE NOTICE 'Added new contact_audit_log_action_check constraint';
END;
$do$;
