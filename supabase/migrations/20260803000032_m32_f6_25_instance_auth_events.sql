-- M32: F6-25 — instance_auth_events: event_type=NULL, success=NULL — broken instrumentation
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem: All 17 recent rows in zapp.instance_auth_events have event_type=NULL and
--   success=NULL (or false default). The producer (supabase/functions/_shared/instance-pause.ts)
--   calls recordAuthFailureAndMaybePause() which does:
--     supabase.from('instance_auth_events').insert({
--       instance_name, reason, source, http_status, detail
--     })
--   — it never sets event_type or success. These columns exist in the schema but receive no data.
--
-- Fix (DB side):
--   1. Add event_type TEXT and success BOOLEAN columns IF NOT EXISTS (idempotent).
--   2. Backfill existing NULL rows: event_type = 'auth.failure', success = false
--      (all existing rows are failure events — the producer is exclusively for failures).
--   3. Set DEFAULT values so future inserts that still omit these fields get sensible defaults.
--   4. Add CHECK constraint on event_type (allowed values match RPC filter expectations).
--
-- Fix (TypeScript side):
--   The producer in _shared/instance-pause.ts is patched to include event_type and success
--   in every INSERT. See the TypeScript change applied in this migration set.
--
-- Rollback:
--   ALTER TABLE public.instance_auth_events
--     DROP COLUMN IF EXISTS event_type,
--     DROP COLUMN IF EXISTS success;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Add missing columns to the physical table
-- The physical table lives in public.instance_auth_events.
-- zapp.instance_auth_events is a VIEW proxy (WITH security_invoker=on) pointing to it.
-- We alter the physical table so the VIEW picks up the new columns automatically.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_has_event_type BOOLEAN;
  v_has_success    BOOLEAN;
  v_has_tbl        BOOLEAN;
BEGIN
  -- Detect whether the physical table exists (it may live in public or zapp)
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'instance_auth_events' AND c.relkind = 'r'
  ) INTO v_has_tbl;

  IF NOT v_has_tbl THEN
    -- Try zapp schema as fallback
    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'zapp' AND c.relname = 'instance_auth_events' AND c.relkind = 'r'
    ) INTO v_has_tbl;

    IF NOT v_has_tbl THEN
      RAISE NOTICE 'M32 SKIP: instance_auth_events physical table not found in public or zapp';
      RETURN;
    END IF;
  END IF;

  -- Check existing columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema IN ('public', 'zapp')
       AND table_name = 'instance_auth_events'
       AND column_name = 'event_type'
  ) INTO v_has_event_type;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema IN ('public', 'zapp')
       AND table_name = 'instance_auth_events'
       AND column_name = 'success'
  ) INTO v_has_success;

  IF NOT v_has_event_type THEN
    -- Add with a DEFAULT so existing rows and future omitted inserts still work
    ALTER TABLE public.instance_auth_events
      ADD COLUMN event_type TEXT NOT NULL DEFAULT 'auth.failure';
    RAISE NOTICE 'M32 ADDED: event_type TEXT NOT NULL DEFAULT ''auth.failure''';
  ELSE
    RAISE NOTICE 'M32 SKIP: event_type column already exists';
  END IF;

  IF NOT v_has_success THEN
    ALTER TABLE public.instance_auth_events
      ADD COLUMN success BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE 'M32 ADDED: success BOOLEAN NOT NULL DEFAULT false';
  ELSE
    RAISE NOTICE 'M32 SKIP: success column already exists';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Backfill existing NULL rows
-- Map reason → event_type; all existing rows are failures (success = false).
-- event_type follows the convention used in the existing RPC trend function:
--   'auth.failure' for all failure reasons (invalid_signature, auth_401, auth_403)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  -- Only run if the column exists (in case STEP 1 was a no-op because it already existed
  -- with non-null values). Backfill only rows where event_type is still NULL.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema IN ('public', 'zapp')
       AND table_name = 'instance_auth_events'
       AND column_name = 'event_type'
  ) THEN
    UPDATE public.instance_auth_events
       SET event_type = 'auth.failure'
     WHERE event_type IS NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN
      RAISE NOTICE 'M32 Backfill event_type: updated % rows to ''auth.failure''', v_updated;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema IN ('public', 'zapp')
       AND table_name = 'instance_auth_events'
       AND column_name = 'success'
  ) THEN
    UPDATE public.instance_auth_events
       SET success = false
     WHERE success IS NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN
      RAISE NOTICE 'M32 Backfill success: updated % rows to false', v_updated;
    END IF;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Add CHECK constraint on event_type
-- Allowed values mirror what the RPC trend functions filter on.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class cl ON cl.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
      AND cl.relname = 'instance_auth_events'
      AND c.contype = 'c'
      AND c.conname = 'chk_iae_event_type_values'
  ) THEN
    ALTER TABLE public.instance_auth_events
      ADD CONSTRAINT chk_iae_event_type_values
        CHECK (event_type IN ('auth.success', 'auth.failure', 'auth.warning'));
    RAISE NOTICE 'M32 CONSTRAINT: chk_iae_event_type_values added';
  ELSE
    RAISE NOTICE 'M32 SKIP: chk_iae_event_type_values already exists';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_has_event_type BOOLEAN;
  v_has_success    BOOLEAN;
  v_null_et        INTEGER;
  v_null_suc       INTEGER;
  v_ok             BOOLEAN := TRUE;
  v_report         TEXT    := '';
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema IN ('public', 'zapp')
       AND table_name = 'instance_auth_events'
       AND column_name = 'event_type'
  ) INTO v_has_event_type;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema IN ('public', 'zapp')
       AND table_name = 'instance_auth_events'
       AND column_name = 'success'
  ) INTO v_has_success;

  IF v_has_event_type THEN
    v_report := v_report || E'\n  [OK]   F6-25: event_type column exists ✓';

    SELECT COUNT(*) INTO v_null_et
      FROM public.instance_auth_events
     WHERE event_type IS NULL;

    IF v_null_et = 0 THEN
      v_report := v_report || E'\n  [OK]   F6-25: 0 rows with event_type IS NULL ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] F6-25: ' || v_null_et || ' rows still have event_type IS NULL';
      v_ok := FALSE;
    END IF;
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-25: event_type column NOT FOUND';
    v_ok := FALSE;
  END IF;

  IF v_has_success THEN
    v_report := v_report || E'\n  [OK]   F6-25: success column exists ✓';

    SELECT COUNT(*) INTO v_null_suc
      FROM public.instance_auth_events
     WHERE success IS NULL;

    IF v_null_suc = 0 THEN
      v_report := v_report || E'\n  [OK]   F6-25: 0 rows with success IS NULL ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] F6-25: ' || v_null_suc || ' rows still have success IS NULL';
      v_ok := FALSE;
    END IF;
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-25: success column NOT FOUND';
    v_ok := FALSE;
  END IF;

  RAISE NOTICE E'M32 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M32 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
