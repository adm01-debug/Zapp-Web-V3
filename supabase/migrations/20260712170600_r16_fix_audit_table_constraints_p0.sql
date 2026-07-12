-- Round 16 Migration #7: Fix CHECK(false) Constraints & Audit Table P0 Bugs
-- Severity: CRITICAL — CHECK(false) on lgpd_consent_audit, message_audit_log, and
--           contact_id_graveyard blocks ALL inserts, making LGPD audit infrastructure
--           entirely non-functional. Also fixes type mismatches and invalid RLS syntax.
-- Fix: Drop CHECK(false) constraints, enforce immutability via BEFORE triggers instead.
--      Fix delete_contact_completely overload conflict. Fix audit_log.created_by type.
-- Date: 2026-07-12
-- Impact: Restores LGPD audit trail functionality (was 100% broken)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix lgpd_consent_audit — remove CHECK(false), add trigger immutability
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Drop the broken constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'lgpd_consent_audit'
      AND constraint_name = 'audit_immutable'
      AND constraint_type = 'CHECK'
  ) THEN
    ALTER TABLE public.lgpd_consent_audit DROP CONSTRAINT audit_immutable;
    RAISE NOTICE 'Dropped CHECK(false) constraint audit_immutable from lgpd_consent_audit';
  END IF;
END;
$$;

-- Trigger-based immutability (much safer — only blocks DELETE/UPDATE, not INSERT)
CREATE OR REPLACE FUNCTION fn_lgpd_consent_audit_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lgpd_consent_audit_immutable: Consent audit records cannot be deleted'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'lgpd_consent_audit_immutable: Consent audit records cannot be modified'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'lgpd_consent_audit'
  ) THEN
    DROP TRIGGER IF EXISTS trg_lgpd_consent_audit_immutable ON public.lgpd_consent_audit;
    CREATE TRIGGER trg_lgpd_consent_audit_immutable
      BEFORE DELETE OR UPDATE ON public.lgpd_consent_audit
      FOR EACH ROW EXECUTE FUNCTION fn_lgpd_consent_audit_immutable();
  END IF;
END;
$$;

-- Add archived_at column if missing (needed for archival function)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'lgpd_consent_audit'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'lgpd_consent_audit'
        AND column_name = 'archived_at'
    ) THEN
      ALTER TABLE public.lgpd_consent_audit ADD COLUMN archived_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_lgpd_consent_audit_archived
        ON public.lgpd_consent_audit (archived_at)
        WHERE archived_at IS NOT NULL;
      RAISE NOTICE 'Added archived_at column to lgpd_consent_audit';
    END IF;
  ELSE
    RAISE NOTICE 'lgpd_consent_audit table does not exist — skipping archived_at column';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix message_audit_log — remove CHECK(false), make content nullable
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'message_audit_log'
      AND constraint_name = 'audit_immutable'
      AND constraint_type = 'CHECK'
  ) THEN
    ALTER TABLE public.message_audit_log DROP CONSTRAINT audit_immutable;
    RAISE NOTICE 'Dropped CHECK(false) from message_audit_log';
  END IF;
END;
$$;

-- Make content nullable (was NOT NULL, caused all inserts to fail when omitted)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'message_audit_log'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'message_audit_log'
        AND column_name = 'content'
        AND is_nullable = 'NO'
    ) THEN
      ALTER TABLE public.message_audit_log ALTER COLUMN content DROP NOT NULL;
      RAISE NOTICE 'Made message_audit_log.content nullable';
    END IF;
  ELSE
    RAISE NOTICE 'message_audit_log table does not exist — skipping content nullable fix';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_message_audit_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'message_audit_log_immutable: Message audit records cannot be deleted'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'message_audit_log_immutable: Message audit records cannot be modified'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'message_audit_log'
  ) THEN
    DROP TRIGGER IF EXISTS trg_message_audit_log_immutable ON public.message_audit_log;
    CREATE TRIGGER trg_message_audit_log_immutable
      BEFORE DELETE OR UPDATE ON public.message_audit_log
      FOR EACH ROW EXECUTE FUNCTION fn_message_audit_log_immutable();
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fix contact_id_graveyard — remove CHECK(false)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'contact_id_graveyard'
      AND constraint_name = 'graveyard_immutable'
      AND constraint_type = 'CHECK'
  ) THEN
    ALTER TABLE public.contact_id_graveyard DROP CONSTRAINT graveyard_immutable;
    RAISE NOTICE 'Dropped CHECK(false) from contact_id_graveyard';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_contact_graveyard_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'graveyard_immutable: Graveyard records cannot be deleted'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'graveyard_immutable: Graveyard records cannot be modified'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'contact_id_graveyard'
  ) THEN
    DROP TRIGGER IF EXISTS trg_contact_graveyard_immutable ON public.contact_id_graveyard;
    CREATE TRIGGER trg_contact_graveyard_immutable
      BEFORE DELETE OR UPDATE ON public.contact_id_graveyard
      FOR EACH ROW EXECUTE FUNCTION fn_contact_graveyard_immutable();
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Fix delete_contact_completely — remove overloads, create clean UUID version
--    Original BIGINT overload created type conflict; broad GRANT to authenticated
--    allowed any user to permanently delete any contact
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop all overloads
DROP FUNCTION IF EXISTS public.delete_contact_completely(BIGINT);
DROP FUNCTION IF EXISTS public.delete_contact_completely(UUID);
DROP FUNCTION IF EXISTS public.delete_contact_completely(TEXT);

-- Safe replacement: admin/supervisor only, workspace-scoped
CREATE OR REPLACE FUNCTION fn_delete_contact_completely(p_contact_id UUID)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public', 'evo'
AS $$
DECLARE
  v_actor       UUID;
  v_workspace   UUID;
  v_contact     RECORD;
  v_deleted_at  TIMESTAMPTZ;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  IF NOT is_admin_or_supervisor(v_actor) THEN
    RAISE EXCEPTION 'insufficient_privilege: Only admins/supervisors may permanently delete contacts'
      USING ERRCODE = '42501';
  END IF;

  -- Find the contact and check workspace scope
  SELECT c.id, c.workspace_id, c.full_name, c.phone_number
  INTO v_contact
  FROM evo.evolution_contacts c
  JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
    AND wm.user_id = v_actor
    AND wm.accepted_at IS NOT NULL
  WHERE c.id = p_contact_id;

  IF NOT FOUND THEN
    -- Either doesn't exist or out of scope — return same error to prevent enumeration
    RAISE EXCEPTION 'contact_not_found: Contact % not found or not in your workspace', p_contact_id
      USING ERRCODE = 'P0002';
  END IF;

  v_deleted_at := now();

  -- Step 1: soft-delete first (creates audit trail)
  UPDATE evo.evolution_contacts
  SET deleted_at = v_deleted_at,
      full_name   = 'DELETED',
      phone_number = 'DELETED',
      email        = 'DELETED',
      push_name    = 'DELETED',
      profile_picture_url = 'DELETED',
      notes        = NULL,
      raw_data     = '{"deleted":true}'::jsonb,
      updated_at   = v_deleted_at
  WHERE id = p_contact_id;

  -- Step 2: Record in graveyard (prevents ID reuse)
  INSERT INTO public.contact_id_graveyard (
    original_id, deleted_at, deleted_by, workspace_id, reason
  )
  VALUES (
    p_contact_id, v_deleted_at, v_actor, v_contact.workspace_id, 'admin_hard_delete'
  )
  ON CONFLICT (original_id) DO NOTHING;

  -- Step 3: Emit to tamper-evident chain
  PERFORM fn_append_audit_event(
    'CONTACT_HARD_DELETE',
    v_actor,
    'contact',
    p_contact_id::TEXT,
    jsonb_build_object(
      'workspace_id', v_contact.workspace_id,
      'deleted_at', v_deleted_at,
      'deleted_by', v_actor
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'contact_id', p_contact_id,
    'deleted_at', v_deleted_at
  );
END;
$$;

REVOKE ALL ON FUNCTION fn_delete_contact_completely(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_delete_contact_completely(UUID) FROM anon;
REVOKE ALL ON FUNCTION fn_delete_contact_completely(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_delete_contact_completely(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Fix _snapshot_version_state RLS — invalid AS (ALL) syntax
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = '_snapshot_version_state'
  ) THEN
    -- Drop the broken policy (AS (ALL) is not valid RLS syntax)
    DROP POLICY IF EXISTS snapshot_version_no_direct_access ON public._snapshot_version_state;

    -- Recreate with correct syntax
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = '_snapshot_version_state'
        AND policyname = 'svs_svc_only'
    ) THEN
      EXECUTE 'CREATE POLICY svs_svc_only ON public._snapshot_version_state
               AS RESTRICTIVE
               TO service_role
               USING (true)
               WITH CHECK (true)';
    END IF;

    -- Block all other roles entirely (restrictive policy + no permissive grant = deny)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = '_snapshot_version_state'
        AND policyname = 'svs_deny_others'
    ) THEN
      EXECUTE 'CREATE POLICY svs_deny_others ON public._snapshot_version_state
               AS PERMISSIVE
               USING (false)';
    END IF;

    RAISE NOTICE 'Fixed _snapshot_version_state RLS policies';
  ELSE
    RAISE NOTICE '_snapshot_version_state does not exist — skipping';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Fix audit_log.created_by — BIGINT FK references auth.users.id UUID
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Check if table exists first
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'audit_log'
  ) THEN
    -- Check if created_by column exists and is BIGINT
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'audit_log'
        AND column_name = 'created_by'
        AND data_type = 'bigint'
    ) THEN
    -- Drop FK constraint if exists
    DECLARE
      v_fk_name TEXT;
    BEGIN
      SELECT tc.constraint_name INTO v_fk_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'audit_log'
        AND kcu.column_name = 'created_by'
        AND tc.constraint_type = 'FOREIGN KEY'
      LIMIT 1;

      IF v_fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.audit_log DROP CONSTRAINT %I', v_fk_name);
        RAISE NOTICE 'Dropped FK % from audit_log.created_by', v_fk_name;
      END IF;
    END;

    -- Change column type from BIGINT to UUID
    ALTER TABLE public.audit_log ALTER COLUMN created_by TYPE UUID
      USING NULL;  -- existing BIGINT values cannot be cast to UUID; null them out

    RAISE NOTICE 'Changed audit_log.created_by from BIGINT to UUID';
  ELSE
    RAISE NOTICE 'audit_log.created_by is not BIGINT — skipping type change';
  END IF;

    -- Add indexes if missing
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity
      ON public.audit_log (entity_type, entity_id, created_at DESC)
      WHERE entity_type IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_audit_log_created_by
      ON public.audit_log (created_by, created_at DESC)
      WHERE created_by IS NOT NULL;
    END IF;  -- end column existence check
  ELSE
    RAISE NOTICE 'audit_log table does not exist — skipping created_by type fix';
  END IF;  -- end table existence check

END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Fix archive_old_consent_records — references nonexistent archived_at,
--    missing DELETE after INSERT, LGPD minimum retention violation
-- ─────────────────────────────────────────────────────────────────────────────

-- Create archive table if not exists (only if base table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'lgpd_consent_audit'
  ) THEN
    CREATE TABLE IF NOT EXISTS public.lgpd_consent_audit_archive (
      LIKE public.lgpd_consent_audit INCLUDING ALL
    );
    RAISE NOTICE 'Created lgpd_consent_audit_archive table';
  ELSE
    RAISE NOTICE 'lgpd_consent_audit base table does not exist — skipping archive table creation';
  END IF;
END;
$$;

-- Minimum retention LGPD Article 16: 5 years = 1825 days
CREATE OR REPLACE FUNCTION archive_old_consent_records(
  p_archive_before_days  INT DEFAULT 1825,
  p_hard_delete_after_days INT DEFAULT 3650
)
RETURNS TABLE(archived_count INT, deleted_count INT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_archive_cutoff     TIMESTAMPTZ;
  v_delete_cutoff      TIMESTAMPTZ;
  v_archived           INT := 0;
  v_deleted            INT := 0;
BEGIN
  -- LGPD minimum 5 years — enforce lower bound
  IF p_archive_before_days < 1825 THEN
    RAISE EXCEPTION 'lgpd_retention_violation: archive_before_days must be >= 1825 (LGPD 5-year minimum), got %',
      p_archive_before_days
      USING ERRCODE = '22023';
  END IF;

  IF p_hard_delete_after_days < p_archive_before_days THEN
    RAISE EXCEPTION 'invalid_delete_threshold: hard_delete_after_days must be >= archive_before_days'
      USING ERRCODE = '22023';
  END IF;

  v_archive_cutoff := now() - (p_archive_before_days || ' days')::INTERVAL;
  v_delete_cutoff  := now() - (p_hard_delete_after_days || ' days')::INTERVAL;

  -- Step 1: Archive records older than archive cutoff that aren't yet archived
  INSERT INTO public.lgpd_consent_audit_archive
  SELECT *
  FROM public.lgpd_consent_audit
  WHERE created_at < v_archive_cutoff
    AND archived_at IS NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  -- Step 2: Mark as archived in the active table (timestamp, not delete)
  UPDATE public.lgpd_consent_audit
  SET archived_at = now()
  WHERE created_at < v_archive_cutoff
    AND archived_at IS NULL;

  -- Step 3: Hard delete from active table — only rows archived AND past hard-delete cutoff
  -- Note: archived rows remain in lgpd_consent_audit_archive indefinitely
  DELETE FROM public.lgpd_consent_audit
  WHERE archived_at IS NOT NULL
    AND created_at < v_delete_cutoff;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_archived, v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION archive_old_consent_records(INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION archive_old_consent_records(INT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION archive_old_consent_records(INT, INT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Drop no-arg is_admin_or_supervisor() overload — keeps only UUID-arg version
--    The no-arg overload queries auth.users.role (non-RBAC) causing logic conflicts
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Only drop if there are 2 overloads (one with arg, one without)
  IF (
    SELECT COUNT(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_admin_or_supervisor'
  ) > 1 THEN
    DROP FUNCTION IF EXISTS public.is_admin_or_supervisor();
    RAISE NOTICE 'Dropped no-arg is_admin_or_supervisor() overload';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Fix security_acl_alerts — restrict to admin/supervisor only
--    Original policy allowed ALL authenticated users to see security alerts
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'security_acl_alerts'
  ) THEN
    -- Drop the overly permissive policy
    DROP POLICY IF EXISTS auth_read ON public.security_acl_alerts;
    DROP POLICY IF EXISTS saa_auth_read ON public.security_acl_alerts;

    -- Restrictive replacement — admin/supervisor only
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'security_acl_alerts' AND policyname = 'saa_admin_read'
    ) THEN
      EXECUTE 'CREATE POLICY saa_admin_read ON public.security_acl_alerts
               FOR SELECT TO authenticated
               USING (is_admin_or_supervisor(auth.uid()))';
    END IF;

    RAISE NOTICE 'Restricted security_acl_alerts to admin/supervisor';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Verification: confirm no CHECK(false) constraints remain on audit tables
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_broken_count INT;
BEGIN
  SELECT COUNT(*) INTO v_broken_count
  FROM information_schema.check_constraints cc
  JOIN information_schema.table_constraints tc
    ON tc.constraint_name = cc.constraint_name
    AND tc.table_schema = cc.constraint_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name IN ('lgpd_consent_audit', 'message_audit_log', 'contact_id_graveyard')
    AND cc.check_clause = 'false';

  IF v_broken_count > 0 THEN
    RAISE EXCEPTION 'CRITICAL: % CHECK(false) constraint(s) still exist on audit tables',
      v_broken_count
      USING ERRCODE = '42P13';
  END IF;

  RAISE NOTICE 'Verified: No CHECK(false) constraints remain on audit tables';
END;
$$;

COMMIT;
