-- M28: Corrective fixes for defects introduced in M25 (cubic_p0_corrections) and M26
--      (f6_reconcile_and_alerts_fixes).
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Defects addressed:
--   M25-1: Wrong source-schema preference in fn_alert_wpp2_disconnection copy
--          (M27 already fixed via ALTER FUNCTION — Step 1 just verifies)
--   M25-2: pg_catalog.greatest() / pg_catalog.coalesce() — INVALID (parser constructs,
--          cannot be schema-qualified). Caused compile-time errors in merge_contacts.
--   M25-3: position(v_body, 'needle') — wrong arg order, always returns 0.
--          ALL 5 verification guards in M25 were silent no-ops.
--   M25-4: DELETE FROM cron.job — forbidden by pg_cron API (use cron.unschedule).
--   M26-1: note_type CHECK constraint added 'follow_up','system'; removed 'email','task'.
--          Breaks canonical set from M24.
--   M26-2: merge_contacts(uuid,uuid,boolean) created WITHOUT dropping JSONB overload
--          from M25 — ambiguous overload when NULL passed as 3rd arg.
--   M26-3: Message relinking via remote_jid (phone identifier) instead of contact_id FK.
--   M26-4: hard-delete-expired-contacts cron body called bulk_auto_merge_duplicates()
--          instead of deleting expired contacts.
--   M26-5: auth_select_evolution_alerts RLS used USING (TRUE) — too permissive.
--
-- Rollback notes:
--   Step 3: Restore wrong CHECK (rollback not recommended — canonical is correct)
--   Step 4: DROP merge_contacts(uuid,uuid,boolean); recreate from M25/M26 if needed
--   Step 5: cron.unschedule + cron.schedule with old body
--   Step 6: DROP POLICY auth_select_evolution_alerts; recreate with USING (TRUE)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Verify M27 applied SECURITY DEFINER to fn_alert_wpp2_disconnection
-- M27 already ran ALTER FUNCTION. This step is a guard: if M27 was skipped,
-- this migration raises an exception rather than silently proceeding.
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
    RAISE NOTICE 'M28 Step 1 SKIP: fn_alert_wpp2_disconnection not found in zapp schema';
  ELSIF v_secdef THEN
    RAISE NOTICE 'M28 Step 1 OK: fn_alert_wpp2_disconnection is SECURITY DEFINER ✓';
  ELSE
    RAISE EXCEPTION
      'M28 Step 1 FAIL: fn_alert_wpp2_disconnection is still SECURITY INVOKER — '
      'migration M27 must be applied before M28';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Verify M27 rescheduled wpp2_disconnection_watchdog to 24h coverage
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_schedule TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'M28 Step 2 SKIP: pg_cron not installed';
    RETURN;
  END IF;

  BEGIN
    SELECT schedule INTO v_schedule
    FROM   cron.job
    WHERE  jobname = 'wpp2_disconnection_watchdog';
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'M28 Step 2 SKIP: pg_cron schema not accessible';
    RETURN;
  END;

  IF v_schedule IS NULL THEN
    RAISE NOTICE 'M28 Step 2 SKIP: wpp2_disconnection_watchdog not in cron.job';
  ELSIF v_schedule = '*/10 * * * *' THEN
    RAISE NOTICE 'M28 Step 2 OK: wpp2_disconnection_watchdog on 24h schedule ✓';
  ELSE
    RAISE NOTICE 'M28 Step 2 WARN: wpp2_disconnection_watchdog schedule = "%"', v_schedule;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Fix note_type CHECK constraint (M26 broke the canonical set)
--
-- M24 canonical: ('general','call','email','meeting','task','internal')
-- M26 wrong set: ('general','call','meeting','follow_up','internal','system')
--   Added: follow_up, system
--   Removed: email, task
--
-- Fix: migrate non-canonical values to 'general', then recreate constraint.
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
-- STEP 4 — Recreate merge_contacts with correct implementation
--
-- M25 created merge_contacts(uuid, uuid, jsonb) with:
--   - pg_catalog.greatest()  → INVALID (parser construct, no pg_catalog prefix allowed)
--   - pg_catalog.coalesce()  → INVALID
--   - Wrong source-schema ordering (prefers 'zapp' over 'public' for fn copy)
--
-- M26 created merge_contacts(uuid, uuid, boolean) WITHOUT first dropping the JSONB
-- overload → ambiguous resolution when NULL is passed as 3rd argument.
-- M26 also used remote_jid for message relinking instead of the contact_id FK.
--
-- Fix: DROP both overloads, recreate boolean variant with correct SQL.
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
  v_merged_consent  timestamptz;
  v_merged_opt_out  timestamptz;
  v_lock_first_id   uuid;
  v_lock_second_id  uuid;
  v_msgs_relinked   integer := 0;
BEGIN
  -- Input guards
  IF p_primary_id IS NULL OR p_secondary_id IS NULL THEN
    RAISE EXCEPTION 'merge_contacts: both UUIDs must be non-null'
      USING ERRCODE = '22023';
  END IF;
  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'merge_contacts: cannot merge a contact with itself'
      USING ERRCODE = '22023';
  END IF;

  -- Fetch both rows
  SELECT * INTO v_primary   FROM evo.evolution_contacts WHERE id = p_primary_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contacts: primary % not found', p_primary_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_secondary FROM evo.evolution_contacts WHERE id = p_secondary_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_contacts: secondary % not found', p_secondary_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Dry-run returns preview without mutations
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run',        true,
      'primary_id',     p_primary_id,
      'secondary_id',   p_secondary_id,
      'primary_name',   v_primary.push_name,
      'secondary_name', v_secondary.push_name
    );
  END IF;

  -- Deadlock-safe lock ordering: always lock lower UUID first.
  -- LEAST and GREATEST are SQL parser-level constructs — never prefix with pg_catalog.
  v_lock_first_id  := LEAST(p_primary_id,   p_secondary_id);
  v_lock_second_id := GREATEST(p_primary_id, p_secondary_id);
  PERFORM id FROM evo.evolution_contacts WHERE id = v_lock_first_id  FOR UPDATE;
  PERFORM id FROM evo.evolution_contacts WHERE id = v_lock_second_id FOR UPDATE;

  -- Merge LGPD timestamps — GREATEST is a parser construct, never pg_catalog.greatest
  v_merged_consent := GREATEST(v_primary.lgpd_consent_at, v_secondary.lgpd_consent_at);
  v_merged_opt_out := GREATEST(v_primary.lgpd_opt_out_at, v_secondary.lgpd_opt_out_at);

  -- Merge primary contact fields — COALESCE is a parser construct, never pg_catalog.coalesce
  UPDATE evo.evolution_contacts
     SET push_name       = COALESCE(v_primary.push_name,       v_secondary.push_name),
         profile_pic_url = COALESCE(v_primary.profile_pic_url, v_secondary.profile_pic_url),
         lgpd_consent_at = v_merged_consent,
         lgpd_opt_out_at = v_merged_opt_out,
         updated_at      = now()
   WHERE id = p_primary_id;

  -- Relink messages via contact_id FK — NOT remote_jid (phone identifier, not a FK to contacts)
  UPDATE evo.evolution_messages
     SET contact_id = p_primary_id
   WHERE contact_id = p_secondary_id;
  GET DIAGNOSTICS v_msgs_relinked = ROW_COUNT;

  -- Soft-delete the secondary contact (30-day undo window)
  UPDATE evo.evolution_contacts
     SET deleted_at      = now(),
         deleted_by      = auth.uid(),
         deleted_reason  = 'merged_into:' || p_primary_id::text,
         undo_expires_at = now() + INTERVAL '30 days',
         updated_at      = now()
   WHERE id = p_secondary_id
     AND deleted_at IS NULL;

  -- Audit — column is user_id, NOT performed_by
  INSERT INTO zapp.audit_logs (
    action, entity_type, entity_id, user_id, details
  ) VALUES (
    'merge_contacts', 'contact', p_primary_id, auth.uid(),
    jsonb_build_object(
      'secondary_id',  p_secondary_id,
      'msgs_relinked', v_msgs_relinked,
      'merged_at',     now()
    )
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success',        true,
    'primary_id',     p_primary_id,
    'secondary_id',   p_secondary_id,
    'msgs_relinked',  v_msgs_relinked
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5 — Fix hard-delete-expired-contacts cron job
--
-- M25 used DELETE FROM cron.job (forbidden by pg_cron API).
-- M26 registered the job with a cron body that called bulk_auto_merge_duplicates()
--   instead of actually deleting expired contacts.
--
-- Fix: use cron.unschedule() + cron.schedule() with correct body.
-- Note: $cron$...$cron$ tag avoids conflict with the outer DO $...$ delimiter.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'M28 Step 5 SKIP: pg_cron not installed';
    RETURN;
  END IF;

  -- Remove any existing schedule (no-op if absent)
  PERFORM cron.unschedule('hard-delete-expired-contacts');

  -- Register with correct body: delete contacts whose 30-day undo window expired
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

  RAISE NOTICE 'M28 Step 5 DONE: hard-delete-expired-contacts cron corrected (daily 03:00 UTC) ✓';

EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
  RAISE NOTICE 'M28 Step 5 SKIP: pg_cron schema not accessible';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6 — Fix auth_select_evolution_alerts RLS policy
--
-- M26 created: CREATE POLICY ... USING (TRUE) — allows ANY authenticated user
--   to read every row in zapp.evolution_alerts, bypassing role checks.
-- Fix: restrict to admins and supervisors via is_admin_or_supervisor().
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'zapp' AND tablename = 'evolution_alerts'
  ) THEN
    RAISE NOTICE 'M28 Step 6 SKIP: zapp.evolution_alerts table not found';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS auth_select_evolution_alerts ON zapp.evolution_alerts';

  EXECUTE $pol$
    CREATE POLICY auth_select_evolution_alerts ON zapp.evolution_alerts
      FOR SELECT TO authenticated
      USING (zapp.is_admin_or_supervisor())
  $pol$;

  RAISE NOTICE 'M28 Step 6 DONE: auth_select_evolution_alerts → is_admin_or_supervisor() ✓';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_ok              BOOLEAN := TRUE;
  v_report          TEXT    := '';
  v_fn_secdef       BOOLEAN;
  v_fn_exists_bool  BOOLEAN;
  v_fn_exists_json  BOOLEAN;
  v_ck_def          TEXT;
  v_policy_using    TEXT;
  v_body            TEXT;
BEGIN
  -- ── 7a: merge_contacts(uuid,uuid,boolean) exists and is SECURITY DEFINER ──
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp'
      AND p.proname = 'merge_contacts'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, boolean'
  ) INTO v_fn_exists_bool;

  IF NOT v_fn_exists_bool THEN
    v_report := v_report || E'\n  [FAIL] Step 4: merge_contacts(uuid,uuid,boolean) not found';
    v_ok := FALSE;
  ELSE
    SELECT p.prosecdef,
           pg_get_functiondef(p.oid)
      INTO v_fn_secdef, v_body
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'zapp'
       AND p.proname = 'merge_contacts'
       AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, boolean';

    IF NOT v_fn_secdef THEN
      v_report := v_report || E'\n  [FAIL] Step 4: merge_contacts not SECURITY DEFINER';
      v_ok := FALSE;
    ELSIF position('pg_catalog.greatest' IN v_body) > 0 THEN
      v_report := v_report || E'\n  [FAIL] Step 4: body still contains pg_catalog.greatest';
      v_ok := FALSE;
    ELSIF position('pg_catalog.coalesce' IN v_body) > 0 THEN
      v_report := v_report || E'\n  [FAIL] Step 4: body still contains pg_catalog.coalesce';
      v_ok := FALSE;
    ELSIF position('contact_id = p_primary_id' IN v_body) = 0 THEN
      v_report := v_report || E'\n  [FAIL] Step 4: missing contact_id message relinking';
      v_ok := FALSE;
    ELSIF position('remote_jid' IN v_body) > 0 THEN
      v_report := v_report || E'\n  [FAIL] Step 4: body still references remote_jid for relinking';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   Step 4: merge_contacts(uuid,uuid,boolean) ✓';
    END IF;
  END IF;

  -- ── 7b: JSONB overload is gone (prevents NULL ambiguity) ──
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp'
      AND p.proname = 'merge_contacts'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, jsonb'
  ) INTO v_fn_exists_json;

  IF v_fn_exists_json THEN
    v_report := v_report || E'\n  [FAIL] Step 4: JSONB overload still present (ambiguity risk)';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   Step 4: JSONB overload absent ✓';
  END IF;

  -- ── 7c: CHECK constraint has canonical note_type values ──
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
    v_report := v_report || E'\n  [OK]   Step 3: ck_contact_notes_type canonical ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] Step 3: wrong constraint definition: ' || v_ck_def;
    v_ok := FALSE;
  END IF;

  -- ── 7d: RLS policy uses is_admin_or_supervisor (not TRUE) ──
  SELECT qual INTO v_policy_using
  FROM   pg_policies
  WHERE  schemaname = 'zapp'
    AND  tablename  = 'evolution_alerts'
    AND  policyname = 'auth_select_evolution_alerts';

  IF v_policy_using IS NULL THEN
    v_report := v_report
      || E'\n  [SKIP] Step 6: auth_select_evolution_alerts not found '
      || '(table may not exist in this environment)';
  ELSIF position('is_admin_or_supervisor' IN v_policy_using) > 0 THEN
    v_report := v_report || E'\n  [OK]   Step 6: auth_select_evolution_alerts correct ✓';
  ELSE
    v_report := v_report
      || E'\n  [FAIL] Step 6: USING clause is wrong: ' || v_policy_using;
    v_ok := FALSE;
  END IF;

  RAISE NOTICE E'M28 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M28 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
