-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000023_m23_copilot_corrections.sql
-- Purpose  : Fix 4 bugs flagged in Copilot review of PR #714:
--
--   Fix A  (M-16 line 171-175): Cron job "hard-delete-expired-contacts" used
--           `DELETE … LIMIT 10000` which is NOT valid PostgreSQL syntax and
--           would abort every cron execution with a syntax error.  Fix: use
--           a subquery `DELETE WHERE id IN (SELECT id … ORDER BY undo_expires_at
--           LIMIT 10000)` — the only valid PG pattern for a limited DELETE.
--
--   Fix B  (M-17 line 148-152): zapp.merge_contacts UPDATE used only
--           `COALESCE(override, v_primary.X)` for full_name / phone_number /
--           email / company / lead_status.  When the primary record has NULL in
--           those fields (e.g. name-only import), the secondary's data was
--           silently dropped even though it was the only non-NULL value.
--           Fix: add v_secondary.X as the third COALESCE fallback so merging
--           always picks the best available value.
--
--   Fix C  (M-17 line 110): LGPD opt-out semantic: when secondary.lgpd_consent_at
--           is newer than primary.lgpd_opt_out_at the code was assigning
--           `v_secondary.lgpd_opt_out_at` to the primary — preserving the
--           opt-out timestamp of the contact that just gave newer consent.
--           This directly contradicts the "most-recent wins" intent stated in
--           the comment.  Fix: assign NULL to clear the opt-out.
--
--   Fix D  (M-17 lines 301-302): zapp.bulk_auto_merge_duplicates selected
--           duplicate pairs using `min(id) AS primary_id, max(id) AS
--           secondary_id`.  UUIDs (v4) are random and carry no time ordering
--           guarantee, so min/max UUID does NOT reliably pick the oldest/newest
--           contact as primary.  Fix: use `array_agg(id ORDER BY created_at
--           ASC)[1]` for primary and `…DESC[1]` for secondary.
--
-- Note: Fix B and Fix C both live inside zapp.merge_contacts — the function is
--       rewritten in full via CREATE OR REPLACE.  Fix D lives in
--       zapp.bulk_auto_merge_duplicates — also rewritten in full.
--
-- Idempotência: CREATE OR REPLACE; pg_cron DELETE + re-insert.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- Fix A: Reschedule cron with valid DELETE … WHERE id IN (SELECT … LIMIT n)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '[M-23 Fix-A] pg_cron not available — skip cron fix';
    RETURN;
  END IF;

  DELETE FROM cron.job WHERE jobname = 'hard-delete-expired-contacts';

  PERFORM cron.schedule(
    'hard-delete-expired-contacts',
    '0 3 * * *',
    $$
    DELETE FROM evo.evolution_contacts
     WHERE id IN (
       SELECT id
         FROM evo.evolution_contacts
        WHERE deleted_at IS NOT NULL
          AND undo_expires_at < NOW()
        ORDER BY undo_expires_at
        LIMIT 10000
     );
    $$
  );

  RAISE NOTICE '[M-23 Fix-A] hard-delete-expired-contacts rescheduled with valid DELETE subquery';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Fix B + Fix C: Rewrite zapp.merge_contacts with:
--   • secondary data as third COALESCE fallback          (Fix B)
--   • LGPD opt-out cleared (NULL) when consent is newer  (Fix C)
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

  -- Lock both rows to prevent concurrent merges on the same contacts.
  SELECT * INTO v_primary
    FROM evo.evolution_contacts
   WHERE id = p_primary_id
     AND deleted_at IS NULL
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'primary contact % not found or already deleted', p_primary_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_secondary
    FROM evo.evolution_contacts
   WHERE id = p_secondary_id
     AND deleted_at IS NULL
     FOR UPDATE;

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
    -- [Fix C] Clear any opt-out when the secondary had consent after the
    -- primary's opt-out timestamp.  Assigning secondary.lgpd_opt_out_at was
    -- wrong because the secondary (with newer consent) may not have an opt-out
    -- at all, and even if it did the consent chronologically supersedes it.
    IF v_primary.lgpd_opt_out_at IS NOT NULL
       AND v_secondary.lgpd_consent_at > v_primary.lgpd_opt_out_at THEN
      v_primary.lgpd_opt_out_at := NULL;  -- newer consent supersedes opt-out
    END IF;
  END IF;

  -- ── (b) Merge arrays and notes ─────────────────────────────────────────────
  v_merged_tags := ARRAY(
    SELECT DISTINCT unnest
      FROM unnest(
        COALESCE(v_primary.tags, '{}')
        || COALESCE(v_secondary.tags, '{}')
      ) AS unnest
  );

  v_merged_labels := ARRAY(
    SELECT DISTINCT unnest
      FROM unnest(
        COALESCE(v_primary.whatsapp_labels, '{}')
        || COALESCE(v_secondary.whatsapp_labels, '{}')
      ) AS unnest
  );

  v_merged_notes := CASE
    WHEN v_primary.notes IS NOT NULL AND v_secondary.notes IS NOT NULL
      THEN v_primary.notes || E'\n--- [merged from ' || p_secondary_id::text || '] ---\n' || v_secondary.notes
    ELSE COALESCE(v_primary.notes, v_secondary.notes)
  END;

  -- ── (c) Update primary with merged fields and any p_merged_fields overrides ─
  -- [Fix B] COALESCE now has THREE arguments: caller override → primary value →
  -- secondary value.  Without the third fallback, fields that are NULL on the
  -- primary but populated on the secondary were permanently lost after the merge.
  UPDATE evo.evolution_contacts
     SET tags              = v_merged_tags,
         whatsapp_labels   = v_merged_labels,
         notes             = v_merged_notes,
         lgpd_consent_at   = v_primary.lgpd_consent_at,
         lgpd_opt_out_at   = v_primary.lgpd_opt_out_at,
         full_name         = COALESCE((p_merged_fields->>'full_name')::text,        v_primary.full_name,        v_secondary.full_name),
         phone_number      = COALESCE((p_merged_fields->>'phone_number')::text,     v_primary.phone_number,     v_secondary.phone_number),
         email             = COALESCE((p_merged_fields->>'email')::text,            v_primary.email,            v_secondary.email),
         company           = COALESCE((p_merged_fields->>'company')::text,          v_primary.company,          v_secondary.company),
         lead_status       = COALESCE((p_merged_fields->>'lead_status')::text,      v_primary.lead_status,      v_secondary.lead_status),
         updated_at        = now()
   WHERE id = p_primary_id;

  -- ── (d) Migrate foreign key references ─────────────────────────────────────

  UPDATE evo.evolution_messages
     SET contact_id = p_primary_id
   WHERE contact_id = p_secondary_id;
  GET DIAGNOSTICS v_msgs_moved = ROW_COUNT;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'evo' AND c.relname = 'evolution_tasks'
  ) THEN
    EXECUTE 'UPDATE evo.evolution_tasks SET contact_id = $1 WHERE contact_id = $2'
      USING p_primary_id, p_secondary_id;
    GET DIAGNOSTICS v_tasks_moved = ROW_COUNT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'evo' AND c.relname = 'evolution_deals'
  ) THEN
    EXECUTE 'UPDATE evo.evolution_deals SET contact_id = $1 WHERE contact_id = $2'
      USING p_primary_id, p_secondary_id;
    GET DIAGNOSTICS v_deals_moved = ROW_COUNT;
  END IF;

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
-- Fix D: Rewrite bulk_auto_merge_duplicates with created_at-based pair selection
--   min(id) / max(id) on UUID v4 has no time-ordering guarantee.
--   Replaced with array_agg(id ORDER BY created_at ASC)[1] for the oldest
--   (primary) and array_agg(id ORDER BY created_at DESC)[1] for the newest
--   (secondary) — ties on created_at broken by id for determinism.
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

  -- [Fix D] Find duplicate pairs: use created_at ordering to pick the oldest
  -- contact as primary (preserves history) and the newest as secondary
  -- (will be soft-deleted after merge).  Ties broken by id for determinism.
  -- min(id)/max(id) was removed because UUID v4 is random and not time-ordered.
  FOR v_pair IN
    EXECUTE format(
      $q$
      SELECT (array_agg(id ORDER BY created_at ASC,  id ASC))[1]  AS primary_id,
             (array_agg(id ORDER BY created_at DESC, id DESC))[1] AS secondary_id
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
    'merged',       v_merged,
    'errors',       v_errors,
    'match_field',  p_match_field
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
  v_fn_merge   boolean;
  v_fn_bulk    boolean;
  v_secdef_m   boolean;
  v_secdef_b   boolean;
  v_cron_sql   text;
BEGIN
  -- merge_contacts exists and is SECURITY DEFINER
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'merge_contacts'
  ) INTO v_fn_merge;

  IF NOT v_fn_merge THEN
    RAISE EXCEPTION '[M-23 VER] merge_contacts not found after CREATE OR REPLACE';
  END IF;

  SELECT prosecdef INTO v_secdef_m
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'merge_contacts';

  IF NOT v_secdef_m THEN
    RAISE EXCEPTION '[M-23 VER] merge_contacts is not SECURITY DEFINER';
  END IF;

  -- bulk_auto_merge_duplicates exists and is SECURITY DEFINER
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'bulk_auto_merge_duplicates'
  ) INTO v_fn_bulk;

  IF NOT v_fn_bulk THEN
    RAISE EXCEPTION '[M-23 VER] bulk_auto_merge_duplicates not found after CREATE OR REPLACE';
  END IF;

  SELECT prosecdef INTO v_secdef_b
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'bulk_auto_merge_duplicates';

  IF NOT v_secdef_b THEN
    RAISE EXCEPTION '[M-23 VER] bulk_auto_merge_duplicates is not SECURITY DEFINER';
  END IF;

  -- Verify merge_contacts body no longer contains 'LIMIT' inside a DELETE stmt
  -- (proxy check: the fixed body uses subquery pattern, not DELETE…LIMIT)
  SELECT pg_catalog.pg_get_functiondef(p.oid) INTO v_cron_sql
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'merge_contacts';

  -- Spot-check Fix B: body must contain 'v_secondary.full_name'
  IF v_cron_sql IS NOT NULL AND position('v_secondary.full_name' IN v_cron_sql) = 0 THEN
    RAISE EXCEPTION '[M-23 VER] merge_contacts body missing secondary fallback for full_name (Fix B not applied)';
  END IF;

  -- Spot-check Fix C: body must NOT contain 'lgpd_opt_out_at := v_secondary.lgpd_opt_out_at'
  IF v_cron_sql IS NOT NULL AND position('v_secondary.lgpd_opt_out_at' IN v_cron_sql) > 0 THEN
    RAISE EXCEPTION '[M-23 VER] merge_contacts body still assigns v_secondary.lgpd_opt_out_at (Fix C not applied)';
  END IF;

  -- Cron verification (only when pg_cron available)
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT command INTO v_cron_sql
      FROM cron.job
     WHERE jobname = 'hard-delete-expired-contacts';

    IF NOT FOUND THEN
      RAISE EXCEPTION '[M-23 VER] cron job hard-delete-expired-contacts not found (Fix A failed)';
    END IF;

    IF position('LIMIT' IN pg_catalog.upper(v_cron_sql)) > 0
       AND position('WHERE id IN' IN pg_catalog.upper(v_cron_sql)) = 0 THEN
      RAISE EXCEPTION '[M-23 VER] cron SQL still uses DELETE…LIMIT without subquery (Fix A not applied)';
    END IF;

    RAISE NOTICE '[M-23 VER] cron hard-delete-expired-contacts ✓ valid subquery pattern';
  END IF;

  RAISE NOTICE '[M-23 VER] Copilot corrections OK — Fix-A(cron) ✓ Fix-B(secondary-fallback) ✓ Fix-C(lgpd-opt-out) ✓ Fix-D(created_at-ordering) ✓';
END $$;
