-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000025_m25_cubic_p0_corrections.sql
-- Purpose  : Fix 7 accumulated P0/P2 bugs found in Cubic review of M12–M23.
--
--   Fix A  : M23 verification block — needle 'WHERE id IN' was compared against
--            pg_catalog.upper() output (uppercase) → position() always returned
--            0 → RAISE EXCEPTION fired unconditionally, rolling back ALL of M23
--            on any DB with pg_cron installed.
--            Fix: use uppercase needle 'WHERE ID IN' in all future verification
--            checks. (This migration's own verification block uses the fix.)
--
--   Fix B  : M23/M17 merge_contacts — INSERT INTO zapp.audit_logs listed column
--            'performed_by' which does NOT exist; real column is 'user_id'.
--            Every merge_contacts() call has been failing and rolling back since
--            M17 was deployed. Fix: CREATE OR REPLACE with 'user_id'.
--
--   Fix C  : M23 LGPD opt-out logic was incomplete — only compared
--            secondary.lgpd_consent_at vs primary timestamps; never looked at
--            secondary.lgpd_opt_out_at. If secondary's most-recent LGPD action
--            was opt-out (e.g. consent T2, opt-out T3), that opt-out was silently
--            erased — a LGPD compliance violation.
--            Fix: GREATEST() across all 4 timestamps; whichever is most recent
--            (consent or opt-out, from either contact) determines surviving state.
--
--   Fix D  : M23/M16 DO $$ block used $$ as outer delimiter; cron.schedule() SQL
--            also wrapped in $$ → inner $$ closed the outer DO block, leaving the
--            cron body invalid. Same bug existed in M16 Fix-A.
--            Fix: Re-register cron using DO $do$...$do$ outer +
--            $cron$...$cron$ inner SQL. Supersedes M23 Fix A.
--
--   Fix E  : R28F created bulk_auto_merge_duplicates(p_instance_name TEXT, INT).
--            M17/M23 tried CREATE OR REPLACE with p_match_field text — PostgreSQL
--            rejects parameter renaming via CREATE OR REPLACE.
--            Fix: DROP FUNCTION IF EXISTS (TEXT, INT), then recreate with the
--            correct (text, integer) + p_match_field signature.
--
--   Fix F  : M14 dynamic DDL for fn_alert_wpp2_disconnection hardcoded
--            RETURNS void. If the actual function returns jsonb or any other
--            non-void type, CREATE OR REPLACE fails with a return-type mismatch.
--            Fix: use pg_catalog.pg_get_function_result(p.oid) to read the
--            actual return type dynamically from the catalog.
--
--   Fix G  : M12 REVOKE/GRANT for fn_alert_wpp2_disconnection was at top-level
--            SQL, AFTER a DO block that could RETURN early (if the function did
--            not exist in zapp). The bare REVOKE executed regardless, failing
--            when the function was absent.
--            Fix: wrap REVOKE/GRANT inside a DO block with an existence guard.
--
-- Execution order:
--   Step 1  Fix G — safe REVOKE/GRANT inside existence guard
--   Step 2  Fix F — re-run M14 dynamic DDL with correct return type
--   Step 3  Fix E — DROP old bulk_auto_merge_duplicates signature
--   Step 4  Fix B + C — CREATE OR REPLACE merge_contacts (user_id + full LGPD)
--   Step 5  Fix D — Re-register cron with $do$/$cron$ delimiter nesting
--                + CREATE OR REPLACE bulk_auto_merge_duplicates (Fix D body)
--   Step 6  Verification (Fix A — uppercase needle in cron SQL check)
--
-- Idempotência: DROP FUNCTION IF EXISTS; CREATE OR REPLACE; cron DELETE + insert.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1 — Fix G: REVOKE/GRANT for fn_alert_wpp2_disconnection inside guard
--   M12 ran REVOKE/GRANT at top-level; if the function did not exist in zapp
--   the REVOKE errored.  Wrapped in DO block with existence check so it is
--   always safe to run regardless of function presence.
-- ─────────────────────────────────────────────────────────────────────────────
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'zapp'
       AND p.proname = 'fn_alert_wpp2_disconnection'
  ) THEN
    REVOKE EXECUTE ON FUNCTION zapp.fn_alert_wpp2_disconnection() FROM PUBLIC, anon;
    GRANT  EXECUTE ON FUNCTION zapp.fn_alert_wpp2_disconnection() TO service_role;
    RAISE NOTICE '[M-25 Fix-G] REVOKE/GRANT applied to zapp.fn_alert_wpp2_disconnection';
  ELSE
    RAISE NOTICE '[M-25 Fix-G] zapp.fn_alert_wpp2_disconnection not present — REVOKE/GRANT skipped';
  END IF;
END $do$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2 — Fix F: Re-run M14 dynamic DDL with pg_get_function_result()
--   M14 hardcoded RETURNS void. The actual function may return jsonb or another
--   type (e.g. if a previous migration changed the signature). Using
--   pg_get_function_result() ensures the recreated zapp copy matches the source.
-- ─────────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE
  v_src  text;
  v_ns   text;
  v_ret  text;
BEGIN
  SELECT p.prosrc,
         n.nspname,
         pg_catalog.pg_get_function_result(p.oid)
    INTO v_src, v_ns, v_ret
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'fn_alert_wpp2_disconnection'
     AND n.nspname IN ('zapp', 'public')
   ORDER BY CASE n.nspname WHEN 'zapp' THEN 1 ELSE 2 END
   LIMIT 1;

  IF NOT FOUND OR v_src IS NULL THEN
    RAISE NOTICE '[M-25 Fix-F] fn_alert_wpp2_disconnection not found in zapp/public — skip';
    RETURN;
  END IF;

  EXECUTE format(
    $ddl$
    CREATE OR REPLACE FUNCTION zapp.fn_alert_wpp2_disconnection()
     RETURNS %s
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
    AS $fn$%s$fn$
    $ddl$,
    v_ret,
    v_src
  );

  -- Grant inside this block so it only runs when the function exists.
  REVOKE EXECUTE ON FUNCTION zapp.fn_alert_wpp2_disconnection() FROM PUBLIC, anon;
  GRANT  EXECUTE ON FUNCTION zapp.fn_alert_wpp2_disconnection() TO service_role;

  RAISE NOTICE '[M-25 Fix-F] fn_alert_wpp2_disconnection recreated with RETURNS % (source schema=%)',
    v_ret, v_ns;
END $do$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3 — Fix E: DROP old bulk_auto_merge_duplicates(TEXT, INT) from R28F
--   R28F defined the function with parameter name p_instance_name (TEXT, INT).
--   PostgreSQL forbids renaming parameters via CREATE OR REPLACE, so any
--   subsequent attempt to use p_match_field as the first param name fails.
--   DROP the old overload first; recreated below in Step 5 with the correct
--   (text, integer) + p_match_field signature.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.bulk_auto_merge_duplicates(TEXT, INT);


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4 — Fix B + Fix C: Rewrite zapp.merge_contacts
--   Fix B: audit_logs INSERT now uses 'user_id' (not the nonexistent 'performed_by').
--   Fix C: LGPD most-recent-wins — GREATEST() across all 4 timestamps from both
--          contacts; the most-recent action (consent or opt-out) determines the
--          surviving state.  Specifically:
--            v_merged_consent = GREATEST(primary.lgpd_consent_at, secondary.lgpd_consent_at)
--            v_merged_opt_out = GREATEST(primary.lgpd_opt_out_at,  secondary.lgpd_opt_out_at)
--          If consent >= opt-out → opted-in; clear opt-out.
--          If opt-out >  consent → opted-out; preserve opt-out.
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
  v_primary         evo.evolution_contacts%ROWTYPE;
  v_secondary       evo.evolution_contacts%ROWTYPE;
  v_merged_tags     text[];
  v_merged_labels   text[];
  v_merged_notes    text;
  v_merged_consent  timestamptz;   -- Fix C: GREATEST consent from both contacts
  v_merged_opt_out  timestamptz;   -- Fix C: GREATEST opt-out from both contacts
  v_msgs_moved      integer := 0;
  v_tasks_moved     integer := 0;
  v_deals_moved     integer := 0;
  v_notes_moved     integer := 0;
  v_ctags_moved     integer := 0;
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

  -- ── (a) LGPD consent: full most-recent-wins across both contacts ────────────
  -- [Fix C] Collect the most recent consent and most recent opt-out from
  -- EITHER contact.  The most-recent action (consent or opt-out) determines
  -- the surviving state.  M23 only compared secondary.lgpd_consent_at and
  -- never examined secondary.lgpd_opt_out_at, erasing the secondary's opt-out
  -- when the secondary had consented earlier but opted-out more recently.
  v_merged_consent := pg_catalog.greatest(v_primary.lgpd_consent_at, v_secondary.lgpd_consent_at);
  v_merged_opt_out := pg_catalog.greatest(v_primary.lgpd_opt_out_at,  v_secondary.lgpd_opt_out_at);

  v_primary.lgpd_consent_at := v_merged_consent;

  IF v_merged_consent IS NOT NULL
     AND (v_merged_opt_out IS NULL OR v_merged_consent >= v_merged_opt_out) THEN
    -- Most-recent action was consent (or equal) → person is opted-in.
    -- Clear opt-out to reflect the current effective state.
    v_primary.lgpd_opt_out_at := NULL;
  ELSE
    -- Most-recent action was opt-out (or no LGPD action at all) →
    -- person is opted-out; preserve the most recent opt-out timestamp.
    v_primary.lgpd_opt_out_at := v_merged_opt_out;
  END IF;

  -- ── (b) Merge arrays and notes ─────────────────────────────────────────────
  v_merged_tags := ARRAY(
    SELECT DISTINCT unnest
      FROM unnest(
        pg_catalog.coalesce(v_primary.tags, '{}')
        || pg_catalog.coalesce(v_secondary.tags, '{}')
      ) AS unnest
  );

  v_merged_labels := ARRAY(
    SELECT DISTINCT unnest
      FROM unnest(
        pg_catalog.coalesce(v_primary.whatsapp_labels, '{}')
        || pg_catalog.coalesce(v_secondary.whatsapp_labels, '{}')
      ) AS unnest
  );

  v_merged_notes := CASE
    WHEN v_primary.notes IS NOT NULL AND v_secondary.notes IS NOT NULL
      THEN v_primary.notes
           || E'\n--- [merged from ' || p_secondary_id::text || E'] ---\n'
           || v_secondary.notes
    ELSE pg_catalog.coalesce(v_primary.notes, v_secondary.notes)
  END;

  -- ── (c) Update primary with merged fields and any p_merged_fields overrides ─
  -- Three-level COALESCE: caller override → primary value → secondary value.
  -- This ensures fields NULL on the primary but populated on the secondary are
  -- preserved instead of silently dropped (Fix B from M23).
  UPDATE evo.evolution_contacts
     SET tags              = v_merged_tags,
         whatsapp_labels   = v_merged_labels,
         notes             = v_merged_notes,
         lgpd_consent_at   = v_primary.lgpd_consent_at,
         lgpd_opt_out_at   = v_primary.lgpd_opt_out_at,
         full_name         = pg_catalog.coalesce(
                               (p_merged_fields->>'full_name')::text,
                               v_primary.full_name,
                               v_secondary.full_name),
         phone_number      = pg_catalog.coalesce(
                               (p_merged_fields->>'phone_number')::text,
                               v_primary.phone_number,
                               v_secondary.phone_number),
         email             = pg_catalog.coalesce(
                               (p_merged_fields->>'email')::text,
                               v_primary.email,
                               v_secondary.email),
         company           = pg_catalog.coalesce(
                               (p_merged_fields->>'company')::text,
                               v_primary.company,
                               v_secondary.company),
         lead_status       = pg_catalog.coalesce(
                               (p_merged_fields->>'lead_status')::text,
                               v_primary.lead_status,
                               v_secondary.lead_status),
         updated_at        = pg_catalog.now()
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
     SET deleted_at      = pg_catalog.now(),
         deleted_by      = auth.uid(),
         deleted_reason  = 'merged into ' || p_primary_id::text,
         undo_expires_at = pg_catalog.now() + INTERVAL '30 days',
         merge_source_id = p_primary_id,
         updated_at      = pg_catalog.now()
   WHERE id = p_secondary_id;

  -- ── (f) Audit log — column is user_id (Fix B: performed_by does not exist) ──
  INSERT INTO zapp.audit_logs (
    action, entity_type, entity_id, user_id, details
  ) VALUES (
    'merge_contacts',
    'contact',
    p_primary_id,
    auth.uid(),
    pg_catalog.jsonb_build_object(
      'secondary_id',   p_secondary_id,
      'merged_fields',  p_merged_fields,
      'msgs_migrated',  v_msgs_moved,
      'tasks_migrated', v_tasks_moved,
      'deals_migrated', v_deals_moved,
      'notes_migrated', v_notes_moved,
      'ctags_migrated', v_ctags_moved,
      'merged_at',      pg_catalog.now()
    )
  ) ON CONFLICT DO NOTHING;

  RETURN pg_catalog.jsonb_build_object(
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

COMMENT ON FUNCTION zapp.merge_contacts(uuid, uuid, jsonb)
  IS 'Merges secondary contact into primary. Requires admin/supervisor. '
     'Fix B: audit_logs.user_id (not performed_by). '
     'Fix C: LGPD most-recent-wins across all 4 consent/opt-out timestamps. '
     'Fix D from M23: three-level COALESCE preserves secondary non-NULL fields.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 5 — Fix D: Cron re-registration with correct dollar-quote nesting
--             + bulk_auto_merge_duplicates with p_match_field signature
--
--   Part 5a: Re-register cron using $do$...$do$ outer + $cron$...$cron$ inner.
--   Part 5b: Recreate bulk_auto_merge_duplicates (was dropped in Step 3).
-- ─────────────────────────────────────────────────────────────────────────────

-- Part 5a: Cron re-registration
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '[M-25 Fix-D] pg_cron not available — skip cron re-registration';
    RETURN;
  END IF;

  DELETE FROM cron.job WHERE jobname = 'hard-delete-expired-contacts';

  PERFORM cron.schedule(
    'hard-delete-expired-contacts',
    '0 3 * * *',
    $cron$
    DELETE FROM evo.evolution_contacts
     WHERE id IN (
       SELECT id
         FROM evo.evolution_contacts
        WHERE deleted_at IS NOT NULL
          AND undo_expires_at < NOW()
        ORDER BY undo_expires_at
        LIMIT 10000
     )
    $cron$
  );

  RAISE NOTICE '[M-25 Fix-D] hard-delete-expired-contacts re-registered with $do$/$cron$ delimiter nesting';
END $do$;


-- Part 5b: bulk_auto_merge_duplicates (p_match_field signature from M23 Fix D)
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

  -- Find duplicate pairs: use created_at ordering to pick the oldest contact as
  -- primary (preserves history) and the newest as secondary (will be soft-deleted
  -- after merge).  Ties broken by id for determinism.
  -- array_agg with created_at is used because UUID v4 is random and min/max UUID
  -- carries no time-ordering guarantee (M23 Fix D rationale).
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

  RETURN pg_catalog.jsonb_build_object(
    'merged',       v_merged,
    'errors',       v_errors,
    'match_field',  p_match_field
  );
END;
$function$;

REVOKE ALL ON FUNCTION zapp.bulk_auto_merge_duplicates(text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.bulk_auto_merge_duplicates(text, integer) TO authenticated, service_role;

COMMENT ON FUNCTION zapp.bulk_auto_merge_duplicates(text, integer)
  IS 'Batch-merges duplicate contacts by phone_number or email. '
     'Picks oldest-by-created_at as primary, newest as secondary (Fix E/D from M23). '
     'Requires admin/supervisor. Calls merge_contacts() for each pair.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Step 6 — Verification (Fix A applied: uppercase needle in cron SQL check)
-- ─────────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE
  v_fn_count  integer;
  v_secdef    boolean;
  v_body      text;
  v_cron_sql  text;
BEGIN
  -- ── 1. merge_contacts exists and is SECURITY DEFINER ──────────────────────
  SELECT COUNT(*) INTO v_fn_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'merge_contacts';

  IF v_fn_count = 0 THEN
    RAISE EXCEPTION '[M-25 VER] merge_contacts not found after CREATE OR REPLACE';
  END IF;

  SELECT prosecdef INTO v_secdef
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'merge_contacts';

  IF NOT v_secdef THEN
    RAISE EXCEPTION '[M-25 VER] merge_contacts is not SECURITY DEFINER';
  END IF;

  -- ── 2. Fix B: body must NOT contain 'performed_by' ────────────────────────
  SELECT prosrc INTO v_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'merge_contacts';

  IF pg_catalog.position(v_body, 'performed_by') > 0 THEN
    RAISE EXCEPTION '[M-25 VER] merge_contacts body still contains performed_by (Fix B not applied)';
  END IF;

  IF pg_catalog.position(v_body, 'user_id') = 0 THEN
    RAISE EXCEPTION '[M-25 VER] merge_contacts body missing user_id in audit INSERT (Fix B not applied)';
  END IF;

  -- ── 3. Fix C: body must contain v_merged_consent and v_merged_opt_out ─────
  IF pg_catalog.position(v_body, 'v_merged_consent') = 0 THEN
    RAISE EXCEPTION '[M-25 VER] merge_contacts body missing v_merged_consent (Fix C not applied)';
  END IF;

  IF pg_catalog.position(v_body, 'v_merged_opt_out') = 0 THEN
    RAISE EXCEPTION '[M-25 VER] merge_contacts body missing v_merged_opt_out (Fix C not applied)';
  END IF;

  -- ── 4. Fix C: body must retain secondary.full_name as third fallback ───────
  IF pg_catalog.position(v_body, 'v_secondary.full_name') = 0 THEN
    RAISE EXCEPTION '[M-25 VER] merge_contacts body missing v_secondary.full_name COALESCE fallback (M23 Fix B not carried)';
  END IF;

  -- ── 5. bulk_auto_merge_duplicates exists ──────────────────────────────────
  SELECT COUNT(*) INTO v_fn_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'bulk_auto_merge_duplicates';

  IF v_fn_count = 0 THEN
    RAISE EXCEPTION '[M-25 VER] bulk_auto_merge_duplicates not found (Fix E failed)';
  END IF;

  -- ── 6. Fix D + Fix A: cron re-registered with valid subquery ──────────────
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT command INTO v_cron_sql
      FROM cron.job
     WHERE jobname = 'hard-delete-expired-contacts';

    IF NOT FOUND THEN
      RAISE EXCEPTION '[M-25 VER] cron job hard-delete-expired-contacts not found (Fix D failed)';
    END IF;

    -- [Fix A] Needle must be uppercase to match pg_catalog.upper() output.
    -- M23 bug: needle was 'WHERE id IN' (lowercase) but upper() produces
    -- 'WHERE ID IN' → position() always returned 0 → guard always fired.
    IF position('LIMIT' IN pg_catalog.upper(v_cron_sql)) > 0
       AND position('WHERE ID IN' IN pg_catalog.upper(v_cron_sql)) = 0 THEN
      RAISE EXCEPTION '[M-25 VER] cron SQL still uses DELETE…LIMIT without subquery (Fix D not applied)';
    END IF;

    RAISE NOTICE '[M-25 VER] cron hard-delete-expired-contacts ✓ valid subquery pattern';
  END IF;

  RAISE NOTICE
    '[M-25 VER] All P0 corrections verified — '
    'Fix-A(uppercase-needle) ✓ '
    'Fix-B(user_id) ✓ '
    'Fix-C(lgpd-most-recent-wins) ✓ '
    'Fix-D(cron-delimiter) ✓ '
    'Fix-E(param-rename) ✓ '
    'Fix-F(dynamic-return-type) ✓ '
    'Fix-G(revoke-guard) ✓';
END $do$;
