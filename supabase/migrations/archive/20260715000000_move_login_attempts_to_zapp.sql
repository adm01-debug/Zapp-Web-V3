-- ============================================================
-- Migration: 20260715000000_move_login_attempts_to_zapp
-- Purpose  : Replay the manual schema move of login_attempts
--            from public → zapp that occurred in production before
--            2026-07-16. Migration 20260716200000 (14-digit, CI-processed)
--            does ALTER TABLE zapp.login_attempts, requiring the table
--            to already be in the zapp schema.
-- Idempotent: YES (IF NOT EXISTS / IF EXISTS guards throughout)
-- ============================================================

-- Step 1: Move the table from public to zapp (if still in public as a base table)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'login_attempts' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'login_attempts' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.login_attempts SET SCHEMA zapp';
  END IF;
END $$;

-- Step 2: Create a public proxy view so existing functions (record_failed_login,
-- is_account_locked, clear_login_attempts, get_own_lockout_status) that reference
-- public.login_attempts continue to work without modification.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'login_attempts'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'login_attempts' AND c.relkind = 'v'
  ) THEN
    EXECUTE $v$
      CREATE VIEW public.login_attempts
        WITH (security_invoker = on)
      AS SELECT * FROM zapp.login_attempts
    $v$;
  END IF;
END $$;
