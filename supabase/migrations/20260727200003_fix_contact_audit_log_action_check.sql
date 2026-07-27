-- Migration: fix_contact_audit_log_action_check
--
-- Migration 20260727120000 added zapp_contact_audit_log_action_check with only
-- TG_OP values ('INSERT','UPDATE','DELETE','RESTORE','MERGE'). The LGPD edge
-- function (lgpd-scheduled-jobs) inserts action='pii_anonymized' directly,
-- which violates the constraint and silently breaks LGPD compliance logging.
--
-- This migration drops the overly-restrictive constraint and re-adds it with
-- the full set of valid action values used across all code paths.

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'zapp.contact_audit_log'::regclass
       AND conname  = 'zapp_contact_audit_log_action_check'
  ) THEN
    ALTER TABLE zapp.contact_audit_log
      DROP CONSTRAINT zapp_contact_audit_log_action_check;
  END IF;
END $do$;

-- Re-add with the complete set:
--   TG_OP sources (trigger):   INSERT, UPDATE, DELETE
--   Manual/admin sources:      RESTORE, MERGE
--   LGPD/compliance sources:   pii_anonymized, lgpd_erasure, data_export
ALTER TABLE zapp.contact_audit_log
  ADD CONSTRAINT zapp_contact_audit_log_action_check
  CHECK (action IN (
    'INSERT', 'UPDATE', 'DELETE',
    'RESTORE', 'MERGE',
    'pii_anonymized', 'lgpd_erasure', 'data_export'
  ));

COMMENT ON CONSTRAINT zapp_contact_audit_log_action_check
  ON zapp.contact_audit_log IS
  'Valid action values: TG_OP (INSERT/UPDATE/DELETE), admin ops (RESTORE/MERGE), '
  'LGPD/compliance ops (pii_anonymized, lgpd_erasure, data_export).';
