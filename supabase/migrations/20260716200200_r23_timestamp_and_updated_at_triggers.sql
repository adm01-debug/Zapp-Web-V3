-- ============================================================
-- Migration: 20260716200200_r23_timestamp_and_updated_at_triggers
-- Purpose  : E7/E9 – Fix plain timestamps + add missing updated_at triggers
-- Applied  : 2026-07-16
-- Idempotent: YES
-- ============================================================

-- PART 1: Fix plain timestamps to TIMESTAMPTZ
-- Note: extensions, message_audit_log, tenants have views that block ALTER
--       those require DROP+recreate of the dependent view (next session)

ALTER TABLE zapp._lgpd_retention_policies
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'America/Sao_Paulo';

-- PART 2: Generic updated_at trigger function
CREATE OR REPLACE FUNCTION zapp.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PART 3: Create missing updated_at triggers (7 tables)
DO $block$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'companies',
    'department_invitations',
    'email_health_summary',
    'integration_profiles',
    'system_kill_switches',
    '_vault_corrupted_quarantine',
    '_lgpd_retention_policies'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format($f$
      DROP TRIGGER IF EXISTS trg_%I_updated_at ON zapp.%I;
      CREATE TRIGGER trg_%I_updated_at
        BEFORE UPDATE ON zapp.%I
        FOR EACH ROW EXECUTE FUNCTION zapp.fn_set_updated_at();
    $f$, t, t, t, t);
  END LOOP;
END;
$block$;

-- PENDING (next session) - views blocking timestamp type conversion:
-- zapp.extensions.updated_at (view: extensions)
-- zapp.message_audit_log.deleted_at (view: message_audit_log)
-- zapp.tenants.updated_at (view: tenants)

-- Verification
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE n.nspname='zapp' AND p.proname='fn_set_updated_at';
  IF v_count < 7 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: expected 7 updated_at triggers, got %', v_count;
  END IF;
  RAISE NOTICE 'OK: % fn_set_updated_at triggers active', v_count;
END $$;
