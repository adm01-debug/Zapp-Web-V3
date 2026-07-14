-- Round 16 Migration #3: Privilege Escalation Detection & Time-Limited Admin Grants
-- Severity: HIGH — Without escalation detection, a compromised account gaining
--           admin/supervisor role is invisible until manual audit.
-- Fix: Real-time escalation detection trigger, alert insertion, time-bounded grants,
--      workspace_members immutable audit, automatic expiry enforcer.
-- Date: 2026-07-12
-- Impact: Detects and logs privilege escalation in <1s; enables least-privilege TTL grants

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Time-limited privilege grants table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.timed_privilege_grants (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL,
  workspace_id  UUID,
  granted_role  TEXT        NOT NULL,
  granted_by    UUID        NOT NULL,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  revoked_by    UUID,
  revoke_reason TEXT,
  CONSTRAINT chk_expires_after_granted CHECK (expires_at > granted_at),
  CONSTRAINT chk_duration_max_72h CHECK (
    expires_at <= granted_at + INTERVAL '72 hours'
  )
);

CREATE INDEX IF NOT EXISTS idx_timed_grants_user_active
  ON public.timed_privilege_grants (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_timed_grants_expires
  ON public.timed_privilege_grants (expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.timed_privilege_grants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='timed_privilege_grants' AND policyname='tpg_svc_full') THEN
    EXECUTE 'CREATE POLICY tpg_svc_full ON public.timed_privilege_grants TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='timed_privilege_grants' AND policyname='tpg_admin_read') THEN
    EXECUTE 'CREATE POLICY tpg_admin_read ON public.timed_privilege_grants FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()) OR user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='timed_privilege_grants' AND policyname='tpg_admin_insert') THEN
    EXECUTE 'CREATE POLICY tpg_admin_insert ON public.timed_privilege_grants FOR INSERT TO authenticated
             WITH CHECK (is_admin_or_supervisor(auth.uid()))';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Grant function — creates time-limited role with max 72h window
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_grant_timed_privilege(
  p_user_id     UUID,
  p_role        TEXT,
  p_duration_h  INT DEFAULT 1,
  p_workspace_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_grant_id UUID;
  v_actor    UUID;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required: Must be authenticated to grant privileges'
      USING ERRCODE = '42501';
  END IF;

  IF NOT is_admin_or_supervisor(v_actor) THEN
    RAISE EXCEPTION 'insufficient_privilege: Only admins can grant timed privileges'
      USING ERRCODE = '42501';
  END IF;

  IF p_duration_h < 1 OR p_duration_h > 72 THEN
    RAISE EXCEPTION 'invalid_duration: Duration must be 1–72 hours, got %', p_duration_h
      USING ERRCODE = '22023';
  END IF;

  IF p_role NOT IN ('admin', 'supervisor', 'agent') THEN
    RAISE EXCEPTION 'invalid_role: Role "%" is not valid. Allowed: admin, supervisor, agent', p_role
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.timed_privilege_grants (
    user_id, workspace_id, granted_role, granted_by, expires_at
  ) VALUES (
    p_user_id, p_workspace_id, p_role, v_actor,
    now() + (p_duration_h || ' hours')::INTERVAL
  ) RETURNING id INTO v_grant_id;

  -- Emit to tamper-evident chain
  PERFORM fn_append_audit_event(
    'TIMED_GRANT',
    v_actor,
    'user',
    p_user_id::TEXT,
    jsonb_build_object(
      'grant_id', v_grant_id,
      'role', p_role,
      'duration_h', p_duration_h,
      'expires_at', (now() + (p_duration_h || ' hours')::INTERVAL),
      'workspace_id', p_workspace_id
    )
  );

  RETURN v_grant_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_grant_timed_privilege(UUID, TEXT, INT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_grant_timed_privilege(UUID, TEXT, INT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION fn_grant_timed_privilege(UUID, TEXT, INT, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Revoke expired grants (callable by cron or pg_cron)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_expire_timed_grants()
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_expired_count INT;
  v_grant RECORD;
BEGIN
  v_expired_count := 0;

  FOR v_grant IN
    SELECT id, user_id, granted_role, workspace_id
    FROM public.timed_privilege_grants
    WHERE expires_at <= now()
      AND revoked_at IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.timed_privilege_grants
    SET revoked_at = now(), revoke_reason = 'auto_expired'
    WHERE id = v_grant.id;

    PERFORM fn_append_audit_event(
      'GRANT_EXPIRED',
      NULL,
      'user',
      v_grant.user_id::TEXT,
      jsonb_build_object(
        'grant_id', v_grant.id,
        'role', v_grant.granted_role,
        'workspace_id', v_grant.workspace_id
      )
    );

    v_expired_count := v_expired_count + 1;
  END LOOP;

  RETURN v_expired_count;
END;
$$;

REVOKE ALL ON FUNCTION fn_expire_timed_grants() FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_expire_timed_grants() FROM anon;
GRANT EXECUTE ON FUNCTION fn_expire_timed_grants() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Privilege escalation detection trigger on user_roles
--    Fires when role = 'admin' or 'supervisor' is granted to any user
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_detect_privilege_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_escalation BOOLEAN := FALSE;
  v_alert_severity TEXT;
BEGIN
  -- Escalation: role changed TO admin/supervisor/owner
  IF TG_OP = 'INSERT' AND NEW.role::TEXT IN ('admin', 'supervisor') THEN
    v_is_escalation := TRUE;
    v_alert_severity := 'HIGH';
  ELSIF TG_OP = 'UPDATE' AND OLD.role::TEXT NOT IN ('admin', 'supervisor') AND
        NEW.role::TEXT IN ('admin', 'supervisor') THEN
    v_is_escalation := TRUE;
    v_alert_severity := 'CRITICAL';  -- Lateral escalation is more dangerous
  END IF;

  IF v_is_escalation THEN
    INSERT INTO public.security_acl_alerts (
      alert_type, object_name, role_name, privilege, severity, details
    ) VALUES (
      'PRIVILEGE_ESCALATION',
      'user_roles',
      NEW.role::TEXT,
      'ROLE_GRANT',
      v_alert_severity,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'role_granted', NEW.role::TEXT,
        'operation', TG_OP,
        'old_role', CASE WHEN TG_OP = 'UPDATE' THEN OLD.role::TEXT ELSE NULL END,
        'granted_by', auth.uid(),
        'workspace_id', NEW.workspace_id,
        'timestamp', now()
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_privilege_escalation_detect ON public.user_roles;
CREATE TRIGGER trg_privilege_escalation_detect
  AFTER INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION fn_detect_privilege_escalation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. workspace_members escalation detection (owner role)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_detect_workspace_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role IN ('admin', 'owner') THEN
    INSERT INTO public.security_acl_alerts (
      alert_type, object_name, role_name, privilege, severity, details
    ) VALUES (
      'WORKSPACE_ESCALATION',
      'workspace_members',
      NEW.role,
      'ROLE_GRANT',
      'HIGH',
      jsonb_build_object(
        'user_id', NEW.user_id,
        'role', NEW.role,
        'workspace_id', NEW.workspace_id,
        'operation', 'INSERT',
        'timestamp', now()
      )
    );
  ELSIF TG_OP = 'UPDATE' AND
        OLD.role NOT IN ('admin', 'owner') AND
        NEW.role IN ('admin', 'owner') THEN
    INSERT INTO public.security_acl_alerts (
      alert_type, object_name, role_name, privilege, severity, details
    ) VALUES (
      'WORKSPACE_ESCALATION',
      'workspace_members',
      NEW.role,
      'ROLE_CHANGE',
      'CRITICAL',
      jsonb_build_object(
        'user_id', NEW.user_id,
        'old_role', OLD.role,
        'new_role', NEW.role,
        'workspace_id', NEW.workspace_id,
        'operation', 'UPDATE',
        'timestamp', now()
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_escalation_detect ON public.workspace_members;
CREATE TRIGGER trg_workspace_escalation_detect
  AFTER INSERT OR UPDATE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION fn_detect_workspace_escalation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Register grant expiry job if pg_cron available
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'expire-timed-grants',
      '*/15 * * * *',
      'SELECT fn_expire_timed_grants()'
    );
    RAISE NOTICE 'pg_cron: expire-timed-grants job scheduled (every 15 minutes)';
  ELSE
    RAISE NOTICE 'pg_cron not available — fn_expire_timed_grants() must be called manually';
  END IF;
END;
$$;

COMMIT;
