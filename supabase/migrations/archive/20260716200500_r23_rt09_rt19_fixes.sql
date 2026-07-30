-- ============================================================
-- Migration: 20260716200500_r23_rt09_rt19_fixes
-- Purpose  : Fix RT09 (INSTEAD OF triggers) + RT19 (secret cols in view)
-- Applied  : 2026-07-16 live
-- Idempotent: YES
-- ============================================================

-- FIX RT19: Remove api_key + instance_token from public.evolution_instance_credentials
DROP VIEW IF EXISTS public.evolution_instance_credentials;
CREATE VIEW public.evolution_instance_credentials
  WITH (security_invoker=true)
AS
  SELECT
    id, instance_name, api_url,
    -- api_key OMITIDA (sensitive credential - acesso via SECDEF RPC apenas)
    display_name, department, health_status, last_health_check,
    online_instances, total_instances, notes, is_active,
    created_at, updated_at, connection_id,
    -- instance_token OMITIDA (sensitive credential)
    webhook_url
  FROM evo.evolution_instance_credentials;

-- FIX RT09: INSTEAD OF triggers em public.app_notifications
-- RT09 espera 3 triggers INSTEAD OF (INSERT, UPDATE, DELETE) nessa view

CREATE OR REPLACE FUNCTION zapp.fn_app_notifications_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $$
BEGIN
  INSERT INTO zapp.app_notifications (
    id, user_id, title, body, type, entity_type, entity_id,
    is_read, action_url, metadata, created_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    NEW.user_id, NEW.title, NEW.body, NEW.type,
    NEW.entity_type, NEW.entity_id,
    COALESCE(NEW.is_read, false),
    NEW.action_url, NEW.metadata,
    COALESCE(NEW.created_at, now())
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION zapp.fn_app_notifications_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $$
BEGIN
  UPDATE zapp.app_notifications SET
    title       = NEW.title,
    body        = NEW.body,
    type        = NEW.type,
    entity_type = NEW.entity_type,
    entity_id   = NEW.entity_id,
    is_read     = NEW.is_read,
    action_url  = NEW.action_url,
    metadata    = NEW.metadata
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION zapp.fn_app_notifications_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $$
BEGIN
  DELETE FROM zapp.app_notifications WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_notif_insert ON public.app_notifications;
DROP TRIGGER IF EXISTS trg_app_notif_update ON public.app_notifications;
DROP TRIGGER IF EXISTS trg_app_notif_delete ON public.app_notifications;

CREATE TRIGGER trg_app_notif_insert
  INSTEAD OF INSERT ON public.app_notifications
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_app_notifications_insert();

CREATE TRIGGER trg_app_notif_update
  INSTEAD OF UPDATE ON public.app_notifications
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_app_notifications_update();

CREATE TRIGGER trg_app_notif_delete
  INSTEAD OF DELETE ON public.app_notifications
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_app_notifications_delete();

-- Verify RT09: expect 3
-- SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
-- WHERE n.nspname='public' AND c.relname='app_notifications' AND (t.tgtype & 64)::boolean;
-- Verify RT19: expect 0
-- SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='evolution_instance_credentials' AND column_name IN ('api_key','instance_token');
