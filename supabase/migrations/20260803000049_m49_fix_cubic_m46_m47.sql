-- M49: Fix cubic-dev-ai findings in M46 and M47
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problems fixed:
--
--   FIX-1 (M46 gap): trg_validate_whatsapp_connection_url fires on api_url only.
--     Changing api_type alone (e.g. 'evolution' → 'official') bypasses the trigger.
--     The validator exempts api_type='official' at runtime, but if api_type changes
--     without api_url, the OLD api_url (set for evolution) stays unchecked.
--     Fix: re-bind trigger to BEFORE INSERT OR UPDATE OF api_url, api_type.
--
--   FIX-2 (M47 dead code): M47 created zapp.fn_merge_contacts(uuid, uuid, uuid) —
--     wrong name; the UI and all callers use zapp.merge_contacts. Dead code.
--     Fix: DROP FUNCTION IF EXISTS.
--
--   FIX-3 (M47 search_path): merge_contacts had search_path including 'evo' and
--     'public' — violates SECURITY DEFINER hardening. All evo.* refs in the body
--     are explicitly schema-qualified; removing 'evo'+'public' is safe.
--     Fix: SET search_path TO 'pg_catalog', 'zapp' only.
--
--   FIX-4 (M47 audit bug): M47's merge function wrote to contact_audit_log with
--     column name 'created_at' (does not exist — correct: 'changed_at') and
--     action='merge' (violates CHECK — allowed: INSERT/UPDATE/DELETE/RESTORE).
--     Fix: correct INSERT (action='UPDATE', column=changed_at).
--
--   FIX-5 (M47 backup idempotency): CREATE TABLE IF NOT EXISTS ... AS SELECT *
--     only populates on first run. Subsequent runs leave the backup empty.
--     Fix: Add INSERT WHERE NOT EXISTS for idempotent backfill.
--
--   FIX-6a (M47 UNIQUE NOT VALID): UNIQUE ... NOT VALID is invalid PostgreSQL
--     syntax (NOT VALID applies only to CHECK and FK, never to UNIQUE).
--     M47 used it on evolution_reconcile_jobs.request_id — causing the entire
--     M47 transaction to roll back. Nothing from M47 was persisted.
--     Fix: dedup DELETE first, then ADD CONSTRAINT ... UNIQUE (no NOT VALID).
--
--   FIX-6b (M47 UNIQUE NOT VALID): Same bug on evolution_instance_credentials.
--     instance_name — same rollback. Fix: same dedup + UNIQUE pattern.
--
--   FIX-7 (M47 orphan INSERT missing cols): The orphan credentials INSERT omitted
--     required columns is_active and health_status. Fix: add is_active=FALSE,
--     health_status='orphaned'.
--
--   FIX-8 (M47 CHECK without backfill): ADD CHECK (applied_at >= dispatched_at)
--     then VALIDATE would fail because existing rows with applied_at IS NOT NULL
--     AND dispatched_at IS NULL violate the intended invariant. Fix: backfill
--     dispatched_at first, then add NOT VALID, then VALIDATE in exception handler.
--
-- Note: M47 was a complete rollback (UNIQUE NOT VALID + unguarded DO blocks).
--   All of M47's intended work is re-done here with correct syntax.
--
-- Idempotent: all steps use IF EXISTS / IF NOT EXISTS / ON CONFLICT / exception
--   handlers. Safe to re-run.
--
-- Rollback:
--   STEP 1: Rebind trigger to original (api_url only)
--   STEP 3-4: Re-apply M33 CREATE OR REPLACE with original search_path
--   STEP 2: Cannot un-drop fn_merge_contacts (was dead code — recreate if needed)
--   STEP 5: DROP TABLE IF EXISTS zapp._backup_contact_notes_type_20260803
--   STEP 6-7: DROP CONSTRAINT + re-insert dupes from backup tables
--   STEP 9: DROP CONSTRAINT ck_reconcile_applied_after_dispatched

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 / FIX-1: Re-bind trg_validate_whatsapp_connection_url to include
--                  api_type in the UPDATE OF column list.
--
-- M46 set: BEFORE INSERT OR UPDATE OF api_url
-- Problem: UPDATE SET api_type='official' (without touching api_url) bypasses
--           the trigger. The validator's official exemption at runtime can only
--           run if the trigger fires at all.
-- Fix: BEFORE INSERT OR UPDATE OF api_url, api_type
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_validate_whatsapp_connection_url ON zapp.whatsapp_connections;

CREATE TRIGGER trg_validate_whatsapp_connection_url
  BEFORE INSERT OR UPDATE OF api_url, api_type
  ON zapp.whatsapp_connections
  FOR EACH ROW
  EXECUTE FUNCTION zapp.fn_validate_whatsapp_connection_url();

DO $$ BEGIN RAISE NOTICE 'M49 STEP 1: trigger rebound to UPDATE OF api_url, api_type ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 / FIX-2: Drop dead code zapp.fn_merge_contacts(uuid, uuid, uuid)
--
-- M47 created fn_merge_contacts with wrong name. The UI and all callers use
-- zapp.merge_contacts. This overload is unreachable and was never intended.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.fn_merge_contacts(uuid, uuid, uuid);

DO $$ BEGIN RAISE NOTICE 'M49 STEP 2: fn_merge_contacts(uuid,uuid,uuid) dropped (dead code) ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 / FIX-3 + FIX-4: Recreate merge_contacts(uuid, uuid, boolean)
--
-- Changes from M33:
--   a) SET search_path TO 'pg_catalog', 'zapp'  (was: + 'evo', 'public')
--      All evo.* references in the body are explicitly schema-qualified; safe.
--   b) Replace the incorrect contact_audit_log INSERT (M47 used wrong column
--      'created_at' and invalid action 'merge') with the correct one:
--      action='UPDATE', column=changed_at, pg_catalog-qualified builtins.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.merge_contacts(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION zapp.merge_contacts(
  p_primary_id   uuid,
  p_secondary_id uuid,
  p_dry_run      boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp'
AS $fn$
DECLARE
  v_primary         evo.evolution_contacts%ROWTYPE;
  v_secondary       evo.evolution_contacts%ROWTYPE;
  v_lock_first_id   uuid;
  v_lock_second_id  uuid;
  v_last_consent    timestamptz;
  v_last_opt_out    timestamptz;
  v_merged_consent  timestamptz;
  v_merged_opt_out  timestamptz;
  v_msgs_relinked   integer := 0;
  v_notes_relinked  integer := 0;
  v_tasks_relinked  integer := 0;
  v_deals_relinked  integer := 0;
  v_tags_relinked   integer := 0;
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'merge_contacts: permission denied — admin or supervisor required'
      USING ERRCODE = '42501';
  END IF;
  IF p_primary_id IS NULL OR p_secondary_id IS NULL THEN
    RAISE EXCEPTION 'merge_contacts: both UUIDs must be non-null' USING ERRCODE = '22023';
  END IF;
  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'merge_contacts: cannot merge a contact with itself' USING ERRCODE = '22023';
  END IF;

  -- Lock in UUID order to prevent deadlocks
  v_lock_first_id  := LEAST(p_primary_id,   p_secondary_id);
  v_lock_second_id := GREATEST(p_primary_id, p_secondary_id);
  PERFORM id FROM evo.evolution_contacts
   WHERE id IN (v_lock_first_id, v_lock_second_id) ORDER BY id FOR UPDATE;

  -- Read locked rows
  SELECT * INTO v_primary FROM evo.evolution_contacts WHERE id = p_primary_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contacts: primary % not found or soft-deleted', p_primary_id
      USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_secondary FROM evo.evolution_contacts WHERE id = p_secondary_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contacts: secondary % not found or soft-deleted', p_secondary_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Dry-run: return preview without making changes
  IF p_dry_run THEN
    RETURN pg_catalog.jsonb_build_object(
      'dry_run',        true,
      'primary_id',     p_primary_id,
      'secondary_id',   p_secondary_id,
      'primary_name',   v_primary.push_name,
      'secondary_name', v_secondary.push_name
    );
  END IF;

  -- LGPD: merge consent/opt-out timestamps (most-recent wins)
  v_last_consent := GREATEST(v_primary.lgpd_consent_at, v_secondary.lgpd_consent_at);
  v_last_opt_out := GREATEST(v_primary.lgpd_opt_out_at, v_secondary.lgpd_opt_out_at);
  IF v_last_consent IS NOT NULL AND (v_last_opt_out IS NULL OR v_last_consent > v_last_opt_out) THEN
    v_merged_consent := v_last_consent;
    v_merged_opt_out := NULL;
  ELSE
    v_merged_consent := v_last_consent;
    v_merged_opt_out := v_last_opt_out;
  END IF;

  -- Merge fields onto primary (primary wins on non-null conflict)
  UPDATE evo.evolution_contacts
     SET push_name        = COALESCE(v_primary.push_name,        v_secondary.push_name),
         profile_pic_url  = COALESCE(v_primary.profile_pic_url,  v_secondary.profile_pic_url),
         full_name        = COALESCE(v_primary.full_name,        v_secondary.full_name),
         phone_number     = COALESCE(v_primary.phone_number,     v_secondary.phone_number),
         email            = COALESCE(v_primary.email,            v_secondary.email),
         company          = COALESCE(v_primary.company,          v_secondary.company),
         lead_status      = COALESCE(v_primary.lead_status,      v_secondary.lead_status),
         lgpd_consent_at  = v_merged_consent,
         lgpd_opt_out_at  = v_merged_opt_out,
         updated_at       = pg_catalog.now()
   WHERE id = p_primary_id;

  -- Mark secondary with merge source (column may not exist in all deployments)
  BEGIN
    UPDATE evo.evolution_contacts
       SET merge_source_id = p_primary_id
     WHERE id = p_secondary_id;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- Relink messages
  UPDATE evo.evolution_messages SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  GET DIAGNOSTICS v_msgs_relinked = ROW_COUNT;

  -- Relink notes
  UPDATE zapp.contact_notes SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  GET DIAGNOSTICS v_notes_relinked = ROW_COUNT;

  -- Relink tasks (table may not exist in all deployments)
  BEGIN
    EXECUTE 'UPDATE evo.evolution_tasks SET contact_id=$1 WHERE contact_id=$2'
      USING p_primary_id, p_secondary_id;
    GET DIAGNOSTICS v_tasks_relinked = ROW_COUNT;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- Relink deals (table may not exist in all deployments)
  BEGIN
    EXECUTE 'UPDATE evo.evolution_deals SET contact_id=$1 WHERE contact_id=$2'
      USING p_primary_id, p_secondary_id;
    GET DIAGNOSTICS v_deals_relinked = ROW_COUNT;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- Relink tags: dedup first, then re-home orphaned tags
  BEGIN
    EXECUTE 'DELETE FROM zapp.contact_tags WHERE contact_id=$2
               AND tag_id IN (SELECT tag_id FROM zapp.contact_tags WHERE contact_id=$1)'
      USING p_primary_id, p_secondary_id;
    EXECUTE 'UPDATE zapp.contact_tags SET contact_id=$1 WHERE contact_id=$2'
      USING p_primary_id, p_secondary_id;
    GET DIAGNOSTICS v_tags_relinked = ROW_COUNT;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- Soft-delete secondary
  UPDATE evo.evolution_contacts
     SET deleted_at      = pg_catalog.now(),
         deleted_by      = auth.uid(),
         deleted_reason  = 'merged_into:' || p_primary_id::text,
         undo_expires_at = pg_catalog.now() + INTERVAL '30 days',
         updated_at      = pg_catalog.now()
   WHERE id = p_secondary_id AND deleted_at IS NULL;

  -- Audit: zapp.audit_logs (general operations log)
  INSERT INTO zapp.audit_logs (action, entity_type, entity_id, user_id, details)
  VALUES (
    'merge_contacts', 'contact', p_primary_id, auth.uid(),
    pg_catalog.jsonb_build_object(
      'secondary_id',    p_secondary_id,
      'msgs_relinked',   v_msgs_relinked,
      'notes_relinked',  v_notes_relinked,
      'tasks_relinked',  v_tasks_relinked,
      'deals_relinked',  v_deals_relinked,
      'tags_relinked',   v_tags_relinked,
      'merged_at',       pg_catalog.now()
    )
  ) ON CONFLICT DO NOTHING;

  -- Audit: public.contact_audit_log (contact-specific change log)
  -- action must be one of: INSERT, UPDATE, DELETE, RESTORE (per CHECK constraint)
  -- column is changed_at (NOT created_at — M47 had wrong column name)
  INSERT INTO public.contact_audit_log (
    contact_id,
    changed_by,
    action,
    old_values,
    new_values,
    changed_at
  ) VALUES (
    p_primary_id,
    auth.uid(),
    'UPDATE',
    pg_catalog.jsonb_build_object(
      'merged_secondary_id', p_secondary_id
    ),
    pg_catalog.jsonb_build_object(
      'action',          'merge',
      'secondary_id',    p_secondary_id,
      'msgs_relinked',   v_msgs_relinked,
      'notes_relinked',  v_notes_relinked,
      'tags_relinked',   v_tags_relinked,
      'merged_at',       pg_catalog.now()
    ),
    pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'success',         true,
    'primary_id',      p_primary_id,
    'secondary_id',    p_secondary_id,
    'msgs_relinked',   v_msgs_relinked,
    'notes_relinked',  v_notes_relinked,
    'tasks_relinked',  v_tasks_relinked,
    'deals_relinked',  v_deals_relinked,
    'tags_relinked',   v_tags_relinked
  );
END;
$fn$;

COMMENT ON FUNCTION zapp.merge_contacts(uuid, uuid, boolean)
  IS 'Merge two Evolution contacts: relinks messages/notes/tasks/deals/tags, '
     'soft-deletes secondary, LGPD-merges consent timestamps. '
     'SECURITY DEFINER SET search_path = pg_catalog, zapp (M49: removed evo+public). '
     'Audits to both zapp.audit_logs and public.contact_audit_log '
     '(action=UPDATE, M49 fix: was action=merge with wrong column changed_at).';

REVOKE EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, boolean) TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'M49 STEP 3: merge_contacts(uuid,uuid,boolean) recreated with hardened search_path + correct audit ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 / FIX-3: Recreate merge_contacts(uuid, uuid, jsonb) wrapper
--
-- Changes from M33:
--   a) SET search_path TO 'pg_catalog', 'zapp'  (was: + 'evo', 'public')
--   b) NO DEFAULT on p_options (avoids 2-arg overload ambiguity in PG)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.merge_contacts(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION zapp.merge_contacts(
  p_primary_id   uuid,
  p_secondary_id uuid,
  p_options      jsonb        -- intentionally NO DEFAULT: avoids 2-arg overload ambiguity
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp'
AS $wrapper$
DECLARE
  v_dry_run boolean;
BEGIN
  v_dry_run := COALESCE((p_options->>'dry_run')::boolean, false);
  RETURN zapp.merge_contacts(p_primary_id, p_secondary_id, v_dry_run);
END;
$wrapper$;

COMMENT ON FUNCTION zapp.merge_contacts(uuid, uuid, jsonb)
  IS 'JSONB-options wrapper for merge_contacts(uuid,uuid,boolean). '
     'Accepts {dry_run: bool}. SECURITY DEFINER SET search_path = pg_catalog, zapp. '
     'M49: removed evo+public from search_path; no DEFAULT on p_options.';

REVOKE EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, jsonb) TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'M49 STEP 4: merge_contacts(uuid,uuid,jsonb) wrapper recreated ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5 / FIX-5: contact_notes type backup — idempotent
--
-- M47 used CREATE TABLE IF NOT EXISTS ... AS SELECT * which only populates
-- on the first run. Subsequent runs create an empty table (IF NOT EXISTS
-- condition is met but the AS SELECT * body is skipped).
-- Fix: CREATE TABLE IF NOT EXISTS first, then INSERT WHERE NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp._backup_contact_notes_type_20260803
  AS SELECT * FROM zapp.contact_notes WHERE false;

-- Idempotent backfill: only copy rows not yet in the backup table
INSERT INTO zapp._backup_contact_notes_type_20260803
SELECT s.*
  FROM zapp.contact_notes s
 WHERE NOT EXISTS (
   SELECT 1 FROM zapp._backup_contact_notes_type_20260803 b WHERE b.id = s.id
 );

DO $$ BEGIN RAISE NOTICE 'M49 STEP 5: _backup_contact_notes_type_20260803 populated (idempotent) ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6 / FIX-6a: evolution_reconcile_jobs.request_id UNIQUE constraint
--
-- M47 attempted UNIQUE (request_id) NOT VALID — invalid PostgreSQL syntax.
-- This caused M47 to roll back entirely.
-- Fix: backup dupes → dedup DELETE → DROP IF EXISTS → ADD UNIQUE (no NOT VALID).
-- Entire step guarded: only runs if the table exists.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists BOOLEAN;
  v_dup_count  INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M49 STEP 6: evo.evolution_reconcile_jobs not found — skipping';
    RETURN;
  END IF;

  -- Backup duplicates before deletion (idempotent)
  CREATE TABLE IF NOT EXISTS evo._backup_reconcile_jobs_dupes_20260803
    AS SELECT * FROM evo.evolution_reconcile_jobs WHERE false;

  INSERT INTO evo._backup_reconcile_jobs_dupes_20260803
  SELECT s.*
    FROM evo.evolution_reconcile_jobs s
   WHERE NOT EXISTS (
     SELECT 1 FROM evo._backup_reconcile_jobs_dupes_20260803 b WHERE b.id = s.id
   )
     AND s.request_id IN (
       SELECT request_id
         FROM evo.evolution_reconcile_jobs
        WHERE request_id IS NOT NULL
        GROUP BY request_id
       HAVING COUNT(*) > 1
     );

  GET DIAGNOSTICS v_dup_count = ROW_COUNT;
  RAISE NOTICE 'M49 STEP 6: % duplicate reconcile_jobs rows backed up', v_dup_count;

  -- Remove duplicates: keep the row with the smallest id (ctid tie-break)
  EXECUTE '
    DELETE FROM evo.evolution_reconcile_jobs
     WHERE id IN (
       SELECT id FROM (
         SELECT id,
                ROW_NUMBER() OVER (PARTITION BY request_id ORDER BY id) AS rn
           FROM evo.evolution_reconcile_jobs
          WHERE request_id IS NOT NULL
       ) ranked
        WHERE rn > 1
     )
  ';

  -- Drop existing constraint if present (from any prior partial migration)
  BEGIN
    EXECUTE 'ALTER TABLE evo.evolution_reconcile_jobs DROP CONSTRAINT IF EXISTS uq_reconcile_jobs_request_id';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Add UNIQUE constraint (no NOT VALID — invalid for UNIQUE; table is now deduped)
  BEGIN
    EXECUTE 'ALTER TABLE evo.evolution_reconcile_jobs ADD CONSTRAINT uq_reconcile_jobs_request_id UNIQUE (request_id)';
    RAISE NOTICE 'M49 STEP 6: UNIQUE constraint uq_reconcile_jobs_request_id added ✓';
  EXCEPTION WHEN duplicate_table OR others THEN
    RAISE NOTICE 'M49 STEP 6: UNIQUE constraint already exists or error: %', SQLERRM;
  END;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7 / FIX-6b: evolution_instance_credentials.instance_name UNIQUE
--
-- Same UNIQUE NOT VALID bug as STEP 6 but for instance_credentials.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists BOOLEAN;
  v_dup_count  INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'evo' AND c.relname = 'evolution_instance_credentials'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M49 STEP 7: evo.evolution_instance_credentials not found — skipping';
    RETURN;
  END IF;

  -- Backup duplicates before deletion (idempotent)
  CREATE TABLE IF NOT EXISTS evo._backup_instance_creds_dupes_20260803
    AS SELECT * FROM evo.evolution_instance_credentials WHERE false;

  INSERT INTO evo._backup_instance_creds_dupes_20260803
  SELECT s.*
    FROM evo.evolution_instance_credentials s
   WHERE NOT EXISTS (
     SELECT 1 FROM evo._backup_instance_creds_dupes_20260803 b WHERE b.id = s.id
   )
     AND s.instance_name IN (
       SELECT instance_name
         FROM evo.evolution_instance_credentials
        WHERE instance_name IS NOT NULL
        GROUP BY instance_name
       HAVING COUNT(*) > 1
     );

  GET DIAGNOSTICS v_dup_count = ROW_COUNT;
  RAISE NOTICE 'M49 STEP 7: % duplicate instance_credentials rows backed up', v_dup_count;

  -- Remove duplicates: keep the row with the smallest id
  EXECUTE '
    DELETE FROM evo.evolution_instance_credentials
     WHERE id IN (
       SELECT id FROM (
         SELECT id,
                ROW_NUMBER() OVER (PARTITION BY instance_name ORDER BY id) AS rn
           FROM evo.evolution_instance_credentials
          WHERE instance_name IS NOT NULL
       ) ranked
        WHERE rn > 1
     )
  ';

  -- Drop existing constraint if present
  BEGIN
    EXECUTE 'ALTER TABLE evo.evolution_instance_credentials DROP CONSTRAINT IF EXISTS uq_evo_instance_creds_instance_name';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Add UNIQUE constraint (no NOT VALID — invalid for UNIQUE; table is now deduped)
  BEGIN
    EXECUTE 'ALTER TABLE evo.evolution_instance_credentials ADD CONSTRAINT uq_evo_instance_creds_instance_name UNIQUE (instance_name)';
    RAISE NOTICE 'M49 STEP 7: UNIQUE constraint uq_evo_instance_creds_instance_name added ✓';
  EXCEPTION WHEN duplicate_table OR others THEN
    RAISE NOTICE 'M49 STEP 7: UNIQUE constraint already exists or error: %', SQLERRM;
  END;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8 / FIX-7: Orphan credentials INSERT — add missing is_active + health_status
--
-- M47's INSERT omitted required columns is_active and health_status.
-- Fix: INSERT with is_active=FALSE, health_status='orphaned'.
-- Entire step guarded: only runs if both tables exist and both columns exist.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_creds_tbl     BOOLEAN;
  v_col_is_active BOOLEAN;
  v_col_health    BOOLEAN;
  v_inserted      INTEGER;
BEGIN
  -- Check table exists
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'evo' AND c.relname = 'evolution_instance_credentials'
  ) INTO v_creds_tbl;

  IF NOT v_creds_tbl THEN
    RAISE NOTICE 'M49 STEP 8: evo.evolution_instance_credentials not found — skipping';
    RETURN;
  END IF;

  -- Check required columns exist
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'evo' AND c.relname = 'evolution_instance_credentials'
       AND a.attname = 'is_active' AND a.attnum > 0 AND NOT a.attisdropped
  ) INTO v_col_is_active;

  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'evo' AND c.relname = 'evolution_instance_credentials'
       AND a.attname = 'health_status' AND a.attnum > 0 AND NOT a.attisdropped
  ) INTO v_col_health;

  IF NOT v_col_is_active THEN
    RAISE NOTICE 'M49 STEP 8: column is_active not found in evolution_instance_credentials — skipping';
    RETURN;
  END IF;
  IF NOT v_col_health THEN
    RAISE NOTICE 'M49 STEP 8: column health_status not found in evolution_instance_credentials — skipping';
    RETURN;
  END IF;

  -- Insert orphan credentials: active Evolution connections with no credential row
  EXECUTE '
    INSERT INTO evo.evolution_instance_credentials (
      instance_name,
      is_active,
      health_status,
      created_at
    )
    SELECT
      wc.instance_name,
      FALSE             AS is_active,
      ''orphaned''      AS health_status,
      pg_catalog.now()  AS created_at
    FROM zapp.whatsapp_connections wc
    WHERE wc.is_active   = TRUE
      AND wc.api_type    = ''evolution''
      AND wc.instance_name IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
          FROM evo.evolution_instance_credentials ic
         WHERE ic.instance_name = wc.instance_name
      )
    ON CONFLICT DO NOTHING
  ';
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'M49 STEP 8: % orphan credential rows inserted (is_active=FALSE, health_status=orphaned) ✓', v_inserted;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9 / FIX-8: dispatched_at backfill + CHECK constraint
--
-- M47 added CHECK (applied_at >= dispatched_at) then tried to VALIDATE — but
-- rows with applied_at IS NOT NULL and dispatched_at IS NULL violate the
-- intended invariant, causing VALIDATE to fail.
-- Fix:
--   a) Backfill: SET dispatched_at = applied_at WHERE applied_at IS NOT NULL
--      AND dispatched_at IS NULL
--   b) Fix inverted timestamps: SET dispatched_at = applied_at WHERE applied_at
--      < dispatched_at (applied before dispatch is impossible)
--   c) DROP old constraint IF EXISTS
--   d) ADD new NULL-safe CHECK NOT VALID
--   e) VALIDATE in exception handler (fail-safe)
-- Guarded: only if table exists and column dispatched_at exists.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tbl_exists     BOOLEAN;
  v_col_dispatched BOOLEAN;
  v_col_applied    BOOLEAN;
  v_backfilled     INTEGER;
  v_inverted       INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs'
  ) INTO v_tbl_exists;

  IF NOT v_tbl_exists THEN
    RAISE NOTICE 'M49 STEP 9: evo.evolution_reconcile_jobs not found — skipping';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs'
       AND a.attname = 'dispatched_at' AND a.attnum > 0 AND NOT a.attisdropped
  ) INTO v_col_dispatched;

  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs'
       AND a.attname = 'applied_at' AND a.attnum > 0 AND NOT a.attisdropped
  ) INTO v_col_applied;

  IF NOT v_col_dispatched THEN
    RAISE NOTICE 'M49 STEP 9: column dispatched_at not found — skipping';
    RETURN;
  END IF;
  IF NOT v_col_applied THEN
    RAISE NOTICE 'M49 STEP 9: column applied_at not found — skipping';
    RETURN;
  END IF;

  -- a) Backfill: applied but dispatched_at missing → use applied_at as lower bound
  EXECUTE '
    UPDATE evo.evolution_reconcile_jobs
       SET dispatched_at = applied_at
     WHERE applied_at IS NOT NULL
       AND dispatched_at IS NULL
  ';
  GET DIAGNOSTICS v_backfilled = ROW_COUNT;
  RAISE NOTICE 'M49 STEP 9: % rows backfilled (dispatched_at = applied_at) ✓', v_backfilled;

  -- b) Fix inverted timestamps (applied_at < dispatched_at is impossible)
  EXECUTE '
    UPDATE evo.evolution_reconcile_jobs
       SET dispatched_at = applied_at
     WHERE applied_at    IS NOT NULL
       AND dispatched_at IS NOT NULL
       AND applied_at    < dispatched_at
  ';
  GET DIAGNOSTICS v_inverted = ROW_COUNT;
  RAISE NOTICE 'M49 STEP 9: % rows with inverted timestamps fixed ✓', v_inverted;

  -- c) Drop existing constraint if any (from partial/rolled-back migrations)
  BEGIN
    EXECUTE 'ALTER TABLE evo.evolution_reconcile_jobs DROP CONSTRAINT IF EXISTS ck_reconcile_applied_after_dispatched';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- d) Add NULL-safe CHECK constraint (NOT VALID — will validate below)
  --    Invariant: if applied_at is set, dispatched_at must be set and <= applied_at
  BEGIN
    EXECUTE '
      ALTER TABLE evo.evolution_reconcile_jobs
        ADD CONSTRAINT ck_reconcile_applied_after_dispatched
        CHECK (applied_at IS NULL OR (dispatched_at IS NOT NULL AND applied_at >= dispatched_at))
        NOT VALID
    ';
    RAISE NOTICE 'M49 STEP 9: CHECK constraint ck_reconcile_applied_after_dispatched added NOT VALID ✓';
  EXCEPTION WHEN duplicate_object OR others THEN
    RAISE NOTICE 'M49 STEP 9: CHECK constraint already exists or add error: %', SQLERRM;
  END;

  -- e) Validate (fail-safe: log notice on failure, do not abort migration)
  BEGIN
    EXECUTE 'ALTER TABLE evo.evolution_reconcile_jobs VALIDATE CONSTRAINT ck_reconcile_applied_after_dispatched';
    RAISE NOTICE 'M49 STEP 9: CHECK constraint validated ✓';
  EXCEPTION WHEN check_violation OR others THEN
    RAISE NOTICE 'M49 STEP 9: CHECK constraint validation skipped — remaining violations detected (investigate manually): %', SQLERRM;
  END;
END;
$$;

DO $$ BEGIN RAISE NOTICE 'M49 STEP 9: dispatched_at backfill + CHECK constraint complete ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ok       BOOLEAN := TRUE;
  v_report   TEXT    := '';
  v_trg_def  TEXT;
  v_fn_exists BOOLEAN;
  v_sp_text  TEXT;
  v_sp_ok    BOOLEAN;
BEGIN
  -- FIX-1: trigger column list includes api_type
  SELECT pg_catalog.pg_get_triggerdef(t.oid)
    INTO v_trg_def
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zapp'
     AND c.relname = 'whatsapp_connections'
     AND t.tgname  = 'trg_validate_whatsapp_connection_url'
     AND NOT t.tgisinternal
   LIMIT 1;

  IF v_trg_def IS NULL THEN
    v_report := v_report || E'\n  [FAIL] M49/FIX-1: trigger trg_validate_whatsapp_connection_url NOT FOUND';
    v_ok := FALSE;
  ELSE
    IF position('api_type' IN lower(v_trg_def)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M49/FIX-1: trigger includes api_type column ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M49/FIX-1: trigger does NOT include api_type column';
      v_ok := FALSE;
    END IF;
    IF position('api_url' IN lower(v_trg_def)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M49/FIX-1: trigger includes api_url column ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M49/FIX-1: trigger does NOT include api_url column';
      v_ok := FALSE;
    END IF;
  END IF;

  -- FIX-2: fn_merge_contacts dead code is gone
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'zapp' AND p.proname = 'fn_merge_contacts'
  ) INTO v_fn_exists;

  IF v_fn_exists THEN
    v_report := v_report || E'\n  [FAIL] M49/FIX-2: fn_merge_contacts still exists (dead code not removed)';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   M49/FIX-2: fn_merge_contacts removed ✓';
  END IF;

  -- FIX-3: merge_contacts(uuid,uuid,boolean) exists with hardened search_path
  --   Use proconfig (NOT pg_get_functiondef text search) to avoid false positives
  --   from comments in the function body.
  SELECT pg_catalog.array_to_string(p.proconfig, ',')
    INTO v_sp_text
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'merge_contacts'
     AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, boolean'
   LIMIT 1;

  IF v_sp_text IS NULL THEN
    v_report := v_report || E'\n  [FAIL] M49/FIX-3: merge_contacts(uuid,uuid,boolean) NOT FOUND';
    v_ok := FALSE;
  ELSE
    -- Check no 'evo' and no 'public' in search_path (from proconfig)
    v_sp_ok := (position('evo' IN lower(v_sp_text)) = 0)
           AND (position('''public''' IN lower(v_sp_text)) = 0);

    IF v_sp_ok THEN
      v_report := v_report || E'\n  [OK]   M49/FIX-3: merge_contacts(uuid,uuid,boolean) search_path free of evo/public ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M49/FIX-3: merge_contacts(uuid,uuid,boolean) search_path still contains evo or public: ' || v_sp_text;
      v_ok := FALSE;
    END IF;

    IF position('pg_catalog' IN lower(v_sp_text)) > 0
       AND position('zapp' IN lower(v_sp_text)) > 0
    THEN
      v_report := v_report || E'\n  [OK]   M49/FIX-3: search_path contains pg_catalog, zapp ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M49/FIX-3: search_path missing pg_catalog or zapp: ' || v_sp_text;
      v_ok := FALSE;
    END IF;
  END IF;

  -- FIX-3: merge_contacts(uuid,uuid,jsonb) wrapper
  SELECT pg_catalog.array_to_string(p.proconfig, ',')
    INTO v_sp_text
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'merge_contacts'
     AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, jsonb'
   LIMIT 1;

  IF v_sp_text IS NULL THEN
    v_report := v_report || E'\n  [FAIL] M49/FIX-3: merge_contacts(uuid,uuid,jsonb) NOT FOUND';
    v_ok := FALSE;
  ELSE
    v_sp_ok := (position('evo' IN lower(v_sp_text)) = 0)
           AND (position('''public''' IN lower(v_sp_text)) = 0);

    IF v_sp_ok THEN
      v_report := v_report || E'\n  [OK]   M49/FIX-3: merge_contacts(uuid,uuid,jsonb) search_path free of evo/public ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M49/FIX-3: merge_contacts(uuid,uuid,jsonb) search_path still contains evo or public: ' || v_sp_text;
      v_ok := FALSE;
    END IF;
  END IF;

  -- FIX-5: backup table exists and is populated
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'zapp' AND c.relname = '_backup_contact_notes_type_20260803'
  ) THEN
    v_report := v_report || E'\n  [OK]   M49/FIX-5: _backup_contact_notes_type_20260803 exists ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] M49/FIX-5: _backup_contact_notes_type_20260803 NOT FOUND';
    v_ok := FALSE;
  END IF;

  -- FIX-6a: UNIQUE constraint on evolution_reconcile_jobs (if table exists)
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'evo' AND c.relname = 'evolution_reconcile_jobs'
  ) THEN
    IF EXISTS (
      SELECT 1
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'evo'
         AND c.relname = 'evolution_reconcile_jobs'
         AND con.conname = 'uq_reconcile_jobs_request_id'
         AND con.contype = 'u'
    ) THEN
      v_report := v_report || E'\n  [OK]   M49/FIX-6a: uq_reconcile_jobs_request_id UNIQUE exists ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M49/FIX-6a: uq_reconcile_jobs_request_id UNIQUE NOT FOUND';
      v_ok := FALSE;
    END IF;
  ELSE
    v_report := v_report || E'\n  [SKIP] M49/FIX-6a: evo.evolution_reconcile_jobs not found (table-guarded step)';
  END IF;

  -- FIX-6b: UNIQUE constraint on evolution_instance_credentials (if table exists)
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'evo' AND c.relname = 'evolution_instance_credentials'
  ) THEN
    IF EXISTS (
      SELECT 1
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'evo'
         AND c.relname = 'evolution_instance_credentials'
         AND con.conname = 'uq_evo_instance_creds_instance_name'
         AND con.contype = 'u'
    ) THEN
      v_report := v_report || E'\n  [OK]   M49/FIX-6b: uq_evo_instance_creds_instance_name UNIQUE exists ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M49/FIX-6b: uq_evo_instance_creds_instance_name UNIQUE NOT FOUND';
      v_ok := FALSE;
    END IF;
  ELSE
    v_report := v_report || E'\n  [SKIP] M49/FIX-6b: evo.evolution_instance_credentials not found (table-guarded step)';
  END IF;

  RAISE NOTICE E'M49 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M49 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
