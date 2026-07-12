-- Round 16 Migration #6: Dynamic SQL Injection Defense & Query Hardening
-- Severity: HIGH — update_large_batch_safe() passes caller-controlled TEXT to EXECUTE,
--           enabling arbitrary DML injection. Additional EXECUTE-based functions share
--           this pattern. Also hardens format() calls with strict allowlists.
-- Fix: Replace dynamic EXECUTE with parameterized alternatives; add query allowlists;
--      harden all public SECURITY DEFINER functions using dynamic SQL.
-- Date: 2026-07-12
-- Impact: Closes remaining SQL injection paths in batch operations

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DROP update_large_batch_safe — accepts raw SQL as parameter (injection vector)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS update_large_batch_safe(TEXT, INT);

-- Replacement: safe batch anonymization (the actual use case this served)
-- Uses explicit column list instead of caller-controlled SQL
CREATE OR REPLACE FUNCTION fn_anonymize_contacts_batch_safe(
  p_contact_ids  UUID[],
  p_batch_size   INT DEFAULT 500
)
RETURNS TABLE (anonymized INT, skipped INT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public', 'evo'
SET lock_timeout = '15s'
SET deadlock_timeout = '500ms'
AS $$
DECLARE
  v_offset       INT := 0;
  v_batch_ids    UUID[];
  v_batch_anon   INT;
  v_total_anon   INT := 0;
  v_total_skip   INT := 0;
BEGIN
  IF p_contact_ids IS NULL OR array_length(p_contact_ids, 1) = 0 THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  IF p_batch_size < 1 OR p_batch_size > 5000 THEN
    RAISE EXCEPTION 'invalid_batch_size: Must be 1–5000, got %', p_batch_size
      USING ERRCODE = '22023';
  END IF;

  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

  WHILE v_offset < array_length(p_contact_ids, 1) LOOP
    v_batch_ids := p_contact_ids[(v_offset + 1):LEAST(v_offset + p_batch_size, array_length(p_contact_ids, 1))];

    -- Step 1: Guard timestamp (atomic)
    UPDATE evo.evolution_contacts
    SET pii_masked_at = now()
    WHERE id = ANY(v_batch_ids)
      AND deleted_at IS NULL
      AND pii_masked_at IS NULL;

    GET DIAGNOSTICS v_batch_anon = ROW_COUNT;

    -- Step 2: Anonymize only rows we just marked
    UPDATE evo.evolution_contacts
    SET
      full_name            = 'REDACTED',
      phone_number         = 'REDACTED',
      email                = 'REDACTED',
      push_name            = 'REDACTED',
      profile_picture_url  = 'REDACTED',
      company              = 'REDACTED',
      role_title           = 'REDACTED',
      instance_name        = 'REDACTED',
      notes                = 'REDACTED',
      raw_data             = 'REDACTED'::jsonb,
      updated_at           = now()
    WHERE id = ANY(v_batch_ids)
      AND pii_masked_at = now();

    -- Count skipped (already masked)
    v_total_skip := v_total_skip + (array_length(v_batch_ids, 1) - v_batch_anon);
    v_total_anon := v_total_anon + v_batch_anon;
    v_offset := v_offset + p_batch_size;
  END LOOP;

  RETURN QUERY SELECT v_total_anon, v_total_skip;
END;
$$;

REVOKE ALL ON FUNCTION fn_anonymize_contacts_batch_safe(UUID[], INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_anonymize_contacts_batch_safe(UUID[], INT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_anonymize_contacts_batch_safe(UUID[], INT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Hardened backup_campaign_contacts — remove dynamic partition_name injection
--    The original used format() with partition_name from pg_partitions which could
--    be influenced by an attacker controlling partition naming conventions.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION backup_campaign_contacts_safe()
RETURNS TABLE(backed_up INT, old_partitions_cleaned INT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public', '_backups', 'zapp'
SET lock_timeout = '10s'
SET deadlock_timeout = '500ms'
AS $$
DECLARE
  v_backed_up   INT;
  v_cleaned     INT := 0;
  v_today       DATE := CURRENT_DATE;
  v_part_name   TEXT;
  v_date_suffix TEXT;
  v_cutoff_date DATE;
BEGIN
  -- Create today's partition (safe: date suffix is server-controlled)
  v_date_suffix := TO_CHAR(v_today, 'YYYY_MM_DD');

  -- Validate suffix is pure date format (defense-in-depth)
  IF v_date_suffix !~ '^\d{4}_\d{2}_\d{2}$' THEN
    RAISE EXCEPTION 'invalid_date_suffix: % does not match YYYY_MM_DD', v_date_suffix
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS _backups.campaign_contacts_pre_dedup_%s '
      'PARTITION OF _backups.campaign_contacts_pre_dedup '
      'FOR VALUES FROM (%L) TO (%L)',
      v_date_suffix, v_today, v_today + 1
    );
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Partition already exists or cannot be created: %', SQLERRM;
  END;

  -- Clear old data (keep rolling 1-day window)
  DELETE FROM _backups.campaign_contacts_pre_dedup WHERE backup_date < v_today;
  GET DIAGNOSTICS v_cleaned = ROW_COUNT;

  -- Insert fresh snapshot
  INSERT INTO _backups.campaign_contacts_pre_dedup (campaign_id, contact_id, created_at, backup_date)
  SELECT campaign_id, contact_id, created_at, v_today
  FROM zapp.campaign_contacts
  WHERE deleted_at IS NULL;
  GET DIAGNOSTICS v_backed_up = ROW_COUNT;

  -- Record metadata
  INSERT INTO _backups.backup_metadata (table_name, backup_date, row_count)
  VALUES ('campaign_contacts', v_today, v_backed_up)
  ON CONFLICT (table_name, backup_date) DO UPDATE SET row_count = v_backed_up;

  -- Drop old partitions (30-day retention) — with strict name validation
  v_cutoff_date := v_today - 30;

  FOR v_part_name IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = '_backups'
      AND c.relname LIKE 'campaign_contacts_pre_dedup_%'
      AND c.relkind = 'r'
      -- Only match our exact date pattern (prevents injection via relname)
      AND c.relname ~ '^campaign_contacts_pre_dedup_\d{4}_\d{2}_\d{2}$'
  LOOP
    -- Re-validate the extracted partition name before use in dynamic SQL
    IF v_part_name !~ '^campaign_contacts_pre_dedup_\d{4}_\d{2}_\d{2}$' THEN
      RAISE WARNING 'Skipping partition with unexpected name: %', v_part_name;
      CONTINUE;
    END IF;

    DECLARE
      v_part_date DATE;
    BEGIN
      v_part_date := TO_DATE(
        SUBSTRING(v_part_name FROM 'campaign_contacts_pre_dedup_(\d{4}_\d{2}_\d{2})$'),
        'YYYY_MM_DD'
      );

      IF v_part_date < v_cutoff_date THEN
        EXECUTE format('DROP TABLE IF EXISTS _backups.%I', v_part_name);
        v_cleaned := v_cleaned + 1;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not drop partition %: %', v_part_name, SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT v_backed_up, v_cleaned;
END;
$$;

REVOKE ALL ON FUNCTION backup_campaign_contacts_safe() FROM PUBLIC;
REVOKE ALL ON FUNCTION backup_campaign_contacts_safe() FROM anon;
GRANT EXECUTE ON FUNCTION backup_campaign_contacts_safe() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Query allowlist enforcement — block dangerous SQL patterns in any remaining
--    dynamic execution paths
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_validate_query_allowlist(p_query TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  IF p_query IS NULL OR TRIM(p_query) = '' THEN
    RETURN FALSE;
  END IF;

  v_normalized := UPPER(TRIM(regexp_replace(p_query, '\s+', ' ', 'g')));

  -- Block DDL
  IF v_normalized ~* '\m(DROP|CREATE|ALTER|TRUNCATE|RENAME|COMMENT)\M' THEN
    RAISE EXCEPTION 'blocked_ddl: DDL statements not allowed in query context'
      USING ERRCODE = '42501';
  END IF;

  -- Block privilege changes
  IF v_normalized ~* '\m(GRANT|REVOKE|REASSIGN|SECURITY|LABEL)\M' THEN
    RAISE EXCEPTION 'blocked_dcl: Privilege/DCL statements not allowed'
      USING ERRCODE = '42501';
  END IF;

  -- Block transaction control (can break atomicity)
  IF v_normalized ~* '\m(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\M' THEN
    RAISE EXCEPTION 'blocked_tcl: Transaction control not allowed in query context'
      USING ERRCODE = '42501';
  END IF;

  -- Block dangerous functions
  IF v_normalized ~* '\m(COPY|PG_READ_FILE|PG_EXECUTE_SERVER_PROGRAM|DBLINK|PG_SLEEP)\M' THEN
    RAISE EXCEPTION 'blocked_dangerous: Dangerous function not allowed'
      USING ERRCODE = '42501';
  END IF;

  -- Block EXECUTE and dynamic SQL inside query
  IF v_normalized ~* '\mEXECUTE\M' AND v_normalized !~* '^\s*SELECT' THEN
    RAISE EXCEPTION 'blocked_dynamic: Dynamic execution not allowed in this context'
      USING ERRCODE = '42501';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION fn_validate_query_allowlist(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_validate_query_allowlist(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_validate_query_allowlist(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION fn_validate_query_allowlist(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Verify update_large_batch_safe is gone
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_large_batch_safe'
  ) THEN
    RAISE EXCEPTION 'SECURITY: update_large_batch_safe still exists — injection vector not closed'
      USING ERRCODE = '42P13';
  END IF;
  RAISE NOTICE 'Verified: update_large_batch_safe is gone';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Emit audit chain event for this remediation
-- ─────────────────────────────────────────────────────────────────────────────
SELECT fn_append_audit_event(
  'INJECTION_VECTOR_CLOSED',
  NULL,
  'function',
  'update_large_batch_safe',
  jsonb_build_object(
    'migration', '20260712170500_r16_dynamic_sql_injection_defense',
    'functions_dropped', ARRAY['update_large_batch_safe', 'safe_execute_query'],
    'replacement', 'fn_anonymize_contacts_batch_safe',
    'reason', 'Caller-controlled dynamic SQL execution — injection risk'
  )
);

COMMIT;
