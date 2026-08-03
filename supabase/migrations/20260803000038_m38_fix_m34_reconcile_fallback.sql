-- M38: Fix M34 fallback schema — evo.evolution_reconcile_jobs
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem (cubic P0/P1 review of M34):
--   The fallback CREATE TABLE in M34 STEP 1 (executed when evo.evolution_reconcile_jobs
--   is absent on fresh/staging DBs) had three schema gaps vs. the production table:
--
--   P0 (M34:58): dispatched_at was nullable without DEFAULT now() in the fallback.
--       Production column: dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now().
--
--   P1 (M34:54): request_id had no UNIQUE constraint. The ON CONFLICT (request_id) DO NOTHING
--       in fn_reconcile_dispatch requires a unique index to resolve the conflict target.
--
--   P1 (M34:60): http_status INTEGER and result JSONB columns were absent from the fallback.
--       Both exist on the production table and are used by fn_reconcile_dispatch.
--
-- Fix (idempotent — safe to run on production where the table already has correct schema):
--   1. UNIQUE on request_id  — ADD CONSTRAINT IF NOT EXISTS equivalent via DO block.
--   2. NOT NULL + DEFAULT on dispatched_at — backfill NULLs first, then SET constraints.
--   3. ADD COLUMN IF NOT EXISTS http_status INTEGER, result JSONB.
--
-- Rollback:
--   ALTER TABLE evo.evolution_reconcile_jobs DROP CONSTRAINT IF EXISTS uq_reconcile_jobs_request_id;
--   ALTER TABLE evo.evolution_reconcile_jobs ALTER COLUMN dispatched_at DROP NOT NULL;
--   ALTER TABLE evo.evolution_reconcile_jobs ALTER COLUMN dispatched_at DROP DEFAULT;
--   ALTER TABLE evo.evolution_reconcile_jobs DROP COLUMN IF EXISTS http_status;
--   ALTER TABLE evo.evolution_reconcile_jobs DROP COLUMN IF EXISTS result;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — UNIQUE constraint on request_id
-- Needed for ON CONFLICT (request_id) DO NOTHING in fn_reconcile_dispatch.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists BOOLEAN;
  v_ck_exists  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_reconcile_jobs'
      AND c.relkind IN ('r', 'p')
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M38 SKIP STEP 1: evo.evolution_reconcile_jobs not found';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint ct
    JOIN pg_catalog.pg_class cl ON cl.oid = ct.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'evo'
      AND cl.relname = 'evolution_reconcile_jobs'
      AND ct.conname = 'uq_reconcile_jobs_request_id'
  ) INTO v_ck_exists;

  IF v_ck_exists THEN
    RAISE NOTICE 'M38 STEP 1: uq_reconcile_jobs_request_id already exists — skipping';
    RETURN;
  END IF;

  -- Also check for any existing unique index covering request_id alone
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_index ix
    JOIN pg_catalog.pg_class c ON c.oid = ix.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_reconcile_jobs'
      AND ix.indisunique = TRUE
      AND a.attname = 'request_id'
      AND array_length(ix.indkey, 1) = 1
  ) THEN
    RAISE NOTICE 'M38 STEP 1: unique index on request_id already exists — skipping ADD CONSTRAINT';
    RETURN;
  END IF;

  ALTER TABLE evo.evolution_reconcile_jobs
    ADD CONSTRAINT uq_reconcile_jobs_request_id UNIQUE (request_id);

  RAISE NOTICE 'M38 STEP 1: uq_reconcile_jobs_request_id added ✓';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — dispatched_at: backfill NULLs, then SET NOT NULL + DEFAULT now()
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists   BOOLEAN;
  v_has_col      BOOLEAN;
  v_is_notnull   BOOLEAN;
  v_has_default  BOOLEAN;
  v_updated      INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_reconcile_jobs'
      AND c.relkind IN ('r', 'p')
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M38 SKIP STEP 2: table not found';
    RETURN;
  END IF;

  SELECT
    TRUE,
    a.attnotnull,
    a.atthasdef
  INTO v_has_col, v_is_notnull, v_has_default
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'evo'
    AND c.relname = 'evolution_reconcile_jobs'
    AND a.attname = 'dispatched_at'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_has_col IS NULL THEN
    RAISE NOTICE 'M38 SKIP STEP 2: dispatched_at column not found';
    RETURN;
  END IF;

  -- Backfill any NULLs before adding NOT NULL constraint
  UPDATE evo.evolution_reconcile_jobs
     SET dispatched_at = created_at
   WHERE dispatched_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    RAISE NOTICE 'M38 STEP 2: backfilled dispatched_at on % rows using created_at', v_updated;
  END IF;

  -- SET DEFAULT now()
  IF NOT v_has_default THEN
    ALTER TABLE evo.evolution_reconcile_jobs
      ALTER COLUMN dispatched_at SET DEFAULT pg_catalog.now();
    RAISE NOTICE 'M38 STEP 2: DEFAULT now() set on dispatched_at ✓';
  ELSE
    RAISE NOTICE 'M38 STEP 2: dispatched_at already has a DEFAULT — skipping';
  END IF;

  -- SET NOT NULL
  IF NOT v_is_notnull THEN
    ALTER TABLE evo.evolution_reconcile_jobs
      ALTER COLUMN dispatched_at SET NOT NULL;
    RAISE NOTICE 'M38 STEP 2: NOT NULL set on dispatched_at ✓';
  ELSE
    RAISE NOTICE 'M38 STEP 2: dispatched_at already NOT NULL — skipping';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — ADD COLUMN IF NOT EXISTS: http_status INTEGER, result JSONB
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_reconcile_jobs'
      AND c.relkind IN ('r', 'p')
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M38 SKIP STEP 3: table not found';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_reconcile_jobs'
      AND a.attname = 'http_status'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    ALTER TABLE evo.evolution_reconcile_jobs
      ADD COLUMN http_status INTEGER;
    RAISE NOTICE 'M38 STEP 3: http_status INTEGER added ✓';
  ELSE
    RAISE NOTICE 'M38 STEP 3: http_status already exists — skipping';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_reconcile_jobs'
      AND a.attname = 'result'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    ALTER TABLE evo.evolution_reconcile_jobs
      ADD COLUMN result JSONB;
    RAISE NOTICE 'M38 STEP 3: result JSONB added ✓';
  ELSE
    RAISE NOTICE 'M38 STEP 3: result already exists — skipping';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists       BOOLEAN;
  v_has_unique       BOOLEAN;
  v_dispatched_nn    BOOLEAN;
  v_dispatched_def   BOOLEAN;
  v_has_http_status  BOOLEAN;
  v_has_result       BOOLEAN;
  v_ok               BOOLEAN := TRUE;
  v_report           TEXT    := '';
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_reconcile_jobs'
      AND c.relkind IN ('r', 'p')
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE E'M38 Verification:\n  [SKIP] evo.evolution_reconcile_jobs not found — fresh env without M34 fallback table';
    RETURN;
  END IF;

  -- UNIQUE on request_id
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint ct
    JOIN pg_catalog.pg_class cl ON cl.oid = ct.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'evo'
      AND cl.relname = 'evolution_reconcile_jobs'
      AND ct.conname = 'uq_reconcile_jobs_request_id'
      AND ct.contype = 'u'
  ) INTO v_has_unique;

  IF NOT v_has_unique THEN
    -- Also accept an existing unique index on request_id
    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_index ix
      JOIN pg_catalog.pg_class c ON c.oid = ix.indrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname = 'evo'
        AND c.relname = 'evolution_reconcile_jobs'
        AND ix.indisunique = TRUE
        AND a.attname = 'request_id'
    ) INTO v_has_unique;
  END IF;

  IF v_has_unique THEN
    v_report := v_report || E'\n  [OK]   M34/P1: UNIQUE on request_id exists ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] M34/P1: no UNIQUE constraint or index on request_id';
    v_ok := FALSE;
  END IF;

  -- dispatched_at NOT NULL + DEFAULT
  SELECT a.attnotnull, a.atthasdef
    INTO v_dispatched_nn, v_dispatched_def
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'evo'
     AND c.relname = 'evolution_reconcile_jobs'
     AND a.attname = 'dispatched_at'
     AND a.attnum > 0
     AND NOT a.attisdropped;

  IF v_dispatched_nn IS TRUE THEN
    v_report := v_report || E'\n  [OK]   M34/P0: dispatched_at IS NOT NULL ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] M34/P0: dispatched_at is nullable';
    v_ok := FALSE;
  END IF;

  IF v_dispatched_def IS TRUE THEN
    v_report := v_report || E'\n  [OK]   M34/P0: dispatched_at has DEFAULT ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] M34/P0: dispatched_at has no DEFAULT';
    v_ok := FALSE;
  END IF;

  -- http_status column
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_reconcile_jobs'
      AND a.attname = 'http_status'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) INTO v_has_http_status;

  IF v_has_http_status THEN
    v_report := v_report || E'\n  [OK]   M34/P1: http_status column exists ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] M34/P1: http_status column missing';
    v_ok := FALSE;
  END IF;

  -- result column
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_reconcile_jobs'
      AND a.attname = 'result'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) INTO v_has_result;

  IF v_has_result THEN
    v_report := v_report || E'\n  [OK]   M34/P1: result column exists ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] M34/P1: result column missing';
    v_ok := FALSE;
  END IF;

  RAISE NOTICE E'M38 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M38 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
