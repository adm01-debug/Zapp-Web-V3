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
--   1. Detect the physical table location once (public or zapp) and propagate.
--   2. Add event_type TEXT and success BOOLEAN columns IF NOT EXISTS (idempotent).
--      For idempotent path (column already exists): also enforce DEFAULT + NOT NULL.
--   3. Backfill existing NULL rows: event_type = 'auth.failure', success = false.
--   4. Add CHECK constraint on event_type (allowed values).
--   5. If physical table is in public, recreate the zapp.instance_auth_events VIEW
--      (CREATE OR REPLACE VIEW does NOT expose newly-added base-table columns automatically).
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
-- STEP 1 — Detect physical table schema and add missing columns
-- The physical table lives in public.instance_auth_events (or possibly zapp).
-- zapp.instance_auth_events is a VIEW proxy (WITH security_invoker=on) pointing to it.
-- We ALTER the physical table so the VIEW picks up the new columns after step 5.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_phys_schema    TEXT;
  v_has_event_type BOOLEAN;
  v_has_success    BOOLEAN;
BEGIN
  -- Detect the physical table (relkind='r') — check public first, then zapp
  SELECT n.nspname
    INTO v_phys_schema
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relname = 'instance_auth_events'
     AND c.relkind = 'r'  -- regular table only (excludes views, partitions, etc.)
     AND n.nspname IN ('public', 'zapp')
   ORDER BY (CASE WHEN n.nspname = 'public' THEN 1 ELSE 2 END)
   LIMIT 1;

  IF v_phys_schema IS NULL THEN
    RAISE NOTICE 'M32 SKIP: instance_auth_events physical table not found in public or zapp — nothing to do';
    RETURN;
  END IF;

  RAISE NOTICE 'M32: physical table found in schema %', v_phys_schema;

  -- Check which columns already exist in the physical table
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = v_phys_schema
       AND table_name   = 'instance_auth_events'
       AND column_name  = 'event_type'
  ) INTO v_has_event_type;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = v_phys_schema
       AND table_name   = 'instance_auth_events'
       AND column_name  = 'success'
  ) INTO v_has_success;

  IF NOT v_has_event_type THEN
    EXECUTE format(
      'ALTER TABLE %I.instance_auth_events ADD COLUMN event_type TEXT NOT NULL DEFAULT ''auth.failure''',
      v_phys_schema
    );
    RAISE NOTICE 'M32 ADDED: event_type TEXT NOT NULL DEFAULT ''auth.failure'' in schema %', v_phys_schema;
  ELSE
    -- Idempotent path: column exists — still enforce the same DEFAULT + NOT NULL contract
    EXECUTE format(
      'ALTER TABLE %I.instance_auth_events ALTER COLUMN event_type SET DEFAULT ''auth.failure''',
      v_phys_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.instance_auth_events ALTER COLUMN event_type SET NOT NULL',
      v_phys_schema
    );
    RAISE NOTICE 'M32 SKIP: event_type column already exists (DEFAULT + NOT NULL enforced)';
  END IF;

  IF NOT v_has_success THEN
    EXECUTE format(
      'ALTER TABLE %I.instance_auth_events ADD COLUMN success BOOLEAN NOT NULL DEFAULT false',
      v_phys_schema
    );
    RAISE NOTICE 'M32 ADDED: success BOOLEAN NOT NULL DEFAULT false in schema %', v_phys_schema;
  ELSE
    -- Idempotent path: column exists — still enforce the same DEFAULT + NOT NULL contract
    EXECUTE format(
      'ALTER TABLE %I.instance_auth_events ALTER COLUMN success SET DEFAULT false',
      v_phys_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.instance_auth_events ALTER COLUMN success SET NOT NULL',
      v_phys_schema
    );
    RAISE NOTICE 'M32 SKIP: success column already exists (DEFAULT + NOT NULL enforced)';
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
  v_phys_schema TEXT;
  v_updated     INTEGER;
BEGIN
  SELECT n.nspname
    INTO v_phys_schema
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relname = 'instance_auth_events'
     AND c.relkind = 'r'
     AND n.nspname IN ('public', 'zapp')
   ORDER BY (CASE WHEN n.nspname = 'public' THEN 1 ELSE 2 END)
   LIMIT 1;

  IF v_phys_schema IS NULL THEN
    RAISE NOTICE 'M32 SKIP backfill: table not found';
    RETURN;
  END IF;

  -- Only backfill rows where event_type is still NULL (the column may have a DEFAULT now,
  -- but historical rows inserted before this migration will have NULL).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = v_phys_schema
       AND table_name   = 'instance_auth_events'
       AND column_name  = 'event_type'
  ) THEN
    EXECUTE format(
      'UPDATE %I.instance_auth_events SET event_type = ''auth.failure'' WHERE event_type IS NULL',
      v_phys_schema
    );
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN
      RAISE NOTICE 'M32 Backfill event_type: updated % rows to ''auth.failure''', v_updated;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = v_phys_schema
       AND table_name   = 'instance_auth_events'
       AND column_name  = 'success'
  ) THEN
    EXECUTE format(
      'UPDATE %I.instance_auth_events SET success = false WHERE success IS NULL',
      v_phys_schema
    );
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
DECLARE
  v_phys_schema TEXT;
BEGIN
  SELECT n.nspname
    INTO v_phys_schema
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relname = 'instance_auth_events'
     AND c.relkind = 'r'
     AND n.nspname IN ('public', 'zapp')
   ORDER BY (CASE WHEN n.nspname = 'public' THEN 1 ELSE 2 END)
   LIMIT 1;

  IF v_phys_schema IS NULL THEN
    RAISE NOTICE 'M32 SKIP constraint: table not found';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint ct
    JOIN pg_catalog.pg_class cl ON cl.oid = ct.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = v_phys_schema
      AND cl.relname = 'instance_auth_events'
      AND ct.contype = 'c'
      AND ct.conname = 'chk_iae_event_type_values'
  ) THEN
    EXECUTE format(
      $q$ALTER TABLE %I.instance_auth_events
           ADD CONSTRAINT chk_iae_event_type_values
             CHECK (event_type IN ('auth.success', 'auth.failure', 'auth.warning'))$q$,
      v_phys_schema
    );
    RAISE NOTICE 'M32 CONSTRAINT: chk_iae_event_type_values added on %.instance_auth_events', v_phys_schema;
  ELSE
    RAISE NOTICE 'M32 SKIP: chk_iae_event_type_values already exists';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — Recreate the VIEW in zapp schema if physical table is in public
-- Adding columns to the base table does NOT automatically expose them through
-- an existing CREATE VIEW statement. We must CREATE OR REPLACE VIEW to pick up
-- the new columns via the SELECT * expansion.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_phys_schema TEXT;
BEGIN
  SELECT n.nspname
    INTO v_phys_schema
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relname = 'instance_auth_events'
     AND c.relkind = 'r'
     AND n.nspname IN ('public', 'zapp')
   ORDER BY (CASE WHEN n.nspname = 'public' THEN 1 ELSE 2 END)
   LIMIT 1;

  -- Only recreate the view when the physical table is NOT already in zapp.
  -- If the table is in zapp directly, `zapp.instance_auth_events` IS the table
  -- and there is no proxy VIEW to refresh.
  IF v_phys_schema IS NOT NULL AND v_phys_schema != 'zapp' THEN
    -- Recreate with security_invoker=on so the caller's RLS policies apply
    EXECUTE $view$
      CREATE OR REPLACE VIEW zapp.instance_auth_events
        WITH (security_invoker = on) AS
        SELECT * FROM public.instance_auth_events
    $view$;
    RAISE NOTICE 'M32 VIEW: zapp.instance_auth_events recreated to expose new columns (source: public)';
  ELSE
    RAISE NOTICE 'M32 VIEW SKIP: physical table is in zapp — no proxy view to refresh';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_phys_schema    TEXT;
  v_has_event_type BOOLEAN;
  v_has_success    BOOLEAN;
  v_null_et        INTEGER;
  v_null_suc       INTEGER;
  v_ok             BOOLEAN := TRUE;
  v_report         TEXT    := '';
BEGIN
  SELECT n.nspname
    INTO v_phys_schema
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relname = 'instance_auth_events'
     AND c.relkind = 'r'
     AND n.nspname IN ('public', 'zapp')
   ORDER BY (CASE WHEN n.nspname = 'public' THEN 1 ELSE 2 END)
   LIMIT 1;

  IF v_phys_schema IS NULL THEN
    v_report := v_report || E'\n  [WARN] F6-25: physical table not found — skipping verification (empty DB)';
    RAISE NOTICE E'M32 Verification:%', v_report;
    RETURN;
  END IF;

  v_report := v_report || E'\n  [OK]   F6-25: physical table found in schema: ' || v_phys_schema;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = v_phys_schema
       AND table_name   = 'instance_auth_events'
       AND column_name  = 'event_type'
  ) INTO v_has_event_type;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = v_phys_schema
       AND table_name   = 'instance_auth_events'
       AND column_name  = 'success'
  ) INTO v_has_success;

  IF v_has_event_type THEN
    v_report := v_report || E'\n  [OK]   F6-25: event_type column exists ✓';

    EXECUTE format(
      'SELECT COUNT(*) FROM %I.instance_auth_events WHERE event_type IS NULL',
      v_phys_schema
    ) INTO v_null_et;

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

    EXECUTE format(
      'SELECT COUNT(*) FROM %I.instance_auth_events WHERE success IS NULL',
      v_phys_schema
    ) INTO v_null_suc;

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
