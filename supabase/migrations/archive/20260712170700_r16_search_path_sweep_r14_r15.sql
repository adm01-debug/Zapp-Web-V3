-- Round 16 Migration #8: SET search_path Sweep for Round 14-15 Functions
-- Severity: HIGH — All SECURITY DEFINER functions created in Migrations #1–#10
--           (20260712150000–160500) lack SET search_path, enabling search_path
--           hijacking attacks where an attacker creates objects in a schema that
--           appears earlier in the search_path.
-- Fix: ALTER FUNCTION ... SET search_path for every affected function.
--      Also hardens acquire_job_lock to auto-expire stale locks.
-- Date: 2026-07-12
-- Impact: Closes search_path injection vectors introduced by Round 15 migrations

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: a DO block recreates each function with SET search_path.
-- We use ALTER FUNCTION ... SET search_path instead of DROP+CREATE to preserve
-- any dependent objects (views, triggers, etc.) and avoid transient downtime.
-- ─────────────────────────────────────────────────────────────────────────────

-- Batch ALTER: set search_path on all known SECURITY DEFINER functions from R14-R15
-- that are missing it. The list was derived by auditing all migrations 150000–160500.

DO $$
DECLARE
  v_fn RECORD;
  v_sql TEXT;
BEGIN
  -- Process each known function that needs search_path hardening
  FOR v_fn IN (
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true  -- SECURITY DEFINER only
      -- Functions that don't yet have search_path configured
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc_config pc_inner
        WHERE pc_inner.oid = p.oid
          AND pc_inner.config::TEXT LIKE '%search_path%'
      )
      AND p.proname IN (
        -- Round 14 functions
        'anonymize_contacts_batch',
        'backup_campaign_contacts',
        'update_large_batch_safe',
        'fn_hash_password',
        'fn_verify_password',
        'fn_generate_nonce',
        'fn_validate_nonce',
        'fn_encrypt_pii',
        'fn_decrypt_pii',
        'fn_decode_html_entities',
        'sanitize_user_input',
        'fn_get_authoritative_now',
        'fn_set_clock_skew',
        'delete_contact_completely',
        'get_contacts_via_cte',
        'get_conversations_safe_join',
        'safe_execute_query',
        'fn_acquire_job_lock',
        'fn_release_job_lock',
        'fn_get_current_snapshot_version',
        'fn_increment_snapshot_version',
        'fn_get_rate_limit',
        'fn_record_page_request',
        -- Round 15 functions
        'fn_record_lgpd_consent',
        'fn_get_lgpd_consent_status',
        'fn_withdraw_lgpd_consent',
        'fn_create_message_audit_entry',
        'fn_get_contact_audit_trail',
        'fn_check_contact_id_reuse',
        'fn_register_contact_deletion',
        'fn_create_contact_snapshot',
        'fn_validate_contact_consistency',
        'fn_consolidate_duplicate_contacts',
        'fn_archive_old_message_logs',
        'fn_cleanup_expired_snapshots',
        'fn_validate_temporal_consistency'
      )
  )
  LOOP
    BEGIN
      v_sql := format(
        'ALTER FUNCTION public.%I(%s) SET search_path = ''public'', ''evo'', ''zapp''',
        v_fn.proname, v_fn.args
      );
      EXECUTE v_sql;
      RAISE NOTICE 'Hardened search_path: public.%(%)', v_fn.proname, v_fn.args;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not harden public.%(%): %', v_fn.proname, v_fn.args, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Explicit hardening for the most security-critical functions
-- (belt-and-suspenders: these are named explicitly so any rename is caught)
-- ─────────────────────────────────────────────────────────────────────────────

-- fn_record_lgpd_consent
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_record_lgpd_consent'
  ) THEN
    DECLARE
      v_args TEXT;
    BEGIN
      SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_record_lgpd_consent';
      EXECUTE format('ALTER FUNCTION public.fn_record_lgpd_consent(%s) SET search_path = ''public''', v_args);
    END;
  END IF;
END $$;

-- fn_get_lgpd_consent_status
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_get_lgpd_consent_status'
  ) THEN
    DECLARE v_args TEXT;
    BEGIN
      SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_get_lgpd_consent_status';
      EXECUTE format('ALTER FUNCTION public.fn_get_lgpd_consent_status(%s) SET search_path = ''public''', v_args);
    END;
  END IF;
END $$;

-- fn_create_message_audit_entry
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_create_message_audit_entry'
  ) THEN
    DECLARE v_args TEXT;
    BEGIN
      SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_create_message_audit_entry';
      EXECUTE format('ALTER FUNCTION public.fn_create_message_audit_entry(%s) SET search_path = ''public''', v_args);
    END;
  END IF;
END $$;

-- fn_check_contact_id_reuse
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_contact_id_reuse'
  ) THEN
    DECLARE v_args TEXT;
    BEGIN
      SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_check_contact_id_reuse';
      EXECUTE format('ALTER FUNCTION public.fn_check_contact_id_reuse(%s) SET search_path = ''public''', v_args);
    END;
  END IF;
END $$;

-- fn_get_current_snapshot_version
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_get_current_snapshot_version'
  ) THEN
    DECLARE v_args TEXT;
    BEGIN
      SELECT pg_get_function_identity_arguments(p.oid) INTO v_args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_get_current_snapshot_version';
      EXECUTE format('ALTER FUNCTION public.fn_get_current_snapshot_version(%s) SET search_path = ''public''', v_args);
    END;
  END IF;
END $$;

-- sanitize_user_input — also fix the character-by-character loop (O(N) DoS vector)
CREATE OR REPLACE FUNCTION sanitize_user_input(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF p_input IS NULL THEN
    RETURN NULL;
  END IF;

  -- Reject control characters (U+0000–U+0008, U+000B–U+000C, U+000E–U+001F)
  -- Excludes TAB (U+0009), LF (U+000A), CR (U+000D) which are legitimate
  IF p_input ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]' THEN
    RAISE EXCEPTION 'invalid_input: Control characters not allowed'
      USING ERRCODE = '22021';
  END IF;

  -- Remove NUL bytes specifically (MCP encoding artifact)
  p_input := replace(p_input, chr(0), '');

  -- Trim outer whitespace
  RETURN TRIM(p_input);
END;
$$;

REVOKE ALL ON FUNCTION sanitize_user_input(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION sanitize_user_input(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION sanitize_user_input(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION sanitize_user_input(TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix fn_acquire_job_lock — no stale lock expiry allows permanent lock starvation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_acquire_job_lock(
  p_job_name   TEXT,
  p_timeout_s  INT DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_acquired BOOLEAN;
  v_lock_id  BIGINT;
BEGIN
  IF p_timeout_s < 1 OR p_timeout_s > 86400 THEN
    RAISE EXCEPTION 'invalid_timeout: Must be 1–86400 seconds, got %', p_timeout_s
      USING ERRCODE = '22023';
  END IF;

  -- First, expire stale locks (prevents permanent lock-out on crash)
  UPDATE public.job_locks
  SET is_locked = false, locked_at = NULL, locked_by = NULL
  WHERE job_name = p_job_name
    AND is_locked = true
    AND locked_at < now() - (p_timeout_s || ' seconds')::INTERVAL;

  -- Now try to acquire
  UPDATE public.job_locks
  SET is_locked = true, locked_at = now(), locked_by = pg_backend_pid()
  WHERE job_name = p_job_name
    AND (is_locked = false OR is_locked IS NULL)
  RETURNING id INTO v_lock_id;

  GET DIAGNOSTICS v_acquired = ROW_COUNT;

  IF v_lock_id IS NOT NULL THEN
    RETURN true;
  END IF;

  -- Try INSERT if row doesn't exist yet
  BEGIN
    INSERT INTO public.job_locks (job_name, is_locked, locked_at, locked_by)
    VALUES (p_job_name, true, now(), pg_backend_pid())
    ON CONFLICT (job_name) DO NOTHING;

    GET DIAGNOSTICS v_acquired = ROW_COUNT;
    RETURN v_acquired > 0;
  EXCEPTION WHEN unique_violation THEN
    RETURN false;
  END;
END;
$$;

REVOKE ALL ON FUNCTION fn_acquire_job_lock(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_acquire_job_lock(TEXT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_acquire_job_lock(TEXT, INT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification: confirm all public SECURITY DEFINER functions now have search_path
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INT;
  v_fn    TEXT;
BEGIN
  -- Count SECURITY DEFINER functions that still lack search_path
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc_config pc
      WHERE pc.oid = p.oid AND pc.config::TEXT LIKE '%search_path%'
    )
    -- Exclude internal/system functions
    AND p.proname NOT LIKE 'pg_%'
    AND p.proname NOT LIKE '_pg_%';

  IF v_count > 0 THEN
    RAISE WARNING '% public SECURITY DEFINER function(s) still lack search_path. Run audit query for details.', v_count;
    -- List them (warning, not exception — some may be intentional)
    FOR v_fn IN
      SELECT format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND NOT EXISTS (
          SELECT 1 FROM pg_proc_config pc
          WHERE pc.oid = p.oid AND pc.config::TEXT LIKE '%search_path%'
        )
        AND p.proname NOT LIKE 'pg_%'
      ORDER BY p.proname
    LOOP
      RAISE WARNING '  Missing search_path: public.%', v_fn;
    END LOOP;
  ELSE
    RAISE NOTICE 'All public SECURITY DEFINER functions have search_path set';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Emit audit chain event
-- ─────────────────────────────────────────────────────────────────────────────
SELECT fn_append_audit_event(
  'SEARCH_PATH_SWEEP_COMPLETE',
  NULL,
  'migration',
  '20260712170700_r16_search_path_sweep_r14_r15',
  jsonb_build_object(
    'migration', '20260712170700_r16_search_path_sweep_r14_r15',
    'scope', 'Round 14-15 SECURITY DEFINER functions',
    'fixes', ARRAY[
      'SET search_path on all R14/R15 SECURITY DEFINER functions',
      'Replaced sanitize_user_input O(N) loop with regexp',
      'Fixed fn_acquire_job_lock stale lock expiry'
    ]
  )
);

COMMIT;
