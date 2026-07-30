-- ============================================================
-- Migration: 20260716200100_r23_p2_harden_prevent_role_escalation
-- Purpose  : P2 – Harden prevent_role_escalation trigger
-- Changes  :
--   1. Add RAISE LOG (persists even after tx rollback via server logs)
--   2. Add best-effort INSERT into zapp.audit_logs
--   3. Add RAISE EXCEPTION with ERRCODE=insufficient_privilege
--   4. Guard auth.uid() with EXCEPTION handler (NULL if no JWT)
--   5. COALESCE(is_admin_or_supervisor(NULL), false) defensive
--   6. search_path updated to include 'zapp' explicitly
-- Applied  : 2026-07-16 live
-- Idempotent: YES (CREATE OR REPLACE)
-- ============================================================

CREATE OR REPLACE FUNCTION zapp.prevent_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'public', 'auth', 'extensions', 'pg_catalog'
AS $function$
DECLARE
  v_uid        uuid;
  v_blocked    text[] := '{}';
BEGIN
  -- ① service_role always permitted
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- ② Resolve caller identity safely (NULL if no JWT context)
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  -- ③ Check role escalation
  IF OLD.role IS DISTINCT FROM NEW.role
     AND NOT COALESCE(zapp.is_admin_or_supervisor(v_uid), false) THEN
    v_blocked := array_append(v_blocked,
      format('role: %s -> %s',
        COALESCE(OLD.role,'null'), COALESCE(NEW.role,'null')));
    NEW.role := OLD.role;  -- preemptive revert (belt-and-suspenders)
  END IF;

  -- ④ Check access_level escalation
  IF OLD.access_level IS DISTINCT FROM NEW.access_level
     AND NOT COALESCE(zapp.is_admin_or_supervisor(v_uid), false) THEN
    v_blocked := array_append(v_blocked,
      format('access_level: %s -> %s',
        COALESCE(OLD.access_level::text,'null'),
        COALESCE(NEW.access_level::text,'null')));
    NEW.access_level := OLD.access_level;
  END IF;

  -- ⑤ Check permissions escalation
  IF OLD.permissions IS DISTINCT FROM NEW.permissions
     AND NOT COALESCE(zapp.is_admin_or_supervisor(v_uid), false) THEN
    v_blocked := array_append(v_blocked, 'permissions');
    NEW.permissions := OLD.permissions;
  END IF;

  -- ⑥ If any violation detected
  IF array_length(v_blocked, 1) > 0 THEN

    -- Server log: persists even after transaction rollback
    RAISE LOG 'PRIVILEGE_ESCALATION_BLOCKED | user=% | profile=% | fields=[%]',
      v_uid, OLD.id, array_to_string(v_blocked, ', ');

    -- Best-effort audit log (will roll back with RAISE EXCEPTION, but logged above)
    BEGIN
      INSERT INTO zapp.audit_logs
        (id, action, entity_id, entity_type, user_id, details, event_type, status)
      VALUES (
        gen_random_uuid(),
        'PRIVILEGE_ESCALATION_BLOCKED',
        OLD.id,
        'profile',
        v_uid,
        jsonb_build_object(
          'blocked_fields', v_blocked,
          'old_role', OLD.role,
          'new_role_attempted', NEW.role,
          'trigger', TG_NAME,
          'table', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
        ),
        'security',
        'blocked'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- do not cascade audit failure into security enforcement
    END;

    -- Explicit exception: aborts the UPDATE, caller receives error 42501
    RAISE EXCEPTION 'PRIVILEGE_ESCALATION_BLOCKED: Unauthorized attempt on field(s) [%] for profile %. Operation aborted (42501).',
      array_to_string(v_blocked, ', '), OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;
