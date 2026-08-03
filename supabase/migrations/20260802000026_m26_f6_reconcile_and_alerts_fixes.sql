-- =============================================================================
-- M26 — Reconcile & Alerts Fixes
-- Fixes rolled-back M24 (contact_notes), M25 (merge_contacts), M22 (normalize_phone)
-- Implements F6-05, F6-21, F6-06, F6-08, F6-11, F6-12
-- =============================================================================
-- CRITICAL SYNTAX RULES ENFORCED THROUGHOUT THIS FILE:
--   COALESCE(...) — NOT pg_catalog.coalesce()  (language construct, not a function)
--   GREATEST(...) — NOT pg_catalog.greatest()  (language construct, not a function)
--   LEAST(...)    — NOT pg_catalog.least()     (language construct, not a function)
--   position('x' IN str) — NOT pg_catalog.position(str,'x')  (parser-level construct)
--   Valid pg_catalog calls: regexp_replace, length, now(), lower(), jsonb_build_object, gen_random_uuid()
-- =============================================================================

SET search_path TO pg_catalog, zapp, evo, public;

-- =============================================================================
-- STEP 0a — Re-apply M24: contact_notes columns + add_contact_note + update_contact_note
-- =============================================================================
DO $step0a$
BEGIN
  -- Columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'contact_notes' AND column_name = 'note_type'
  ) THEN
    ALTER TABLE zapp.contact_notes ADD COLUMN note_type TEXT NOT NULL DEFAULT 'general';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'contact_notes' AND column_name = 'is_pinned'
  ) THEN
    ALTER TABLE zapp.contact_notes ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'contact_notes' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE zapp.contact_notes ADD COLUMN updated_by UUID REFERENCES zapp.profiles(id) ON DELETE SET NULL;
  END IF;

  -- FK constraint (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'zapp' AND table_name = 'contact_notes'
      AND constraint_name = 'fk_contact_notes_updated_by'
  ) THEN
    BEGIN
      ALTER TABLE zapp.contact_notes
        ADD CONSTRAINT fk_contact_notes_updated_by
        FOREIGN KEY (updated_by) REFERENCES zapp.profiles(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;

  -- CHECK constraint (drop first for idempotency, then add)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'zapp' AND table_name = 'contact_notes'
      AND constraint_name = 'ck_contact_notes_type'
  ) THEN
    ALTER TABLE zapp.contact_notes DROP CONSTRAINT ck_contact_notes_type;
  END IF;

  ALTER TABLE zapp.contact_notes
    ADD CONSTRAINT ck_contact_notes_type
    CHECK (note_type IN ('general', 'call', 'meeting', 'follow_up', 'internal', 'system'));

  -- Indexes
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname = 'zapp' AND tablename = 'contact_notes' AND indexname = 'idx_contact_notes_pinned'
  ) THEN
    CREATE INDEX idx_contact_notes_pinned
      ON zapp.contact_notes (contact_id, is_pinned DESC, created_at DESC);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname = 'zapp' AND tablename = 'contact_notes' AND indexname = 'idx_contact_notes_type'
  ) THEN
    CREATE INDEX idx_contact_notes_type
      ON zapp.contact_notes (contact_id, note_type, created_at DESC);
  END IF;

END;
$step0a$;

-- add_contact_note — uses COALESCE (unqualified), fixed
DROP FUNCTION IF EXISTS zapp.add_contact_note(UUID, TEXT, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION zapp.add_contact_note(
  p_contact_id  UUID,
  p_content     TEXT,
  p_note_type   TEXT    DEFAULT 'general',
  p_is_pinned   BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, zapp, evo, public
AS $fn$
DECLARE
  v_user_id   UUID;
  v_profile   RECORD;
  v_note_id   UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT id, workspace_id INTO v_profile
    FROM zapp.profiles
   WHERE user_id = v_user_id
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate contact visibility
  IF NOT EXISTS (
    SELECT 1 FROM zapp.contatos c
     WHERE c.id = p_contact_id
       AND (c.workspace_id = v_profile.workspace_id OR zapp.is_admin_or_supervisor())
  ) THEN
    RAISE EXCEPTION 'Contact not found or access denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO zapp.contact_notes (
    contact_id,
    content,
    author_id,
    note_type,
    is_pinned,
    created_at,
    updated_at
  ) VALUES (
    p_contact_id,
    p_content,
    v_profile.id,
    COALESCE(p_note_type, 'general'),
    COALESCE(p_is_pinned, FALSE),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_note_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'note_id', v_note_id
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION zapp.add_contact_note(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.add_contact_note(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- update_contact_note — IS DISTINCT FROM, visibility check, service_role bypass
DROP FUNCTION IF EXISTS zapp.update_contact_note(UUID, TEXT, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION zapp.update_contact_note(
  p_note_id   UUID,
  p_content   TEXT    DEFAULT NULL,
  p_note_type TEXT    DEFAULT NULL,
  p_is_pinned BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, zapp, evo, public
AS $fn$
DECLARE
  v_user_id    UUID;
  v_profile_id UUID;
  v_author_id  UUID;
  v_contact_id UUID;
  v_workspace  UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.workspace_id INTO v_profile_id, v_workspace
    FROM zapp.profiles p
   WHERE p.user_id = v_user_id
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT n.author_id, n.contact_id INTO v_author_id, v_contact_id
    FROM zapp.contact_notes n
   WHERE n.id = p_note_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note not found' USING ERRCODE = 'P0001';
  END IF;

  -- Contact visibility check
  IF NOT EXISTS (
    SELECT 1 FROM zapp.contatos c
     WHERE c.id = v_contact_id
       AND (c.workspace_id = v_workspace OR zapp.is_admin_or_supervisor())
  ) THEN
    RAISE EXCEPTION 'Contact not found or access denied' USING ERRCODE = '42501';
  END IF;

  -- Only author or admin can edit
  IF v_profile_id IS DISTINCT FROM v_author_id THEN
    IF auth.uid() IS NOT NULL AND NOT zapp.is_admin_or_supervisor() THEN
      RAISE EXCEPTION 'Only the note author or an admin can edit this note' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE zapp.contact_notes
     SET content    = COALESCE(p_content,   content),
         note_type  = COALESCE(p_note_type, note_type),
         is_pinned  = COALESCE(p_is_pinned, is_pinned),
         updated_by = v_profile_id,
         updated_at = pg_catalog.now()
   WHERE id = p_note_id;

  RETURN pg_catalog.jsonb_build_object('success', TRUE, 'note_id', p_note_id);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION zapp.update_contact_note(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.update_contact_note(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- =============================================================================
-- STEP 0b — Re-apply M25: merge_contacts + bulk_auto_merge_duplicates + cron
-- =============================================================================

-- merge_contacts: service_role bypass + deadlock-safe locks + unqualified COALESCE/GREATEST/LEAST
CREATE OR REPLACE FUNCTION zapp.merge_contacts(
  p_primary_id   UUID,
  p_secondary_id UUID,
  p_dry_run      BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, zapp, evo, public
AS $fn$
DECLARE
  v_primary   RECORD;
  v_secondary RECORD;
  v_result    JSONB := '[]'::JSONB;
  v_lock_1    UUID;
  v_lock_2    UUID;
  v_count     INT;
BEGIN
  -- Service_role bypass: skip auth check when called with service credentials
  IF auth.uid() IS NOT NULL AND NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Admin or supervisor role required' USING ERRCODE = '42501';
  END IF;

  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'Cannot merge a contact with itself' USING ERRCODE = 'P0001';
  END IF;

  -- Deadlock-safe: always acquire locks in ascending UUID order
  v_lock_1 := LEAST(p_primary_id, p_secondary_id);
  v_lock_2 := GREATEST(p_primary_id, p_secondary_id);

  PERFORM 1 FROM evo.evolution_contacts WHERE id = v_lock_1 FOR UPDATE;
  PERFORM 1 FROM evo.evolution_contacts WHERE id = v_lock_2 FOR UPDATE;

  -- Read rows WITHOUT FOR UPDATE (already locked above)
  SELECT * INTO v_primary   FROM evo.evolution_contacts WHERE id = p_primary_id;
  SELECT * INTO v_secondary FROM evo.evolution_contacts WHERE id = p_secondary_id;

  IF NOT FOUND OR v_primary.id IS NULL THEN
    RAISE EXCEPTION 'Primary contact % not found', p_primary_id USING ERRCODE = 'P0001';
  END IF;
  IF v_secondary.id IS NULL THEN
    RAISE EXCEPTION 'Secondary contact % not found', p_secondary_id USING ERRCODE = 'P0001';
  END IF;

  IF p_dry_run THEN
    RETURN pg_catalog.jsonb_build_object(
      'dry_run', TRUE,
      'primary_id', p_primary_id,
      'secondary_id', p_secondary_id,
      'primary_name', v_primary.push_name,
      'secondary_name', v_secondary.push_name
    );
  END IF;

  -- Merge: update messages referencing secondary → primary
  UPDATE evo.evolution_messages
     SET remote_jid = COALESCE(v_primary.remote_jid, v_secondary.remote_jid)
   WHERE remote_jid = v_secondary.remote_jid
     AND remote_jid IS DISTINCT FROM v_primary.remote_jid;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Soft-delete secondary contact
  UPDATE evo.evolution_contacts
     SET deleted_at = pg_catalog.now(),
         push_name  = push_name || ' [merged]'
   WHERE id = p_secondary_id;

  -- Patch primary with merged data
  UPDATE evo.evolution_contacts
     SET push_name    = COALESCE(v_primary.push_name,   v_secondary.push_name),
         profile_pic_url = COALESCE(v_primary.profile_pic_url, v_secondary.profile_pic_url),
         updated_at   = pg_catalog.now()
   WHERE id = p_primary_id;

  -- Audit log
  INSERT INTO zapp.audit_logs (action, entity_type, entity_id, user_id, details)
  VALUES (
    'contact.merged',
    'contact',
    p_primary_id,
    auth.uid(),
    pg_catalog.jsonb_build_object(
      'primary_id',   p_primary_id,
      'secondary_id', p_secondary_id,
      'messages_relinked', v_count
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'success',          TRUE,
    'primary_id',       p_primary_id,
    'secondary_id',     p_secondary_id,
    'messages_relinked', v_count
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION zapp.merge_contacts(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.merge_contacts(UUID, UUID, BOOLEAN) TO authenticated, service_role;

-- bulk_auto_merge_duplicates: service_role bypass
CREATE OR REPLACE FUNCTION zapp.bulk_auto_merge_duplicates(
  p_dry_run     BOOLEAN DEFAULT TRUE,
  p_limit       INT     DEFAULT 100,
  p_instance_id UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, zapp, evo, public
AS $fn$
DECLARE
  v_pair      RECORD;
  v_merged    INT := 0;
  v_skipped   INT := 0;
  v_results   JSONB := '[]'::JSONB;
  v_merge_res JSONB;
BEGIN
  -- Service_role bypass: skip auth check when called with service credentials
  IF auth.uid() IS NOT NULL AND NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Admin or supervisor role required' USING ERRCODE = '42501';
  END IF;

  FOR v_pair IN
    SELECT
      LEAST(a.id, b.id)    AS primary_id,
      GREATEST(a.id, b.id) AS secondary_id,
      a.remote_jid
    FROM evo.evolution_contacts a
    JOIN evo.evolution_contacts b
      ON a.remote_jid = b.remote_jid
     AND a.instance_id = b.instance_id
     AND a.id < b.id
     AND a.deleted_at IS NULL
     AND b.deleted_at IS NULL
    WHERE (p_instance_id IS NULL OR a.instance_id = p_instance_id)
    ORDER BY a.remote_jid
    LIMIT p_limit
  LOOP
    BEGIN
      v_merge_res := zapp.merge_contacts(v_pair.primary_id, v_pair.secondary_id, p_dry_run);
      v_merged := v_merged + 1;
      v_results := v_results || pg_catalog.jsonb_build_object(
        'primary_id',   v_pair.primary_id,
        'secondary_id', v_pair.secondary_id,
        'remote_jid',   v_pair.remote_jid
      );
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'dry_run', p_dry_run,
    'merged',  v_merged,
    'skipped', v_skipped,
    'pairs',   v_results
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION zapp.bulk_auto_merge_duplicates(BOOLEAN, INT, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.bulk_auto_merge_duplicates(BOOLEAN, INT, UUID) TO authenticated, service_role;

-- Cron: unschedule old job first (in EXCEPTION block), then schedule
DO $cron_merge$
BEGIN
  BEGIN
    PERFORM cron.unschedule('hard-delete-expired-contacts');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'hard-delete-expired-contacts',
    '0 3 * * *',
    $cron$
      SELECT zapp.bulk_auto_merge_duplicates(p_dry_run := FALSE, p_limit := 500)
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not schedule hard-delete-expired-contacts cron: %', SQLERRM;
END;
$cron_merge$;

-- =============================================================================
-- STEP 0c — Patch M22: fix pg_catalog.coalesce in fn_normalize_phone
-- =============================================================================
DO $step0c$
DECLARE
  v_src   TEXT;
  v_fixed TEXT;
  v_oid   OID;
BEGIN
  SELECT p.oid, pg_catalog.pg_get_functiondef(p.oid)
    INTO v_oid, v_src
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_normalize_phone'
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'fn_normalize_phone not found — skipping M22 patch';
    RETURN;
  END IF;

  IF position('pg_catalog.coalesce' IN pg_catalog.lower(v_src)) > 0 THEN
    v_fixed := pg_catalog.regexp_replace(
      v_src,
      'pg_catalog\.coalesce\(',
      'COALESCE(',
      'gi'
    );
    EXECUTE v_fixed;
    RAISE NOTICE 'fn_normalize_phone patched: pg_catalog.coalesce → COALESCE';
  ELSE
    RAISE NOTICE 'fn_normalize_phone already clean — no patch needed';
  END IF;
END;
$step0c$;

-- =============================================================================
-- STEP 1 — F6-05: Fix fn_reconcile_dispatch ON CONFLICT DO UPDATE → DO NOTHING
-- =============================================================================
DO $step1$
DECLARE
  v_src     TEXT;
  v_fixed   TEXT;
  v_oid     OID;
  v_pattern TEXT := 'ON CONFLICT \(request_id\) DO UPDATE\s+SET\s+dispatched_at\s*=\s*(?:now\(\)|pg_catalog\.now\(\))';
BEGIN
  SELECT p.oid, pg_catalog.pg_get_functiondef(p.oid)
    INTO v_oid, v_src
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_reconcile_dispatch'
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'fn_reconcile_dispatch not found — skipping F6-05 patch';
    RETURN;
  END IF;

  IF pg_catalog.regexp_replace(v_src, v_pattern, '', 'gi') <> v_src THEN
    v_fixed := pg_catalog.regexp_replace(
      v_src,
      v_pattern,
      'ON CONFLICT (request_id) DO NOTHING',
      'gi'
    );
    EXECUTE v_fixed;
    RAISE NOTICE 'fn_reconcile_dispatch patched: ON CONFLICT DO UPDATE → DO NOTHING';
  ELSE
    RAISE NOTICE 'fn_reconcile_dispatch does not match expected ON CONFLICT pattern — manual review needed';
  END IF;
END;
$step1$;

-- =============================================================================
-- STEP 2 — F6-21: evolution_reconcile_jobs table + data repair + UNIQUE constraint
-- =============================================================================
CREATE TABLE IF NOT EXISTS zapp.evolution_reconcile_jobs (
  id              UUID        NOT NULL DEFAULT pg_catalog.gen_random_uuid() PRIMARY KEY,
  request_id      BIGINT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'dispatched', 'done', 'failed')),
  payload         JSONB,
  dispatched_at   TIMESTAMPTZ,
  applied_at      TIMESTAMPTZ,
  error_detail    TEXT,
  instance_id     UUID        REFERENCES zapp.instance_registry(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- Enable RLS
ALTER TABLE zapp.evolution_reconcile_jobs ENABLE ROW LEVEL SECURITY;

DO $step2_rls$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_reconcile_jobs'
      AND policyname = 'svc_all_reconcile_jobs'
  ) THEN
    CREATE POLICY svc_all_reconcile_jobs ON zapp.evolution_reconcile_jobs
      FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_reconcile_jobs'
      AND policyname = 'admin_select_reconcile_jobs'
  ) THEN
    CREATE POLICY admin_select_reconcile_jobs ON zapp.evolution_reconcile_jobs
      FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
  END IF;
END;
$step2_rls$;

-- Data repair: rows where applied_at < dispatched_at indicate corrupted ON CONFLICT DO UPDATE
UPDATE zapp.evolution_reconcile_jobs
   SET status = 'done',
       updated_at = pg_catalog.now()
 WHERE applied_at IS NOT NULL
   AND dispatched_at IS NOT NULL
   AND applied_at < dispatched_at
   AND status <> 'done';

-- Remove duplicate request_ids, keeping the row with the lowest (oldest) id
DO $step2_dedup$
DECLARE
  v_deleted INT;
BEGIN
  WITH dupes AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY request_id ORDER BY created_at ASC, id ASC) AS rn
      FROM zapp.evolution_reconcile_jobs
     WHERE request_id IS NOT NULL
  )
  DELETE FROM zapp.evolution_reconcile_jobs
   WHERE id IN (SELECT id FROM dupes WHERE rn > 1);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted > 0 THEN
    RAISE NOTICE 'Removed % duplicate request_id rows from evolution_reconcile_jobs', v_deleted;
  END IF;
END;
$step2_dedup$;

-- Add UNIQUE constraint on request_id (idempotent)
DO $step2_uq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'zapp' AND table_name = 'evolution_reconcile_jobs'
      AND constraint_name = 'uq_reconcile_jobs_request_id'
  ) THEN
    ALTER TABLE zapp.evolution_reconcile_jobs
      ADD CONSTRAINT uq_reconcile_jobs_request_id UNIQUE (request_id);
  END IF;
END;
$step2_uq$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reconcile_jobs_status
  ON zapp.evolution_reconcile_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconcile_jobs_instance
  ON zapp.evolution_reconcile_jobs (instance_id, created_at DESC);

-- =============================================================================
-- STEP 3 — F6-06: evolution_alerts table + fn_alert_instance_disconnection + Realtime
-- =============================================================================
CREATE TABLE IF NOT EXISTS zapp.evolution_alerts (
  id            UUID        NOT NULL DEFAULT pg_catalog.gen_random_uuid() PRIMARY KEY,
  instance_id   UUID        REFERENCES zapp.instance_registry(id) ON DELETE CASCADE,
  alert_type    TEXT        NOT NULL DEFAULT 'disconnection'
                            CHECK (alert_type IN ('disconnection', 'rate_limit', 'auth_failure', 'health_degraded', 'reconnected')),
  severity      TEXT        NOT NULL DEFAULT 'warning'
                            CHECK (severity IN ('info', 'warning', 'critical')),
  message       TEXT,
  details       JSONB,
  resolved_at   TIMESTAMPTZ,
  acknowledged  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE zapp.evolution_alerts ENABLE ROW LEVEL SECURITY;

DO $step3_rls$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_alerts'
      AND policyname = 'svc_all_evolution_alerts'
  ) THEN
    CREATE POLICY svc_all_evolution_alerts ON zapp.evolution_alerts
      FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_alerts'
      AND policyname = 'auth_select_evolution_alerts'
  ) THEN
    CREATE POLICY auth_select_evolution_alerts ON zapp.evolution_alerts
      FOR SELECT TO authenticated USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_alerts'
      AND policyname = 'admin_update_evolution_alerts'
  ) THEN
    CREATE POLICY admin_update_evolution_alerts ON zapp.evolution_alerts
      FOR UPDATE TO authenticated USING (zapp.is_admin_or_supervisor())
      WITH CHECK (zapp.is_admin_or_supervisor());
  END IF;
END;
$step3_rls$;

CREATE INDEX IF NOT EXISTS idx_evolution_alerts_instance
  ON zapp.evolution_alerts (instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evolution_alerts_unresolved
  ON zapp.evolution_alerts (acknowledged, created_at DESC)
  WHERE resolved_at IS NULL;

-- fn_alert_instance_disconnection
CREATE OR REPLACE FUNCTION zapp.fn_alert_instance_disconnection(
  p_instance_id UUID,
  p_alert_type  TEXT    DEFAULT 'disconnection',
  p_message     TEXT    DEFAULT NULL,
  p_details     JSONB   DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, zapp, evo, public
AS $fn$
DECLARE
  v_alert_id  UUID;
  v_severity  TEXT;
BEGIN
  v_severity := CASE p_alert_type
    WHEN 'auth_failure'    THEN 'critical'
    WHEN 'disconnection'   THEN 'critical'
    WHEN 'health_degraded' THEN 'warning'
    WHEN 'rate_limit'      THEN 'warning'
    ELSE 'info'
  END;

  INSERT INTO zapp.evolution_alerts (
    instance_id,
    alert_type,
    severity,
    message,
    details,
    created_at,
    updated_at
  ) VALUES (
    p_instance_id,
    COALESCE(p_alert_type, 'disconnection'),
    v_severity,
    p_message,
    p_details,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION zapp.fn_alert_instance_disconnection(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_alert_instance_disconnection(UUID, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- Add to Realtime publication (idempotent)
DO $step3_realtime$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.evolution_alerts;
    RAISE NOTICE 'Added zapp.evolution_alerts to supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'zapp.evolution_alerts already in supabase_realtime';
  WHEN OTHERS THEN
    RAISE WARNING 'Could not add zapp.evolution_alerts to publication: %', SQLERRM;
  END;
END;
$step3_realtime$;

-- =============================================================================
-- STEP 4 — F6-08: auto-resolve evolution_alerts when instance reconnects
-- =============================================================================
CREATE OR REPLACE FUNCTION zapp.fn_wconn_status_auto_resolve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, zapp, evo, public
AS $fn$
BEGIN
  IF NEW.status = 'connected' AND (OLD.status IS DISTINCT FROM 'connected') THEN
    UPDATE zapp.evolution_alerts
       SET resolved_at  = pg_catalog.now(),
           updated_at   = pg_catalog.now()
     WHERE instance_id = NEW.id
       AND resolved_at IS NULL
       AND alert_type IN ('disconnection', 'auth_failure', 'health_degraded');
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_wconn_auto_resolve_alerts ON zapp.whatsapp_connections;
CREATE TRIGGER trg_wconn_auto_resolve_alerts
  AFTER UPDATE OF status ON zapp.whatsapp_connections
  FOR EACH ROW
  EXECUTE FUNCTION zapp.fn_wconn_status_auto_resolve();

-- =============================================================================
-- STEP 5 — F6-11: Actually DROP the 2 duplicate triggers on whatsapp_connections
-- (M12 only counted them — never executed the DROP)
-- Triggers to KEEP: trg_wconn_updated_at, trg_clear_qr_connect,
--                   trg_validate_whatsapp_connection_url,
--                   trg_log_whatsapp_connection_state_change
-- Triggers to DROP: update_whatsapp_connections_updated_at, clear_qr_on_connect_trigger
-- =============================================================================
DROP TRIGGER IF EXISTS update_whatsapp_connections_updated_at ON zapp.whatsapp_connections;
DROP TRIGGER IF EXISTS clear_qr_on_connect_trigger ON zapp.whatsapp_connections;

-- Verify the 4 correct triggers still exist after cleanup
DO $step5_verify$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'trg_wconn_updated_at',
    'trg_clear_qr_connect',
    'trg_validate_whatsapp_connection_url',
    'trg_log_whatsapp_connection_state_change'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger tr
      JOIN pg_catalog.pg_class cl ON cl.oid = tr.tgrelid
      JOIN pg_catalog.pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE ns.nspname = 'zapp'
        AND cl.relname = 'whatsapp_connections'
        AND tr.tgname = t
        AND NOT tr.tgisinternal
    ) THEN
      v_missing := v_missing || t;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE WARNING 'F6-11: The following expected triggers are missing on whatsapp_connections: %',
      array_to_string(v_missing, ', ');
  ELSE
    RAISE NOTICE 'F6-11: All 4 expected triggers verified on whatsapp_connections';
  END IF;
END;
$step5_verify$;

-- =============================================================================
-- STEP 6 — F6-12: Ensure fn_validate_whatsapp_connection_url exists & has dev-URL block
-- =============================================================================
DO $step6$
DECLARE
  v_src       TEXT;
  v_has_func  BOOLEAN;
  v_has_dev   BOOLEAN;
BEGIN
  SELECT TRUE, pg_catalog.pg_get_functiondef(p.oid)
    INTO v_has_func, v_src
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_validate_whatsapp_connection_url'
   LIMIT 1;

  v_has_func := COALESCE(v_has_func, FALSE);
  v_has_dev  := v_has_func AND (position('ngrok' IN pg_catalog.lower(v_src)) > 0
                              OR position('localhost' IN pg_catalog.lower(v_src)) > 0
                              OR position('dev-url' IN pg_catalog.lower(v_src)) > 0);

  IF NOT v_has_func OR NOT v_has_dev THEN
    RAISE NOTICE 'F6-12: Creating/replacing fn_validate_whatsapp_connection_url with dev-URL block';

    EXECUTE $inner$
      CREATE OR REPLACE FUNCTION zapp.fn_validate_whatsapp_connection_url()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO pg_catalog, zapp, evo, public
      AS $body$
      DECLARE
        v_url TEXT;
      BEGIN
        v_url := COALESCE(NEW.server_url, '');

        -- Must start with http:// or https://
        IF v_url <> '' AND v_url NOT LIKE 'http://%' AND v_url NOT LIKE 'https://%' THEN
          RAISE EXCEPTION 'Invalid server_url: must start with http:// or https://'
            USING ERRCODE = '22000';
        END IF;

        -- Block development/tunneling URLs in production-like contexts
        IF pg_catalog.lower(v_url) ~ '(localhost|127\.0\.0\.1|ngrok\.io|ngrok\.app|localtunnel|serveo\.net)' THEN
          RAISE EXCEPTION 'Development or tunneling URLs are not permitted in server_url: %', v_url
            USING ERRCODE = '22000';
        END IF;

        RETURN NEW;
      END;
      $body$
    $inner$;
  ELSE
    RAISE NOTICE 'F6-12: fn_validate_whatsapp_connection_url already has dev-URL block — no change needed';
  END IF;
END;
$step6$;

-- Ensure trigger is attached
DO $step6_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger tr
    JOIN pg_catalog.pg_class cl ON cl.oid = tr.tgrelid
    JOIN pg_catalog.pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE ns.nspname = 'zapp'
      AND cl.relname = 'whatsapp_connections'
      AND tr.tgname = 'trg_validate_whatsapp_connection_url'
      AND NOT tr.tgisinternal
  ) THEN
    EXECUTE $inner$
      CREATE TRIGGER trg_validate_whatsapp_connection_url
        BEFORE INSERT OR UPDATE OF server_url ON zapp.whatsapp_connections
        FOR EACH ROW
        EXECUTE FUNCTION zapp.fn_validate_whatsapp_connection_url()
    $inner$;
    RAISE NOTICE 'F6-12: Created trigger trg_validate_whatsapp_connection_url';
  ELSE
    RAISE NOTICE 'F6-12: Trigger trg_validate_whatsapp_connection_url already exists';
  END IF;
END;
$step6_trigger$;

-- =============================================================================
-- STEP 7 — Verification (ALL position() calls use standard SQL syntax)
-- NEVER pg_catalog.position() — use position('needle' IN string) only
-- =============================================================================
DO $verify$
DECLARE
  v_body  TEXT;
  v_count INT;
  v_errs  INT := 0;
BEGIN
  -- 7.1 Check contact_notes has note_type column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'contact_notes' AND column_name = 'note_type'
  ) THEN
    RAISE WARNING 'VERIFY FAIL: contact_notes.note_type column missing';
    v_errs := v_errs + 1;
  ELSE
    RAISE NOTICE 'VERIFY OK: contact_notes.note_type exists';
  END IF;

  -- 7.2 Check contact_notes has is_pinned column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'zapp' AND table_name = 'contact_notes' AND column_name = 'is_pinned'
  ) THEN
    RAISE WARNING 'VERIFY FAIL: contact_notes.is_pinned column missing';
    v_errs := v_errs + 1;
  ELSE
    RAISE NOTICE 'VERIFY OK: contact_notes.is_pinned exists';
  END IF;

  -- 7.3 Check contact_notes CHECK constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'zapp' AND table_name = 'contact_notes'
      AND constraint_name = 'ck_contact_notes_type'
  ) THEN
    RAISE WARNING 'VERIFY FAIL: ck_contact_notes_type constraint missing';
    v_errs := v_errs + 1;
  ELSE
    RAISE NOTICE 'VERIFY OK: ck_contact_notes_type constraint exists';
  END IF;

  -- 7.4 Check add_contact_note RPC exists and does NOT contain pg_catalog.coalesce
  SELECT pg_catalog.pg_get_functiondef(p.oid) INTO v_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'add_contact_note'
   LIMIT 1;

  IF v_body IS NULL THEN
    RAISE WARNING 'VERIFY FAIL: zapp.add_contact_note not found';
    v_errs := v_errs + 1;
  ELSE
    IF position('note_type' IN v_body) = 0 THEN
      RAISE WARNING 'VERIFY FAIL: add_contact_note body missing note_type reference';
      v_errs := v_errs + 1;
    ELSE
      RAISE NOTICE 'VERIFY OK: add_contact_note exists and references note_type';
    END IF;

    IF position('pg_catalog.coalesce' IN pg_catalog.lower(v_body)) > 0 THEN
      RAISE WARNING 'VERIFY FAIL: add_contact_note still contains pg_catalog.coalesce (invalid syntax)';
      v_errs := v_errs + 1;
    ELSE
      RAISE NOTICE 'VERIFY OK: add_contact_note uses COALESCE (not pg_catalog.coalesce)';
    END IF;
  END IF;

  -- 7.5 Check update_contact_note RPC exists and has IS DISTINCT FROM
  SELECT pg_catalog.pg_get_functiondef(p.oid) INTO v_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'update_contact_note'
   LIMIT 1;

  IF v_body IS NULL THEN
    RAISE WARNING 'VERIFY FAIL: zapp.update_contact_note not found';
    v_errs := v_errs + 1;
  ELSE
    IF position('IS DISTINCT FROM' IN v_body) = 0 THEN
      RAISE WARNING 'VERIFY FAIL: update_contact_note missing IS DISTINCT FROM (NULL-safe check)';
      v_errs := v_errs + 1;
    ELSE
      RAISE NOTICE 'VERIFY OK: update_contact_note has IS DISTINCT FROM';
    END IF;
  END IF;

  -- 7.6 Check evolution_alerts table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'zapp' AND table_name = 'evolution_alerts'
  ) THEN
    RAISE WARNING 'VERIFY FAIL: zapp.evolution_alerts table missing';
    v_errs := v_errs + 1;
  ELSE
    RAISE NOTICE 'VERIFY OK: zapp.evolution_alerts table exists';
  END IF;

  -- 7.7 Check fn_alert_instance_disconnection exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_alert_instance_disconnection'
  ) THEN
    RAISE WARNING 'VERIFY FAIL: zapp.fn_alert_instance_disconnection not found';
    v_errs := v_errs + 1;
  ELSE
    RAISE NOTICE 'VERIFY OK: zapp.fn_alert_instance_disconnection exists';
  END IF;

  -- 7.8 Check merge_contacts exists and has service_role bypass pattern
  SELECT pg_catalog.pg_get_functiondef(p.oid) INTO v_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'merge_contacts'
   LIMIT 1;

  IF v_body IS NULL THEN
    RAISE WARNING 'VERIFY FAIL: zapp.merge_contacts not found';
    v_errs := v_errs + 1;
  ELSE
    IF position('auth.uid() IS NOT NULL' IN v_body) = 0 THEN
      RAISE WARNING 'VERIFY FAIL: merge_contacts missing service_role bypass (auth.uid() IS NOT NULL check)';
      v_errs := v_errs + 1;
    ELSE
      RAISE NOTICE 'VERIFY OK: merge_contacts has service_role bypass';
    END IF;

    IF position('pg_catalog.coalesce' IN pg_catalog.lower(v_body)) > 0
    OR position('pg_catalog.greatest' IN pg_catalog.lower(v_body)) > 0
    OR position('pg_catalog.least'    IN pg_catalog.lower(v_body)) > 0 THEN
      RAISE WARNING 'VERIFY FAIL: merge_contacts contains invalid pg_catalog.COALESCE/GREATEST/LEAST';
      v_errs := v_errs + 1;
    ELSE
      RAISE NOTICE 'VERIFY OK: merge_contacts uses unqualified COALESCE/GREATEST/LEAST';
    END IF;
  END IF;

  -- 7.9 Check duplicate triggers were removed
  SELECT COUNT(*) INTO v_count
    FROM pg_catalog.pg_trigger tr
    JOIN pg_catalog.pg_class cl ON cl.oid = tr.tgrelid
    JOIN pg_catalog.pg_namespace ns ON ns.oid = cl.relnamespace
   WHERE ns.nspname = 'zapp'
     AND cl.relname = 'whatsapp_connections'
     AND tr.tgname IN ('update_whatsapp_connections_updated_at', 'clear_qr_on_connect_trigger')
     AND NOT tr.tgisinternal;

  IF v_count > 0 THEN
    RAISE WARNING 'VERIFY FAIL: % old duplicate trigger(s) still present on whatsapp_connections', v_count;
    v_errs := v_errs + 1;
  ELSE
    RAISE NOTICE 'VERIFY OK: old duplicate triggers removed from whatsapp_connections';
  END IF;

  -- 7.10 Check fn_validate_whatsapp_connection_url dev-URL block
  SELECT pg_catalog.pg_get_functiondef(p.oid) INTO v_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_validate_whatsapp_connection_url'
   LIMIT 1;

  IF v_body IS NULL THEN
    RAISE WARNING 'VERIFY FAIL: zapp.fn_validate_whatsapp_connection_url not found';
    v_errs := v_errs + 1;
  ELSE
    IF position('ngrok' IN pg_catalog.lower(v_body)) = 0
    AND position('localhost' IN pg_catalog.lower(v_body)) = 0 THEN
      RAISE WARNING 'VERIFY FAIL: fn_validate_whatsapp_connection_url missing dev-URL block';
      v_errs := v_errs + 1;
    ELSE
      RAISE NOTICE 'VERIFY OK: fn_validate_whatsapp_connection_url has dev-URL block';
    END IF;
  END IF;

  -- 7.11 Check evolution_reconcile_jobs UNIQUE constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'zapp' AND table_name = 'evolution_reconcile_jobs'
      AND constraint_name = 'uq_reconcile_jobs_request_id'
  ) THEN
    RAISE WARNING 'VERIFY FAIL: uq_reconcile_jobs_request_id constraint missing';
    v_errs := v_errs + 1;
  ELSE
    RAISE NOTICE 'VERIFY OK: uq_reconcile_jobs_request_id UNIQUE constraint exists';
  END IF;

  -- 7.12 Check auto-resolve trigger on whatsapp_connections
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger tr
    JOIN pg_catalog.pg_class cl ON cl.oid = tr.tgrelid
    JOIN pg_catalog.pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE ns.nspname = 'zapp'
      AND cl.relname = 'whatsapp_connections'
      AND tr.tgname = 'trg_wconn_auto_resolve_alerts'
      AND NOT tr.tgisinternal
  ) THEN
    RAISE WARNING 'VERIFY FAIL: trg_wconn_auto_resolve_alerts trigger missing';
    v_errs := v_errs + 1;
  ELSE
    RAISE NOTICE 'VERIFY OK: trg_wconn_auto_resolve_alerts trigger exists';
  END IF;

  -- Final summary
  IF v_errs = 0 THEN
    RAISE NOTICE 'M26 VERIFICATION PASSED — 12/12 checks OK';
  ELSE
    RAISE EXCEPTION 'M26 VERIFICATION FAILED — % check(s) failed. See WARNINGs above.', v_errs
      USING ERRCODE = 'P0001';
  END IF;
END;
$verify$;

-- =============================================================================
-- END OF M26
-- =============================================================================
