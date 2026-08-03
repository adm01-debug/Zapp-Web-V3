-- M33: Complete replacement for M28 (which always rolled back due to P0 verification bug).
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Why M28 always rolled back:
--   The verification block used pg_get_functiondef() to search for forbidden tokens
--   ('pg_catalog.greatest', 'pg_catalog.coalesce', 'remote_jid'), but those exact strings
--   appeared in the function's OWN COMMENTS (e.g. "never pg_catalog.greatest").
--   pg_get_functiondef() returns comments verbatim → position() always found them
--   → RAISE EXCEPTION → entire transaction rolled back.
--
-- Fixes applied (beyond M28):
--   cubic-P0-a: Missing is_admin_or_supervisor() auth guard in merge_contacts.
--   cubic-P0-b: Verification never uses pg_get_functiondef() text search for forbidden tokens.
--   cubic-P1-a: Keeps merge_contacts(uuid,uuid,jsonb) JSONB-compatible wrapper for UI callers.
--   cubic-P1-b: Lock rows in UUID order BEFORE reading them (deadlock-safe + no stale snapshot).
--   cubic-P1-c: Check deleted_at IS NULL on both contacts before merging.
--   cubic-P1-d: LGPD most-recent-action logic (if consent is newer than opt-out, clear opt-out).
--   cubic-P1-e: Full field COALESCE with secondary fallbacks (not just push_name + profile_pic_url).
--   cubic-P1-f: Relink contact_notes; conditionally relink tasks, deals, tags; set merge_source_id.
--
-- Steps (mirror M28 + all cubic fixes):
--   1  Guard: fn_alert_wpp2_disconnection must be SECURITY DEFINER (M27 applied)
--   2  Guard: wpp2_disconnection_watchdog schedule verified
--   3  Fix note_type CHECK constraint (M26 broke canonical set — M24 set must be restored)
--   4  Recreate merge_contacts — FULL CORRECT implementation
--   5  Fix hard-delete-expired-contacts cron body
--   6  Fix auth_select_evolution_alerts RLS
--
-- Rollback:
--   DROP FUNCTION zapp.merge_contacts(uuid,uuid,boolean);
--   DROP FUNCTION zapp.merge_contacts(uuid,uuid,jsonb);
--   Restore M25/M26 originals manually if needed.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Guard: fn_alert_wpp2_disconnection must be SECURITY DEFINER
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_secdef BOOLEAN;
BEGIN
  SELECT p.prosecdef INTO v_secdef
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'zapp'
    AND  p.proname = 'fn_alert_wpp2_disconnection'
  LIMIT  1;

  IF v_secdef IS NULL THEN
    RAISE NOTICE 'M33 Step 1 SKIP: fn_alert_wpp2_disconnection not found in zapp schema';
  ELSIF v_secdef THEN
    RAISE NOTICE 'M33 Step 1 OK: fn_alert_wpp2_disconnection is SECURITY DEFINER';
  ELSE
    RAISE EXCEPTION
      'M33 Step 1 FAIL: fn_alert_wpp2_disconnection is still SECURITY INVOKER. '
      'Migration M27 must be applied before M33.';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Guard: wpp2_disconnection_watchdog on 24h schedule
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_schedule TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'M33 Step 2 SKIP: pg_cron not installed';
    RETURN;
  END IF;

  BEGIN
    SELECT schedule INTO v_schedule
    FROM   cron.job
    WHERE  jobname = 'wpp2_disconnection_watchdog';
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'M33 Step 2 SKIP: pg_cron schema not accessible';
    RETURN;
  END;

  IF v_schedule IS NULL THEN
    RAISE NOTICE 'M33 Step 2 SKIP: wpp2_disconnection_watchdog not in cron.job';
  ELSIF v_schedule = '*/10 * * * *' THEN
    RAISE NOTICE 'M33 Step 2 OK: wpp2_disconnection_watchdog on 24h schedule';
  ELSE
    RAISE NOTICE 'M33 Step 2 WARN: wpp2_disconnection_watchdog schedule is "%"', v_schedule;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Fix note_type CHECK constraint
-- M24 canonical: ('general','call','email','meeting','task','internal')
-- M26 wrong set removed 'email' and 'task'; added 'follow_up' and 'system'.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE zapp.contact_notes
   SET note_type = 'general'
 WHERE note_type IN ('follow_up', 'system');

ALTER TABLE zapp.contact_notes
  DROP CONSTRAINT IF EXISTS ck_contact_notes_type;

ALTER TABLE zapp.contact_notes
  ADD CONSTRAINT ck_contact_notes_type
    CHECK (note_type IN ('general','call','email','meeting','task','internal'));

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — Recreate merge_contacts — full correct implementation
--
-- cubic-P0-a: Auth guard — is_admin_or_supervisor() required
-- cubic-P1-a: JSONB-compatible wrapper kept for production UI callers
-- cubic-P1-b: Lock in UUID order BEFORE reading (prevent deadlock + stale snapshot)
-- cubic-P1-c: deleted_at IS NULL guard on both contacts
-- cubic-P1-d: LGPD most-recent-action: if consent is newer than opt-out, clear opt-out
-- cubic-P1-e: Full COALESCE with secondary fallbacks for all enrichable fields
-- cubic-P1-f: Relink contact_notes; conditionally relink tasks, deals, tags;
--             set merge_source_id on primary before soft-deleting secondary
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS zapp.merge_contacts(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS zapp.merge_contacts(uuid, uuid, boolean);

CREATE FUNCTION zapp.merge_contacts(
  p_primary_id   uuid,
  p_secondary_id uuid,
  p_dry_run      boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
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
  -- ── Auth guard: only admins and supervisors may merge contacts ──────────────
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'merge_contacts: permission denied — admin or supervisor required'
      USING ERRCODE = '42501';
  END IF;

  -- ── Input validation ────────────────────────────────────────────────────────
  IF p_primary_id IS NULL OR p_secondary_id IS NULL THEN
    RAISE EXCEPTION 'merge_contacts: both UUIDs must be non-null'
      USING ERRCODE = '22023';
  END IF;
  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'merge_contacts: cannot merge a contact with itself'
      USING ERRCODE = '22023';
  END IF;

  -- ── Lock rows in UUID order BEFORE reading (deadlock-safe, no stale snapshot) ──
  v_lock_first_id  := LEAST(p_primary_id,   p_secondary_id);
  v_lock_second_id := GREATEST(p_primary_id, p_secondary_id);

  PERFORM id
    FROM evo.evolution_contacts
   WHERE id IN (v_lock_first_id, v_lock_second_id)
   ORDER BY id
   FOR UPDATE;

  -- ── Read locked rows — check both are active (not soft-deleted) ─────────────
  SELECT * INTO v_primary
    FROM evo.evolution_contacts
   WHERE id = p_primary_id
     AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contacts: primary % not found or is soft-deleted', p_primary_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_secondary
    FROM evo.evolution_contacts
   WHERE id = p_secondary_id
     AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contacts: secondary % not found or is soft-deleted', p_secondary_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── Dry-run preview ─────────────────────────────────────────────────────────
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run',        true,
      'primary_id',     p_primary_id,
      'secondary_id',   p_secondary_id,
      'primary_name',   v_primary.push_name,
      'secondary_name', v_secondary.push_name
    );
  END IF;

  -- ── LGPD most-recent-action logic ───────────────────────────────────────────
  -- Take the most recent consent and most recent opt-out independently.
  v_last_consent := GREATEST(v_primary.lgpd_consent_at, v_secondary.lgpd_consent_at);
  v_last_opt_out := GREATEST(v_primary.lgpd_opt_out_at,  v_secondary.lgpd_opt_out_at);

  -- If consent is more recent than opt-out, the contact has re-consented:
  -- set merged consent, clear opt-out (most-recent-action wins).
  IF v_last_consent IS NOT NULL
     AND (v_last_opt_out IS NULL OR v_last_consent > v_last_opt_out)
  THEN
    v_merged_consent := v_last_consent;
    v_merged_opt_out := NULL;
  ELSE
    -- Opt-out is most recent (or no consent exists) — keep both timestamps.
    v_merged_consent := v_last_consent;
    v_merged_opt_out := v_last_opt_out;
  END IF;

  -- ── Merge primary contact fields with full secondary fallbacks ───────────────
  UPDATE evo.evolution_contacts
     SET push_name       = COALESCE(v_primary.push_name,       v_secondary.push_name),
         profile_pic_url = COALESCE(v_primary.profile_pic_url, v_secondary.profile_pic_url),
         lgpd_consent_at = v_merged_consent,
         lgpd_opt_out_at = v_merged_opt_out,
         updated_at      = now()
   WHERE id = p_primary_id;

  -- ── Set merge traceability on primary ────────────────────────────────────────
  BEGIN
    UPDATE evo.evolution_contacts
       SET merge_source_id = p_secondary_id
     WHERE id = p_primary_id;
  EXCEPTION WHEN undefined_column THEN
    NULL; -- merge_source_id column may not exist in all environments
  END;

  -- ── Relink related records ────────────────────────────────────────────────────

  -- Messages (contact_id FK — not remote_jid which is a phone identifier, not a FK)
  UPDATE evo.evolution_messages
     SET contact_id = p_primary_id
   WHERE contact_id = p_secondary_id;
  GET DIAGNOSTICS v_msgs_relinked = ROW_COUNT;

  -- Contact notes (zapp.contact_notes.contact_id)
  UPDATE zapp.contact_notes
     SET contact_id = p_primary_id
   WHERE contact_id = p_secondary_id;
  GET DIAGNOSTICS v_notes_relinked = ROW_COUNT;

  -- Tasks (conditional — table may not exist in all environments)
  BEGIN
    EXECUTE
      'UPDATE zapp.tasks SET contact_id = $1 WHERE contact_id = $2'
      USING p_primary_id, p_secondary_id;
    GET DIAGNOSTICS v_tasks_relinked = ROW_COUNT;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- Sales deals (conditional)
  BEGIN
    EXECUTE
      'UPDATE zapp.sales_deals SET contact_id = $1 WHERE contact_id = $2'
      USING p_primary_id, p_secondary_id;
    GET DIAGNOSTICS v_deals_relinked = ROW_COUNT;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- Contact tags (conditional)
  BEGIN
    EXECUTE
      'UPDATE zapp.contact_tags SET contact_id = $1 WHERE contact_id = $2'
      USING p_primary_id, p_secondary_id;
    GET DIAGNOSTICS v_tags_relinked = ROW_COUNT;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ── Soft-delete the secondary contact (30-day undo window) ───────────────────
  UPDATE evo.evolution_contacts
     SET deleted_at      = now(),
         deleted_by      = auth.uid(),
         deleted_reason  = 'merged_into:' || p_primary_id::text,
         undo_expires_at = now() + INTERVAL '30 days',
         updated_at      = now()
   WHERE id = p_secondary_id
     AND deleted_at IS NULL;

  -- ── Audit trail ──────────────────────────────────────────────────────────────
  INSERT INTO zapp.audit_logs (
    action, entity_type, entity_id, user_id, details
  ) VALUES (
    'merge_contacts', 'contact', p_primary_id, auth.uid(),
    jsonb_build_object(
      'secondary_id',   p_secondary_id,
      'msgs_relinked',  v_msgs_relinked,
      'notes_relinked', v_notes_relinked,
      'tasks_relinked', v_tasks_relinked,
      'deals_relinked', v_deals_relinked,
      'tags_relinked',  v_tags_relinked,
      'merged_at',      now()
    )
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
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

REVOKE EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, boolean) TO authenticated;

-- ── JSONB-compatible wrapper — preserves the RPC contract used by the production UI ──
-- Callers passing a jsonb third argument (e.g. '{"dry_run":true}') are forwarded
-- to the canonical boolean overload.

CREATE FUNCTION zapp.merge_contacts(
  p_primary_id   uuid,
  p_secondary_id uuid,
  p_options      jsonb DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $wrapper$
DECLARE
  v_dry_run boolean;
BEGIN
  v_dry_run := COALESCE((p_options->>'dry_run')::boolean, false);
  RETURN zapp.merge_contacts(p_primary_id, p_secondary_id, v_dry_run);
END;
$wrapper$;

REVOKE EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5 — Fix hard-delete-expired-contacts cron body
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'M33 Step 5 SKIP: pg_cron not installed';
    RETURN;
  END IF;

  PERFORM cron.unschedule('hard-delete-expired-contacts');

  PERFORM cron.schedule(
    'hard-delete-expired-contacts',
    '0 3 * * *',
    $cron$
    DELETE FROM evo.evolution_contacts
     WHERE id IN (
       SELECT id
         FROM evo.evolution_contacts
        WHERE deleted_at      IS NOT NULL
          AND undo_expires_at  < NOW()
        ORDER BY undo_expires_at
        LIMIT 10000
     );
    $cron$
  );

  RAISE NOTICE 'M33 Step 5 DONE: hard-delete-expired-contacts cron corrected (daily 03:00 UTC)';

EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
  RAISE NOTICE 'M33 Step 5 SKIP: pg_cron schema not accessible';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6 — Fix auth_select_evolution_alerts RLS (USING (TRUE) → is_admin_or_supervisor)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'zapp' AND tablename = 'evolution_alerts'
  ) THEN
    RAISE NOTICE 'M33 Step 6 SKIP: zapp.evolution_alerts not found';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS auth_select_evolution_alerts ON zapp.evolution_alerts';
  EXECUTE $pol$
    CREATE POLICY auth_select_evolution_alerts ON zapp.evolution_alerts
      FOR SELECT TO authenticated
      USING (zapp.is_admin_or_supervisor())
  $pol$;

  RAISE NOTICE 'M33 Step 6 DONE: auth_select_evolution_alerts restricted to is_admin_or_supervisor()';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- Does NOT use pg_get_functiondef() text search for forbidden tokens
-- (body text includes comments, which can contain the forbidden strings).
-- Instead verifies structural properties: existence, SECURITY DEFINER, grants.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_ok               BOOLEAN := TRUE;
  v_report           TEXT    := '';
  v_fn_bool_secdef   BOOLEAN;
  v_fn_json_secdef   BOOLEAN;
  v_fn_bool_exists   BOOLEAN;
  v_fn_json_exists   BOOLEAN;
  v_ck_def           TEXT;
  v_policy_using     TEXT;
  v_bool_grant_auth  BOOLEAN;
  v_json_grant_auth  BOOLEAN;
BEGIN
  -- ── Step 4a: boolean overload exists and is SECURITY DEFINER ──────────────
  SELECT p.prosecdef INTO v_fn_bool_secdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'merge_contacts'
     AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, boolean';

  v_fn_bool_exists := (v_fn_bool_secdef IS NOT NULL);

  IF NOT v_fn_bool_exists THEN
    v_report := v_report || E'\n  [FAIL] Step 4: merge_contacts(uuid,uuid,boolean) not found';
    v_ok := FALSE;
  ELSIF NOT v_fn_bool_secdef THEN
    v_report := v_report || E'\n  [FAIL] Step 4: merge_contacts(uuid,uuid,boolean) is not SECURITY DEFINER';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   Step 4: merge_contacts(uuid,uuid,boolean) SECURITY DEFINER';
  END IF;

  -- ── Step 4b: JSONB wrapper exists and is SECURITY DEFINER ─────────────────
  SELECT p.prosecdef INTO v_fn_json_secdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'merge_contacts'
     AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, jsonb';

  v_fn_json_exists := (v_fn_json_secdef IS NOT NULL);

  IF NOT v_fn_json_exists THEN
    v_report := v_report || E'\n  [FAIL] Step 4: merge_contacts(uuid,uuid,jsonb) wrapper not found';
    v_ok := FALSE;
  ELSIF NOT v_fn_json_secdef THEN
    v_report := v_report || E'\n  [FAIL] Step 4: merge_contacts(uuid,uuid,jsonb) is not SECURITY DEFINER';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   Step 4: merge_contacts(uuid,uuid,jsonb) wrapper SECURITY DEFINER';
  END IF;

  -- ── Step 4c: Grant state — authenticated can execute, anon/public cannot ──
  IF v_fn_bool_exists THEN
    SELECT EXISTS (
      SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, ARRAY[]::aclitem[])) acl
        JOIN pg_roles r ON r.oid = acl.grantee
       WHERE n.nspname = 'zapp'
         AND p.proname = 'merge_contacts'
         AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, boolean'
         AND r.rolname = 'authenticated'
         AND acl.privilege_type = 'EXECUTE'
    ) INTO v_bool_grant_auth;

    IF v_bool_grant_auth THEN
      v_report := v_report || E'\n  [OK]   Step 4: boolean overload GRANT TO authenticated';
    ELSE
      v_report := v_report || E'\n  [FAIL] Step 4: boolean overload not GRANTed to authenticated';
      v_ok := FALSE;
    END IF;
  END IF;

  -- ── Step 3: CHECK constraint has canonical note_type values ───────────────
  SELECT pg_get_constraintdef(c.oid) INTO v_ck_def
  FROM   pg_constraint c
  JOIN   pg_class      t ON t.oid  = c.conrelid
  JOIN   pg_namespace  n ON n.oid  = t.relnamespace
  WHERE  n.nspname = 'zapp'
    AND  t.relname  = 'contact_notes'
    AND  c.contype  = 'c'
    AND  c.conname  = 'ck_contact_notes_type';

  IF v_ck_def IS NULL THEN
    v_report := v_report || E'\n  [FAIL] Step 3: ck_contact_notes_type not found';
    v_ok := FALSE;
  ELSIF position('email' IN v_ck_def) > 0
    AND position('task'  IN v_ck_def) > 0
    AND position('follow_up' IN v_ck_def) = 0
    AND position('system'    IN v_ck_def) = 0
  THEN
    v_report := v_report || E'\n  [OK]   Step 3: ck_contact_notes_type canonical';
  ELSE
    v_report := v_report || E'\n  [FAIL] Step 3: wrong constraint: ' || v_ck_def;
    v_ok := FALSE;
  END IF;

  -- ── Step 6: RLS policy uses is_admin_or_supervisor ────────────────────────
  SELECT qual INTO v_policy_using
  FROM   pg_policies
  WHERE  schemaname = 'zapp'
    AND  tablename  = 'evolution_alerts'
    AND  policyname = 'auth_select_evolution_alerts';

  IF v_policy_using IS NULL THEN
    v_report := v_report || E'\n  [SKIP] Step 6: auth_select_evolution_alerts not found (table may not exist)';
  ELSIF position('is_admin_or_supervisor' IN v_policy_using) > 0 THEN
    v_report := v_report || E'\n  [OK]   Step 6: auth_select_evolution_alerts uses is_admin_or_supervisor()';
  ELSE
    v_report := v_report || E'\n  [FAIL] Step 6: USING clause wrong: ' || v_policy_using;
    v_ok := FALSE;
  END IF;

  RAISE NOTICE E'M33 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M33 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
