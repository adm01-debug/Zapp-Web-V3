-- Fix contact_audit_log.action CHECK constraint to include 'pii_anonymized'
--
-- The lgpd-scheduled-jobs edge function writes action='pii_anonymized' into
-- contact_audit_log for LGPD Art. 37 compliance audit trail. Without this
-- value in the CHECK constraint the INSERT silently fails (PostgreSQL raises
-- CHECK violation which is swallowed by the edge function's try/catch), making
-- the LGPD anonymization audit trail incomplete.
--
-- Supersedes the partial constraint added in 20260727120000 (which lists only
-- INSERT, UPDATE, DELETE, RESTORE, MERGE).

DO $do$
BEGIN
  -- Drop both possible constraint names: the original unnamed inline constraint
  -- (PostgreSQL assigns a generated name based on table name) and the named one
  -- added by the 20260727120000 migration.
  ALTER TABLE zapp.contact_audit_log DROP CONSTRAINT IF EXISTS contact_audit_log_action_check;
  ALTER TABLE zapp.contact_audit_log DROP CONSTRAINT IF EXISTS zapp_contact_audit_log_action_check;

  -- Add the authoritative constraint with all valid action values, including
  -- 'pii_anonymized' for LGPD-mandated audit entries.
  ALTER TABLE zapp.contact_audit_log
    ADD CONSTRAINT zapp_contact_audit_log_action_check
    CHECK (action IN (
      'INSERT',
      'UPDATE',
      'DELETE',
      'RESTORE',
      'MERGE',
      'pii_anonymized'
    ));
END $do$;
