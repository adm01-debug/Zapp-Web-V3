-- M34: F6-05 + F6-21 — evolution_reconcile_jobs: applied_at corruption + missing CHECK
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem (F6-05): pg_net recycles request_ids over time.
--   fn_reconcile_dispatch used ON CONFLICT (request_id) DO UPDATE SET dispatched_at = now()
--   which preserved the old applied_at from a prior job while resetting dispatched_at for a
--   new job → applied_at < dispatched_at (temporally impossible / corrupt).
--   M26 already patched fn_reconcile_dispatch to use ON CONFLICT DO NOTHING, but it set
--   status='done' on corrupt rows instead of nulling applied_at, leaving the bad data behind.
--
-- Problem (F6-21): No CHECK constraint on either evolution_reconcile_jobs table to prevent
--   future applied_at < dispatched_at corruption from reaching the DB.
--
-- Tables affected:
--   1. evo.evolution_reconcile_jobs — original physical table (baseline migration 20260705011550)
--   2. zapp.evolution_reconcile_jobs — created by M26; mirrors the schema in the zapp schema
--
-- Fix:
--   1. Backfill: SET applied_at = NULL WHERE applied_at IS NOT NULL AND applied_at < dispatched_at
--      on both tables (idempotent; constraint below then locks the invariant permanently).
--   2. Add CHECK constraint chk_applied_after_dispatched on both tables if not already present.
--   3. Verify no corrupt rows remain and constraints exist.
--
-- Rollback:
--   ALTER TABLE evo.evolution_reconcile_jobs  DROP CONSTRAINT IF EXISTS chk_applied_after_dispatched;
--   ALTER TABLE zapp.evolution_reconcile_jobs DROP CONSTRAINT IF EXISTS chk_applied_after_dispatched;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Backfill evo.evolution_reconcile_jobs
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists BOOLEAN;
  v_updated    INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_reconcile_jobs'
      AND c.relkind = 'r'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    -- Table absent on fresh DB / staging reset — create it so the CHECK constraint (STEP 3)
    -- and subsequent backfill code always have a target. Mirrors the zapp schema from M26
    -- but without cross-schema FK on instance_id (kept nullable UUID).
    RAISE NOTICE 'M34: evo.evolution_reconcile_jobs not found — creating canonical table in evo schema';
    CREATE TABLE IF NOT EXISTS evo.evolution_reconcile_jobs (
      id             UUID        NOT NULL DEFAULT pg_catalog.gen_random_uuid() PRIMARY KEY,
      request_id     BIGINT,
      status         TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'dispatched', 'done', 'failed')),
      payload        JSONB,
      dispatched_at  TIMESTAMPTZ,
      applied_at     TIMESTAMPTZ,
      error_detail   TEXT,
      instance_id    UUID,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
    );
    ALTER TABLE evo.evolution_reconcile_jobs ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
       WHERE schemaname = 'evo' AND tablename = 'evolution_reconcile_jobs'
         AND policyname = 'svc_all_evo_reconcile_jobs'
    ) THEN
      CREATE POLICY svc_all_evo_reconcile_jobs ON evo.evolution_reconcile_jobs
        FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
    END IF;

    -- Newly created table — no rows to backfill; skip the UPDATE below.
    RAISE NOTICE 'M34: evo.evolution_reconcile_jobs created with RLS (no data to backfill)';
    RETURN;
  END IF;

  -- Null out applied_at where it is impossible (applied before dispatch)
  UPDATE evo.evolution_reconcile_jobs
     SET applied_at = NULL
   WHERE applied_at IS NOT NULL
     AND applied_at < dispatched_at;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    RAISE NOTICE 'M34 BACKFILL evo: nulled applied_at on % corrupt row(s)', v_updated;
  ELSE
    RAISE NOTICE 'M34 BACKFILL evo: no corrupt rows found (clean)';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Backfill zapp.evolution_reconcile_jobs (created by M26)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists BOOLEAN;
  v_updated    INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname = 'evolution_reconcile_jobs'
      AND c.relkind = 'r'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M34 SKIP: zapp.evolution_reconcile_jobs not found (relkind=r) — M26 may not have run yet';
    RETURN;
  END IF;

  UPDATE zapp.evolution_reconcile_jobs
     SET applied_at = NULL
   WHERE applied_at IS NOT NULL
     AND applied_at < dispatched_at;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    RAISE NOTICE 'M34 BACKFILL zapp: nulled applied_at on % corrupt row(s)', v_updated;
  ELSE
    RAISE NOTICE 'M34 BACKFILL zapp: no corrupt rows found (clean)';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Add CHECK constraint to evo.evolution_reconcile_jobs
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
      AND c.relkind = 'r'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M34 SKIP CONSTRAINT evo: table not found';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint ct
    JOIN pg_catalog.pg_class cl ON cl.oid = ct.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'evo'
      AND cl.relname = 'evolution_reconcile_jobs'
      AND ct.contype = 'c'
      AND ct.conname = 'chk_applied_after_dispatched'
  ) INTO v_ck_exists;

  IF v_ck_exists THEN
    RAISE NOTICE 'M34 CONSTRAINT evo: chk_applied_after_dispatched already exists — skipping';
    RETURN;
  END IF;

  ALTER TABLE evo.evolution_reconcile_jobs
    ADD CONSTRAINT chk_applied_after_dispatched
      CHECK (applied_at IS NULL OR applied_at >= dispatched_at);

  RAISE NOTICE 'M34 CONSTRAINT evo: chk_applied_after_dispatched added ✓';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — Add CHECK constraint to zapp.evolution_reconcile_jobs
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists BOOLEAN;
  v_ck_exists  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relname = 'evolution_reconcile_jobs'
      AND c.relkind = 'r'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M34 SKIP CONSTRAINT zapp: table not found';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint ct
    JOIN pg_catalog.pg_class cl ON cl.oid = ct.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'zapp'
      AND cl.relname = 'evolution_reconcile_jobs'
      AND ct.contype = 'c'
      AND ct.conname = 'chk_applied_after_dispatched'
  ) INTO v_ck_exists;

  IF v_ck_exists THEN
    RAISE NOTICE 'M34 CONSTRAINT zapp: chk_applied_after_dispatched already exists — skipping';
    RETURN;
  END IF;

  ALTER TABLE zapp.evolution_reconcile_jobs
    ADD CONSTRAINT chk_applied_after_dispatched
      CHECK (applied_at IS NULL OR applied_at >= dispatched_at);

  RAISE NOTICE 'M34 CONSTRAINT zapp: chk_applied_after_dispatched added ✓';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_evo_exists   BOOLEAN;
  v_zapp_exists  BOOLEAN;
  v_evo_ck       BOOLEAN;
  v_zapp_ck      BOOLEAN;
  v_evo_corrupt  INTEGER;
  v_zapp_corrupt INTEGER;
  v_ok           BOOLEAN := TRUE;
  v_report       TEXT    := '';
BEGIN
  -- Check physical table existence
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs' AND c.relkind = 'r'
  ) INTO v_evo_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'evolution_reconcile_jobs' AND c.relkind = 'r'
  ) INTO v_zapp_exists;

  -- evo.evolution_reconcile_jobs
  IF v_evo_exists THEN
    v_report := v_report || E'\n  [OK]   F6-05/21 evo: table exists';

    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint ct
      JOIN pg_catalog.pg_class cl ON cl.oid = ct.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = 'evo' AND cl.relname = 'evolution_reconcile_jobs'
        AND ct.contype = 'c' AND ct.conname = 'chk_applied_after_dispatched'
    ) INTO v_evo_ck;

    IF v_evo_ck THEN
      v_report := v_report || E'\n  [OK]   F6-21 evo: chk_applied_after_dispatched exists ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] F6-21 evo: chk_applied_after_dispatched NOT FOUND';
      v_ok := FALSE;
    END IF;

    SELECT COUNT(*) INTO v_evo_corrupt
      FROM evo.evolution_reconcile_jobs
     WHERE applied_at IS NOT NULL AND applied_at < dispatched_at;

    IF v_evo_corrupt = 0 THEN
      v_report := v_report || E'\n  [OK]   F6-05 evo: 0 corrupt rows (applied_at < dispatched_at) ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] F6-05 evo: ' || v_evo_corrupt || ' corrupt rows remain';
      v_ok := FALSE;
    END IF;
  ELSE
    -- STEP 1 created the table if it was absent; reaching here means CREATE TABLE failed
    -- (which would have raised an exception) — treat as hard failure for verification.
    v_report := v_report || E'\n  [FAIL] F6-05/21 evo: table still not found after M34 ran — unexpected';
    v_ok := FALSE;
  END IF;

  -- zapp.evolution_reconcile_jobs
  IF v_zapp_exists THEN
    v_report := v_report || E'\n  [OK]   F6-05/21 zapp: table exists';

    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint ct
      JOIN pg_catalog.pg_class cl ON cl.oid = ct.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = 'zapp' AND cl.relname = 'evolution_reconcile_jobs'
        AND ct.contype = 'c' AND ct.conname = 'chk_applied_after_dispatched'
    ) INTO v_zapp_ck;

    IF v_zapp_ck THEN
      v_report := v_report || E'\n  [OK]   F6-21 zapp: chk_applied_after_dispatched exists ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] F6-21 zapp: chk_applied_after_dispatched NOT FOUND';
      v_ok := FALSE;
    END IF;

    SELECT COUNT(*) INTO v_zapp_corrupt
      FROM zapp.evolution_reconcile_jobs
     WHERE applied_at IS NOT NULL AND applied_at < dispatched_at;

    IF v_zapp_corrupt = 0 THEN
      v_report := v_report || E'\n  [OK]   F6-05 zapp: 0 corrupt rows (applied_at < dispatched_at) ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] F6-05 zapp: ' || v_zapp_corrupt || ' corrupt rows remain';
      v_ok := FALSE;
    END IF;
  ELSE
    v_report := v_report || E'\n  [WARN] F6-05/21 zapp: table not found — M26 not yet applied or empty env';
  END IF;

  IF NOT v_evo_exists AND NOT v_zapp_exists THEN
    v_report := v_report || E'\n  [WARN] Neither evo nor zapp table found — no action taken (acceptable for fresh env)';
  END IF;

  RAISE NOTICE E'M34 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M34 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
