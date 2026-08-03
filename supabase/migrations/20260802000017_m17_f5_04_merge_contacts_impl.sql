-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000017_m17_f5_04_merge_contacts_impl.sql
-- Purpose  : F5-04 CRÍTICO — Implement zapp.merge_contacts() replacing the
--            RAISE EXCEPTION stub that has blocked all contact deduplication.
--
-- Root cause: Function body was 5 lines ending in RAISE EXCEPTION
--   'merge_contacts: implementacao pendente (etapa 30)'. bulk_auto_merge_duplicates
--   calls this in a loop and propagated the exception, making the whole
--   deduplication pipeline unusable (0 rows with merge_source_id in prod).
--
-- Changes:
--   1. ADD COLUMN IF NOT EXISTS merge_source_id, lgpd_consent_at,
--      lgpd_opt_out_at to evo.evolution_contacts.
--   2. Full implementation of zapp.merge_contacts():
--      (a) LGPD consent migration (most recent wins)
--      (b) Array-union of tags + whatsapp_labels; concatenate notes
--      (c) Migrate contact_id FKs in:
--          evo.evolution_messages, evo.evolution_tasks, evo.evolution_deals,
--          zapp.contact_notes, zapp.contact_tags
--      (d) Soft-delete secondary (merge_source_id = p_primary_id)
--      (e) Audit log in zapp.audit_logs
--   3. Update bulk_auto_merge_duplicates stub to clarify it now delegates to
--      merge_contacts.
--
-- Idempotência: ADD COLUMN IF NOT EXISTS; CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Ensure LGPD and merge-tracking columns exist
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE evo.evolution_contacts
  ADD COLUMN IF NOT EXISTS lgpd_consent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS lgpd_opt_out_at  timestamptz,
  ADD COLUMN IF NOT EXISTS merge_source_id  uuid
    REFERENCES evo.evolution_contacts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS evolution_contacts_merge_source_idx
  ON evo.evolution_contacts (merge_source_id)
  WHERE merge_source_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Full implementation of merge_contacts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.merge_contacts(
  p_primary_id    uuid,
  p_secondary_id  uuid,
  p_merged_fields jsonb DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_primary   evo.evolution_contacts%ROWTYPE;
  v_secondary evo.evolution_contacts%ROWTYPE;
  v_merged_tags   text[];
  v_merged_labels text[];
  v_merged_notes  text;
  v_msgs_moved    integer := 0;
  v_tasks_moved   integer := 0;
  v_deals_moved   integer := 0;
  v_notes_moved   integer := 0;
  v_ctags_moved   integer := 0;
BEGIN
  -- ── Authorization ──────────────────────────────────────────────────────────
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'permission denied: admin or supervisor required'
      USING ERRCODE = '42501';
  END IF;

  -- ── Validate inputs ────────────────────────────────────────────────────────
  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'cannot merge a contact with itself'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock both rows in deterministic UUID order to prevent deadlocks.
  -- Two concurrent merges with swapped ids (A,B) and (B,A) would deadlock
  -- if each locks its first arg then waits for the other. Acquiring in
  -- LEAST/GREATEST order ensures both transactions try the same row first.
  PERFORM id FROM evo.evolution_contacts WHERE id = LEAST(p_primary_id, p_secondary_id)    FOR UPDATE;
  PERFORM id FROM evo.evolution_contacts WHERE id = GREATEST(p_primary_id, p_secondary_id) FOR UPDATE;

  -- Rows are now locked; read data (deleted_at guard applied here).
  SELECT * INTO v_primary
    FROM evo.evolution_contacts
   WHERE id = p_primary_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'primary contact % not found or already deleted', p_primary_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_secondary
    FROM evo.evolution_contacts
   WHERE id = p_secondary_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'secondary contact % not found or already deleted', p_secondary_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── (a) LGPD consent: most-recent wins ─────────────────────────────────────
  -- If secondary has a more recent consent timestamp, migrate it to primary.
  IF v_secondary.lgpd_consent_at IS NOT NULL
     AND (v_primary.lgpd_consent_at IS NULL
          OR v_secondary.lgpd_consent_at > v_primary.lgpd_consent_at) THEN
    v_primary.lgpd_consent_at := v_secondary.lgpd_consent_at;
    -- Also clear any opt-out if secondary had consent after primary's opt-out.
    IF v_primary.lgpd_opt_out_at IS NOT NULL
       AND v_secondary.lgpd_consent_at > v_primary.lgpd_opt_out_at THEN
      v_primary.lgpd_opt_out_at := v_secondary.lgpd_opt_out_at;
    END IF;
  END IF;

  -- ── (b) Merge arrays and notes ─────────────────────────────────────────────
  -- Array union for tags.
  v_merged_tags := ARRAY(
    SELECT DISTINCT unnest
      FROM unnest(
        COALESCE(v_primary.tags, '{}')
        || COALESCE(v_secondary.tags, '{}')
      ) AS unnest
  );

  -- Array union for whatsapp_labels.
  v_merged_labels := ARRAY(
    SELECT DISTINCT unnest
      FROM unnest(
        COALESCE(v_primary.whatsapp_labels, '{}')
        || COALESCE(v_secondary.whatsapp_labels, '{}')
      ) AS unnest
  );

  -- Concatenate notes with a separator when both exist.
  v_merged_notes := CASE
    WHEN v_primary.notes IS NOT NULL AND v_secondary.notes IS NOT NULL
      THEN v_primary.notes || E'\n--- [merged from ' || p_secondary_id::text || '] ---\n' || v_secondary.notes
    ELSE COALESCE(v_primary.notes, v_secondary.notes)
  END;

  -- ── (c) Update primary with merged fields and any p_merged_fields overrides ─
  UPDATE evo.evolution_contacts
     SET tags              = v_merged_tags,
         whatsapp_labels   = v_merged_labels,
         notes             = v_merged_notes,
         lgpd_consent_at   = v_primary.lgpd_consent_at,
         lgpd_opt_out_at   = v_primary.lgpd_opt_out_at,
         -- Allow caller to override specific fields from secondary.
         full_name         = COALESCE((p_merged_fields->>'full_name')::text,        v_primary.full_name),
         phone_number      = COALESCE((p_merged_fields->>'phone_number')::text,     v_primary.phone_number),
         email             = COALESCE((p_merged_fields->>'email')::text,            v_primary.email),
         company           = COALESCE((p_merged_fields->>'company')::text,          v_primary.company),
         lead_status       = COALESCE((p_merged_fields->>'lead_status')::text,      v_primary.lead_status),
         updated_at        = now()
   WHERE id = p_primary_id;

  -- ── (d) Migrate foreign key references ─────────────────────────────────────

  -- Messages (partitioned table; UPDATE hits all partitions via root).
  UPDATE evo.evolution_messages
     SET contact_id = p_primary_id
   WHERE contact_id = p_secondary_id;
  GET DIAGNOSTICS v_msgs_moved = ROW_COUNT;

  -- Tasks (table may not exist in all deployments — guard defensively).
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'evo' AND c.relname = 'evolution_tasks'
  ) THEN
    EXECUTE 'UPDATE evo.evolution_tasks SET contact_id = $1 WHERE contact_id = $2'
      USING p_primary_id, p_secondary_id;
    GET DIAGNOSTICS v_tasks_moved = ROW_COUNT;
  END IF;

  -- Deals (table may not exist in all deployments).
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'evo' AND c.relname = 'evolution_deals'
  ) THEN
    EXECUTE 'UPDATE evo.evolution_deals SET contact_id = $1 WHERE contact_id = $2'
      USING p_primary_id, p_secondary_id;
    GET DIAGNOSTICS v_deals_moved = ROW_COUNT;
  END IF;

  -- zapp.contact_notes.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zapp' AND c.relname = 'contact_notes'
  ) THEN
    UPDATE zapp.contact_notes
       SET contact_id = p_primary_id
     WHERE contact_id = p_secondary_id;
    GET DIAGNOSTICS v_notes_moved = ROW_COUNT;
  END IF;

  -- zapp.contact_tags (unique on (contact_id, tag_id) — skip existing pairs).
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zapp' AND c.relname = 'contact_tags'
  ) THEN
    UPDATE zapp.contact_tags
       SET contact_id = p_primary_id
     WHERE contact_id = p_secondary_id
       AND NOT EXISTS (
         SELECT 1 FROM zapp.contact_tags ct2
          WHERE ct2.contact_id = p_primary_id
            AND ct2.tag_id = zapp.contact_tags.tag_id
       );
    GET DIAGNOSTICS v_ctags_moved = ROW_COUNT;

    -- Delete any remaining secondary contact_tags where primary already has them.
    DELETE FROM zapp.contact_tags
     WHERE contact_id = p_secondary_id;
  END IF;

  -- ── (e) Soft-delete secondary with merge_source_id traceability ────────────
  UPDATE evo.evolution_contacts
     SET deleted_at      = now(),
         deleted_by      = auth.uid(),
         deleted_reason  = 'merged into ' || p_primary_id::text,
         undo_expires_at = now() + INTERVAL '30 days',
         merge_source_id = p_primary_id,
         updated_at      = now()
   WHERE id = p_secondary_id;

  -- ── (f) Audit log ──────────────────────────────────────────────────────────
  INSERT INTO zapp.audit_logs (
    action, entity_type, entity_id, performed_by, details
  ) VALUES (
    'merge_contacts',
    'contact',
    p_primary_id,
    auth.uid(),
    jsonb_build_object(
      'secondary_id',   p_secondary_id,
      'merged_fields',  p_merged_fields,
      'msgs_migrated',  v_msgs_moved,
      'tasks_migrated', v_tasks_moved,
      'deals_migrated', v_deals_moved,
      'notes_migrated', v_notes_moved,
      'ctags_migrated', v_ctags_moved,
      'merged_at',      now()
    )
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success',          true,
    'primary_id',       p_primary_id,
    'secondary_id',     p_secondary_id,
    'msgs_migrated',    v_msgs_moved,
    'tasks_migrated',   v_tasks_moved,
    'deals_migrated',   v_deals_moved,
    'notes_migrated',   v_notes_moved,
    'ctags_migrated',   v_ctags_moved
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: Update bulk_auto_merge_duplicates to delegate to merge_contacts
--         (previously raised an exception; now loops over phone duplicates)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.bulk_auto_merge_duplicates(
  p_match_field  text    DEFAULT 'phone_number',
  p_limit        integer DEFAULT 50
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_pair   RECORD;
  v_merged integer := 0;
  v_errors integer := 0;
  v_result jsonb;
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'insufficient privilege: admin or supervisor required'
      USING ERRCODE = '42501';
  END IF;

  IF p_match_field NOT IN ('phone_number', 'email') THEN
    RAISE EXCEPTION 'invalid match_field: must be phone_number or email'
      USING ERRCODE = 'P0001';
  END IF;

  -- Find duplicate pairs: group by the match field, keep oldest as primary.
  FOR v_pair IN
    EXECUTE format(
      $q$
      SELECT min(id) AS primary_id, max(id) AS secondary_id
        FROM evo.evolution_contacts
       WHERE %I IS NOT NULL
         AND deleted_at IS NULL
         AND merge_source_id IS NULL
       GROUP BY %I
      HAVING count(*) > 1
       LIMIT %s
      $q$,
      p_match_field, p_match_field, p_limit
    )
  LOOP
    BEGIN
      v_result := zapp.merge_contacts(v_pair.primary_id, v_pair.secondary_id);
      v_merged := v_merged + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING '[bulk_auto_merge_duplicates] failed pair (%,%) : %',
        v_pair.primary_id, v_pair.secondary_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'merged', v_merged,
    'errors', v_errors,
    'match_field', p_match_field
  );
END;
$function$;

REVOKE ALL ON FUNCTION zapp.bulk_auto_merge_duplicates(text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.bulk_auto_merge_duplicates(text, integer) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_exists BOOLEAN;
  v_secdef    BOOLEAN;
  v_col_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'merge_contacts'
  ) INTO v_fn_exists;

  IF NOT v_fn_exists THEN
    RAISE EXCEPTION '[M-17 VER] merge_contacts not found in zapp schema';
  END IF;

  SELECT prosecdef INTO v_secdef
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'merge_contacts';

  IF NOT v_secdef THEN
    RAISE EXCEPTION '[M-17 VER] merge_contacts is not SECURITY DEFINER';
  END IF;

  SELECT COUNT(*) INTO v_col_count
    FROM information_schema.columns
   WHERE table_schema = 'evo'
     AND table_name   = 'evolution_contacts'
     AND column_name IN ('lgpd_consent_at', 'lgpd_opt_out_at', 'merge_source_id');

  IF v_col_count < 3 THEN
    RAISE EXCEPTION '[M-17 VER] Missing columns on evo.evolution_contacts (found %/3)', v_col_count;
  END IF;

  RAISE NOTICE '[M-17 VER] F5-04 merge_contacts IMPLEMENTED ✓ SECURITY DEFINER ✓ columns(%) ✓', v_col_count;
END $$;
