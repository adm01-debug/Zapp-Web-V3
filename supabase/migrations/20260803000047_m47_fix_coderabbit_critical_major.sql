-- M47: Fix critical/major CodeRabbit findings across M28–M43
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Summary of fixes:
--
--   FIX-1 (M39): cron.alter_job(job_name=>...) does not exist → aborted M39 transaction.
--     Cron job is still named 'wpp2_disconnection_watchdog'. Rename via
--     unschedule + schedule (idempotent; guarded with pg_cron unavailability handler).
--
--   FIX-2 (M28/M33): fn_merge_contacts search_path includes 'public' → hardening violation.
--     Replace with SET search_path TO 'pg_catalog', 'zapp', 'evo' (no 'public').
--
--   FIX-3 (M28): UPDATE zapp.contact_notes SET note_type='general' without backup.
--     Create _backup_contact_notes_type_20260803 before UPDATE.
--
--   FIX-4 (M38): array_length(ix.indkey, 1) incompatible with int2vector type.
--     Replace with ix.indnatts = 1 in index detection block.
--     Also guard 'created_at' backfill: only apply if column exists.
--     Also add dedup backup before unique constraint on request_id.
--
--   FIX-5 (M41): All DDL/DML on public.evolution_instance_credentials (VIEW), not actual table.
--     Replace with evo.evolution_instance_credentials. Fix ROW_COUNT counter.
--
--   FIX-6 (M42): UPDATE filter '%Oficial%' too broad. Add backup before UPDATE.
--     Narrow to only ILIKE '%Cloud API%'; remove the OR '%Oficial%' condition.
--
--   FIX-7 (M34): CHECK constraint allows applied_at < dispatched_at when dispatched_at IS NULL.
--     Re-create with NULL-safe form: applied_at IS NULL OR (dispatched_at IS NOT NULL AND ...)
--
--   FIX-8 (M36): Remove hardcoded jobid=96 from health monitor; add trailing gap check.
--
-- Idempotent: all DDL uses IF EXISTS / IF NOT EXISTS; DML uses backup+guard.
-- Rollback: see individual ROLLBACK sections below.
--

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-1: Rename cron job wpp2_disconnection_watchdog → instance_disconnection_watchdog
-- M39 aborted (cron.alter_job has no job_name param → ERROR 42883 not caught).
-- The job still exists under the old name.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wpp2_disconnection_watchdog') THEN
      PERFORM cron.unschedule('wpp2_disconnection_watchdog');
      PERFORM cron.schedule(
        'instance_disconnection_watchdog',
        '*/10 * * * *',
        'SELECT zapp.fn_alert_instance_disconnection_watchdog()'
      );
      RAISE NOTICE 'M47/FIX-1: cron renamed wpp2_disconnection_watchdog → instance_disconnection_watchdog ✓';
    ELSIF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instance_disconnection_watchdog') THEN
      RAISE NOTICE 'M47/FIX-1: instance_disconnection_watchdog already exists — skipping ✓';
    ELSE
      -- Neither name exists — create fresh
      PERFORM cron.schedule(
        'instance_disconnection_watchdog',
        '*/10 * * * *',
        'SELECT zapp.fn_alert_instance_disconnection_watchdog()'
      );
      RAISE NOTICE 'M47/FIX-1: created instance_disconnection_watchdog cron (neither name existed) ✓';
    END IF;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'M47/FIX-1: pg_cron not available — skipping cron rename';
  END;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-2: fn_merge_contacts — remove 'public' from search_path
-- M28 set: SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
-- 'public' allows shadow objects; contacts merge must not include it.
-- Keep 'evo' because it accesses evo.evolution_contacts, evo.evolution_conversations.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_body TEXT;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(p.oid) INTO v_fn_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_merge_contacts'
   LIMIT 1;

  IF v_fn_body IS NULL THEN
    RAISE NOTICE 'M47/FIX-2: fn_merge_contacts not found — skipping search_path fix';
  ELSIF position('''public''' IN lower(v_fn_body)) = 0 THEN
    RAISE NOTICE 'M47/FIX-2: fn_merge_contacts search_path already free of public ✓';
  ELSE
    RAISE NOTICE 'M47/FIX-2: fn_merge_contacts has public in search_path — will be replaced below';
  END IF;
END;
$$;

-- Create or replace fn_merge_contacts without 'public' in search_path.
-- The function body is preserved from M28; only the SET search_path line changes.
-- NOTE: If fn_merge_contacts does not exist in this environment, this is a no-op safe CREATE.
CREATE OR REPLACE FUNCTION zapp.fn_merge_contacts(
  p_primary_id   UUID,
  p_secondary_id UUID,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp', 'evo'
AS $fn$
DECLARE
  v_primary   zapp.contatos%ROWTYPE;
  v_secondary zapp.contatos%ROWTYPE;
  v_merged    JSONB := '{}';
  v_now       TIMESTAMPTZ := pg_catalog.now();
BEGIN
  -- Validate inputs
  IF p_primary_id IS NULL OR p_secondary_id IS NULL THEN
    RAISE EXCEPTION 'fn_merge_contacts: both p_primary_id and p_secondary_id are required'
      USING ERRCODE = '22023';
  END IF;
  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'fn_merge_contacts: cannot merge a contact with itself'
      USING ERRCODE = '22023';
  END IF;

  -- Lock both rows to prevent concurrent merges
  SELECT * INTO v_primary   FROM zapp.contatos WHERE id = p_primary_id   FOR UPDATE;
  SELECT * INTO v_secondary FROM zapp.contatos WHERE id = p_secondary_id FOR UPDATE;

  IF v_primary.id IS NULL THEN
    RAISE EXCEPTION 'fn_merge_contacts: primary contact % not found', p_primary_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_secondary.id IS NULL THEN
    RAISE EXCEPTION 'fn_merge_contacts: secondary contact % not found', p_secondary_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Re-point child records from secondary → primary
  UPDATE zapp.contact_notes      SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE zapp.contact_audit_log  SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE zapp.contact_intelligence SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;

  -- Re-point Evolution records (schema: evo — accessible via search_path)
  UPDATE evo.evolution_contacts     SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  UPDATE evo.evolution_conversations SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;

  -- Soft-delete the secondary contact
  UPDATE zapp.contatos
     SET deleted_at = v_now,
         updated_at = v_now,
         metadata   = pg_catalog.jsonb_build_object(
                        'merged_into', p_primary_id,
                        'merged_at',   v_now,
                        'merged_by',   p_performed_by
                      )
   WHERE id = p_secondary_id;

  -- Audit log
  INSERT INTO zapp.contact_audit_log (contact_id, changed_by, action, old_values, new_values, created_at)
  VALUES (
    p_primary_id,
    p_performed_by,
    'merge',
    pg_catalog.jsonb_build_object('secondary_id', p_secondary_id),
    pg_catalog.jsonb_build_object('merged_at', v_now),
    v_now
  );

  v_merged := pg_catalog.jsonb_build_object(
    'primary_id',   p_primary_id,
    'secondary_id', p_secondary_id,
    'merged_at',    v_now,
    'merged_by',    p_performed_by
  );

  RETURN v_merged;
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_merge_contacts(uuid, uuid, uuid)
  IS 'Merge two contacts: re-points all child records to primary, soft-deletes secondary, writes audit log. '
     'M47/FIX-2: search_path no longer includes public (was M28 hardening violation).';

REVOKE EXECUTE ON FUNCTION zapp.fn_merge_contacts(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_merge_contacts(uuid, uuid, uuid) TO service_role, authenticated;

DO $$ BEGIN RAISE NOTICE 'M47/FIX-2: fn_merge_contacts search_path fixed (removed public) ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-3: Backup contact_notes before type reclassification (M28 applied no backup)
-- Only create backup if rows needing reclassification exist and backup not already present.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check if reclassifiable rows exist
  SELECT COUNT(*) INTO v_count
    FROM zapp.contact_notes
   WHERE note_type IN ('follow_up', 'system');

  IF v_count > 0 THEN
    -- Create backup table (IF NOT EXISTS to handle re-runs)
    CREATE TABLE IF NOT EXISTS zapp._backup_contact_notes_type_20260803
      AS SELECT * FROM zapp.contact_notes WHERE note_type IN ('follow_up', 'system');

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'M47/FIX-3: backed up % contact_notes rows to _backup_contact_notes_type_20260803 ✓', v_count;

    -- Apply the reclassification (M28 did this without backup; re-applying is idempotent)
    UPDATE zapp.contact_notes SET note_type = 'general' WHERE note_type IN ('follow_up', 'system');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'M47/FIX-3: reclassified % contact_notes rows to note_type=general ✓', v_count;
  ELSE
    RAISE NOTICE 'M47/FIX-3: no contact_notes with follow_up/system type — skipping ✓';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-4a: M38 — replace array_length(ix.indkey,1) with ix.indnatts = 1
-- M38 STEP 1 used array_length() on int2vector type → exception → block aborted.
-- Since M38 may have partially executed, we re-apply the index creation safely.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_idx_exists BOOLEAN;
BEGIN
  -- Check if the unique index on request_id already exists (from M38 if it succeeded partially)
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_index ix
      JOIN pg_catalog.pg_class c  ON c.oid  = ix.indexrelid
      JOIN pg_catalog.pg_class t  ON t.oid  = ix.indrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname  = 'evo'
       AND t.relname  = 'evolution_reconcile_jobs'
       AND ix.indisunique = TRUE
       AND ix.indnatts = 1   -- FIX: was array_length(ix.indkey,1) which fails on int2vector
       AND EXISTS (
         SELECT 1 FROM pg_catalog.pg_attribute a
          WHERE a.attrelid = t.oid
            AND a.attnum   = ix.indkey[0]
            AND a.attname  = 'request_id'
       )
  ) INTO v_idx_exists;

  IF v_idx_exists THEN
    RAISE NOTICE 'M47/FIX-4a: unique index on request_id already exists ✓';
  ELSE
    RAISE NOTICE 'M47/FIX-4a: unique index on request_id missing — will create after dedup';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-4b: M38 — dedup evo.evolution_reconcile_jobs before unique constraint
-- Keep the oldest row per request_id; backup duplicates first.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
  v_tbl_exists BOOLEAN;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M47/FIX-4b: evo.evolution_reconcile_jobs does not exist — skipping dedup';
    RETURN;
  END IF;

  -- Count duplicates
  SELECT COUNT(*) INTO v_count
    FROM (
      SELECT request_id
        FROM evo.evolution_reconcile_jobs
       WHERE request_id IS NOT NULL
       GROUP BY request_id
      HAVING COUNT(*) > 1
    ) dups;

  IF v_count > 0 THEN
    -- Backup duplicate rows before deletion
    CREATE TABLE IF NOT EXISTS evo._backup_reconcile_jobs_dupes_20260803 AS
      SELECT rj.*
        FROM evo.evolution_reconcile_jobs rj
       WHERE request_id IS NOT NULL
         AND rj.id NOT IN (
           SELECT DISTINCT ON (request_id) id
             FROM evo.evolution_reconcile_jobs
            WHERE request_id IS NOT NULL
            ORDER BY request_id, id ASC  -- keep oldest
         );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'M47/FIX-4b: backed up % duplicate reconcile_jobs rows ✓', v_count;

    -- Delete the duplicate rows (keeping oldest per request_id)
    DELETE FROM evo.evolution_reconcile_jobs
     WHERE request_id IS NOT NULL
       AND id NOT IN (
         SELECT DISTINCT ON (request_id) id
           FROM evo.evolution_reconcile_jobs
          WHERE request_id IS NOT NULL
          ORDER BY request_id, id ASC
       );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'M47/FIX-4b: deleted % duplicate reconcile_jobs rows ✓', v_count;
  ELSE
    RAISE NOTICE 'M47/FIX-4b: no duplicates in evolution_reconcile_jobs ✓';
  END IF;
END;
$$;

-- Now safe to add the unique constraint
DO $$
DECLARE
  v_tbl_exists      BOOLEAN;
  v_constraint_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M47/FIX-4b: table missing — skipping UNIQUE constraint';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relname = 'evolution_reconcile_jobs'
      AND con.contype = 'u'
      AND con.conname = 'uq_reconcile_jobs_request_id'
  ) INTO v_constraint_exists;

  IF v_constraint_exists THEN
    RAISE NOTICE 'M47/FIX-4b: uq_reconcile_jobs_request_id already exists ✓';
  ELSE
    ALTER TABLE evo.evolution_reconcile_jobs
      ADD CONSTRAINT uq_reconcile_jobs_request_id UNIQUE (request_id) NOT VALID;
    ALTER TABLE evo.evolution_reconcile_jobs
      VALIDATE CONSTRAINT uq_reconcile_jobs_request_id;
    RAISE NOTICE 'M47/FIX-4b: uq_reconcile_jobs_request_id created ✓';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-4c: M38 — guard 'created_at' backfill with column existence check
-- M38 did: SET dispatched_at = created_at WHERE dispatched_at IS NULL
-- But created_at may not exist in evo.evolution_reconcile_jobs.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists BOOLEAN;
  v_col_dispatched BOOLEAN;
  v_col_created    BOOLEAN;
  v_count          INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M47/FIX-4c: table missing — skipping dispatched_at backfill';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs'
      AND a.attname = 'dispatched_at' AND NOT a.attisdropped
  ) INTO v_col_dispatched;

  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs'
      AND a.attname = 'created_at' AND NOT a.attisdropped
  ) INTO v_col_created;

  IF v_col_dispatched AND v_col_created THEN
    UPDATE evo.evolution_reconcile_jobs
       SET dispatched_at = created_at
     WHERE dispatched_at IS NULL AND created_at IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'M47/FIX-4c: backfilled dispatched_at from created_at for % rows ✓', v_count;
  ELSIF v_col_dispatched AND NOT v_col_created THEN
    RAISE NOTICE 'M47/FIX-4c: created_at column does not exist — skipping dispatched_at backfill ✓';
  ELSE
    RAISE NOTICE 'M47/FIX-4c: dispatched_at column does not exist — skipping backfill ✓';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-5: M41 — use evo.evolution_instance_credentials (actual table), not public. (view)
-- M41 operated on public.evolution_instance_credentials which is a VIEW.
-- PostgreSQL cannot add UNIQUE constraints or do reliable DML on a view.
-- Re-apply the intent: backfill orphan whatsapp_connections with credentials rows.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_evo_tbl_exists  BOOLEAN;
  v_wconn_exists    BOOLEAN;
  v_col_exists      BOOLEAN;
  v_constraint_name TEXT;
  v_count           INTEGER;
BEGIN
  -- Check actual table in evo schema
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_instance_credentials'
      AND c.relkind = 'r'  -- must be actual table, not view
  ) INTO v_evo_tbl_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'whatsapp_connections'
  ) INTO v_wconn_exists;

  IF NOT v_evo_tbl_exists THEN
    RAISE NOTICE 'M47/FIX-5: evo.evolution_instance_credentials table not found (is it only a view?) — skipping';
    RETURN;
  END IF;

  IF NOT v_wconn_exists THEN
    RAISE NOTICE 'M47/FIX-5: zapp.whatsapp_connections not found — skipping';
    RETURN;
  END IF;

  -- Add UNIQUE constraint on instance_name if not present
  SELECT con.conname INTO v_constraint_name
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'evo'
     AND c.relname = 'evolution_instance_credentials'
     AND con.contype = 'u'
     AND con.conname = 'uq_evo_instance_creds_instance_name';

  IF v_constraint_name IS NULL THEN
    ALTER TABLE evo.evolution_instance_credentials
      ADD CONSTRAINT uq_evo_instance_creds_instance_name UNIQUE (instance_name) NOT VALID;
    ALTER TABLE evo.evolution_instance_credentials
      VALIDATE CONSTRAINT uq_evo_instance_creds_instance_name;
    RAISE NOTICE 'M47/FIX-5: UNIQUE(instance_name) added to evo.evolution_instance_credentials ✓';
  ELSE
    RAISE NOTICE 'M47/FIX-5: uq_evo_instance_creds_instance_name already exists ✓';
  END IF;

  -- Backfill orphan rows: whatsapp_connections with no matching credentials row
  -- Only insert if instance_name column exists in both tables
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_instance_credentials'
      AND a.attname = 'instance_name' AND NOT a.attisdropped
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE NOTICE 'M47/FIX-5: instance_name column missing from evo.evolution_instance_credentials — skipping backfill';
    RETURN;
  END IF;

  WITH orphan_wc AS (
    SELECT wc.instance_name
      FROM zapp.whatsapp_connections wc
     WHERE wc.is_active  = TRUE
       AND wc.api_type   = 'evolution'
       AND wc.instance_name IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM evo.evolution_instance_credentials ec
          WHERE ec.instance_name = wc.instance_name
       )
  )
  INSERT INTO evo.evolution_instance_credentials (instance_name, created_at, updated_at)
  SELECT o.instance_name, pg_catalog.now(), pg_catalog.now()
    FROM orphan_wc o
  ON CONFLICT (instance_name) DO NOTHING;

  -- Use ROW_COUNT to get actual inserted count
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'M47/FIX-5: inserted % orphan credentials rows ✓', v_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-6: M42 — backup + narrow UPDATE filter (remove ILIKE '%Oficial%')
-- '%Oficial%' could match "Suporte Oficial", "Produto Oficial", etc.
-- Only correct connections where name contains 'Cloud API' AND api_type = 'evolution'.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- How many rows will be affected?
  SELECT COUNT(*) INTO v_count
    FROM zapp.whatsapp_connections
   WHERE name ILIKE '%Cloud API%'
     AND api_type = 'evolution';

  IF v_count > 0 THEN
    -- Backup before UPDATE
    CREATE TABLE IF NOT EXISTS zapp._backup_whatsapp_connections_cloud_api_20260803 AS
      SELECT * FROM zapp.whatsapp_connections
       WHERE name ILIKE '%Cloud API%'
         AND api_type = 'evolution';

    RAISE NOTICE 'M47/FIX-6: backed up % whatsapp_connections rows (Cloud API filter) ✓', v_count;

    -- Apply correction (narrow filter — no %Oficial%)
    UPDATE zapp.whatsapp_connections
       SET api_type   = 'official',
           api_url    = 'https://graph.facebook.com/v21.0',
           updated_at = pg_catalog.now()
     WHERE name ILIKE '%Cloud API%'
       AND api_type = 'evolution';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'M47/FIX-6: corrected % whatsapp_connections to api_type=official ✓', v_count;
  ELSE
    RAISE NOTICE 'M47/FIX-6: no whatsapp_connections match Cloud API + evolution — skipping ✓';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-7: M34 — NULL-safe CHECK constraint on evolution_reconcile_jobs
-- Old: applied_at >= dispatched_at  (fails when dispatched_at IS NULL)
-- New: applied_at IS NULL OR (dispatched_at IS NOT NULL AND applied_at >= dispatched_at)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists BOOLEAN;
  v_con_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M47/FIX-7: evo.evolution_reconcile_jobs not found — skipping CHECK fix';
    RETURN;
  END IF;

  -- Drop old constraint (both possible names from M34)
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs'
      AND con.conname = 'ck_reconcile_applied_after_dispatched'
  ) INTO v_con_exists;

  IF v_con_exists THEN
    ALTER TABLE evo.evolution_reconcile_jobs
      DROP CONSTRAINT ck_reconcile_applied_after_dispatched;
    RAISE NOTICE 'M47/FIX-7: dropped old CHECK constraint ✓';
  END IF;

  -- Add NULL-safe version
  ALTER TABLE evo.evolution_reconcile_jobs
    ADD CONSTRAINT ck_reconcile_applied_after_dispatched
      CHECK (
        applied_at IS NULL
        OR (dispatched_at IS NOT NULL AND applied_at >= dispatched_at)
      ) NOT VALID;

  ALTER TABLE evo.evolution_reconcile_jobs
    VALIDATE CONSTRAINT ck_reconcile_applied_after_dispatched;

  RAISE NOTICE 'M47/FIX-7: NULL-safe CHECK constraint created and validated ✓';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX-8: M36 — health monitor: remove hardcoded jobid=96, add trailing gap check
-- M36 assumed jobid=96 for the instance health check cron.
-- Replace with dynamic lookup by job name.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_check_instance_health_monitor()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp'
AS $fn$
DECLARE
  v_job_id         BIGINT;
  v_last_exec      TIMESTAMPTZ;
  v_lag_minutes    NUMERIC;
  v_result         JSONB;
  v_threshold_min  CONSTANT NUMERIC := 20;  -- alert if last run > 20 min ago
BEGIN
  -- Dynamic job lookup by name (not hardcoded id)
  BEGIN
    SELECT jobid, last_run_start_time
      INTO v_job_id, v_last_exec
      FROM (
        SELECT j.jobid,
               (SELECT MAX(start_time)
                  FROM cron.job_run_details d
                 WHERE d.jobid = j.jobid
               ) AS last_run_start_time
          FROM cron.job j
         WHERE j.jobname = 'instance_disconnection_watchdog'
         LIMIT 1
      ) sub;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'fn_check_instance_health_monitor: pg_cron not available';
    RETURN pg_catalog.jsonb_build_object(
      'status',      'pg_cron_unavailable',
      'checked_at',  pg_catalog.now()
    );
  END;

  IF v_job_id IS NULL THEN
    RAISE NOTICE 'fn_check_instance_health_monitor: watchdog cron job not found';
    RETURN pg_catalog.jsonb_build_object(
      'status',      'cron_job_missing',
      'job_name',    'instance_disconnection_watchdog',
      'checked_at',  pg_catalog.now()
    );
  END IF;

  -- Trailing gap check: how long since last successful execution?
  IF v_last_exec IS NOT NULL THEN
    v_lag_minutes := pg_catalog.extract(epoch FROM (pg_catalog.now() - v_last_exec)) / 60.0;

    IF v_lag_minutes > v_threshold_min THEN
      RAISE WARNING 'fn_check_instance_health_monitor: watchdog last ran % minutes ago (threshold: %)',
        round(v_lag_minutes::numeric, 1), v_threshold_min;
    END IF;
  ELSE
    v_lag_minutes := NULL;
    RAISE NOTICE 'fn_check_instance_health_monitor: no execution history found for watchdog job';
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'status',          CASE WHEN v_lag_minutes IS NULL THEN 'no_history'
                            WHEN v_lag_minutes > v_threshold_min THEN 'stale'
                            ELSE 'ok'
                       END,
    'job_id',          v_job_id,
    'last_exec_at',    v_last_exec,
    'lag_minutes',     v_lag_minutes,
    'threshold_min',   v_threshold_min,
    'checked_at',      pg_catalog.now()
  );

  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_check_instance_health_monitor()
  IS 'Health monitor (M36/M47 fix): checks lag of instance_disconnection_watchdog cron. '
     'M47 fix: no longer uses hardcoded jobid=96; dynamically resolves by job name. '
     'Adds trailing-gap alert when last run > 20 min ago.';

REVOKE EXECUTE ON FUNCTION zapp.fn_check_instance_health_monitor() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_check_instance_health_monitor() TO service_role;

DO $$ BEGIN RAISE NOTICE 'M47/FIX-8: fn_check_instance_health_monitor replaced (dynamic job lookup + trailing-gap check) ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ok     BOOLEAN := TRUE;
  v_report TEXT    := '';
  v_body   TEXT;
  v_count  INTEGER;
BEGIN
  -- FIX-1: cron job renamed
  BEGIN
    SELECT COUNT(*) INTO v_count
      FROM cron.job
     WHERE jobname = 'instance_disconnection_watchdog';

    IF v_count > 0 THEN
      v_report := v_report || E'\n  [OK]   FIX-1: instance_disconnection_watchdog cron exists ✓';
    ELSE
      v_report := v_report || E'\n  [WARN] FIX-1: instance_disconnection_watchdog cron not found (pg_cron may be unavailable)';
      -- Not a hard failure — pg_cron may not be installed
    END IF;

    SELECT COUNT(*) INTO v_count
      FROM cron.job
     WHERE jobname = 'wpp2_disconnection_watchdog';

    IF v_count > 0 THEN
      v_report := v_report || E'\n  [FAIL] FIX-1: old name wpp2_disconnection_watchdog still exists';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   FIX-1: old wpp2_disconnection_watchdog name gone ✓';
    END IF;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    v_report := v_report || E'\n  [SKIP] FIX-1: pg_cron not available — skipping cron verification';
  END;

  -- FIX-2: fn_merge_contacts search_path free of public
  SELECT pg_catalog.pg_get_functiondef(p.oid)
    INTO v_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_merge_contacts'
   LIMIT 1;

  IF v_body IS NULL THEN
    v_report := v_report || E'\n  [WARN] FIX-2: fn_merge_contacts not found (may not exist in this env)';
  ELSIF position(', ''public''' IN lower(v_body)) > 0
        OR position('''public'',' IN lower(v_body)) > 0
  THEN
    v_report := v_report || E'\n  [FAIL] FIX-2: fn_merge_contacts still has public in search_path';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   FIX-2: fn_merge_contacts search_path free of public ✓';
  END IF;

  -- FIX-7: CHECK constraint is NULL-safe
  SELECT COUNT(*) INTO v_count
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'evo'
     AND c.relname = 'evolution_reconcile_jobs'
     AND con.conname = 'ck_reconcile_applied_after_dispatched';

  IF v_count > 0 THEN
    v_report := v_report || E'\n  [OK]   FIX-7: ck_reconcile_applied_after_dispatched constraint exists ✓';
  ELSE
    v_report := v_report || E'\n  [WARN] FIX-7: CHECK constraint not found (table may not exist in this env)';
  END IF;

  -- FIX-8: fn_check_instance_health_monitor exists and has no hardcoded jobid
  SELECT pg_catalog.pg_get_functiondef(p.oid)
    INTO v_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_check_instance_health_monitor'
   LIMIT 1;

  IF v_body IS NULL THEN
    v_report := v_report || E'\n  [FAIL] FIX-8: fn_check_instance_health_monitor NOT FOUND';
    v_ok := FALSE;
  ELSE
    IF position('jobid = 96' IN lower(v_body)) > 0
       OR position('jobid=96' IN lower(v_body)) > 0
    THEN
      v_report := v_report || E'\n  [FAIL] FIX-8: hardcoded jobid=96 still present';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   FIX-8: no hardcoded jobid in fn_check_instance_health_monitor ✓';
    END IF;

    IF position('instance_disconnection_watchdog' IN lower(v_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   FIX-8: dynamic job name lookup present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] FIX-8: dynamic job lookup missing';
      v_ok := FALSE;
    END IF;

    IF position('lag_minutes' IN lower(v_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   FIX-8: trailing-gap check present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] FIX-8: trailing-gap check missing';
      v_ok := FALSE;
    END IF;
  END IF;

  RAISE NOTICE E'M47 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M47 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
