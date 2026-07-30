-- Migration: Move batch-4 tables from public to zapp schema to fix silent no-op Realtime subscriptions
--
-- Problem: Frontend code subscribes with {schema:'zapp', table:'calls'} and
-- {schema:'zapp', table:'talkx_recipients'}, but both tables are physical tables in
-- the `public` schema. In `zapp`, these names resolve to VIEW proxies (relkind='v'),
-- which are never included in the supabase_realtime publication and emit no WAL events.
-- Result: all Realtime subscriptions for these tables are silent no-ops.
-- Additionally, both tables were explicitly removed from supabase_realtime in migrations
-- 20260410111418 (calls) and 20260410004051 (talkx_recipients) because publishing
-- public-schema tables was insecure. Moving to zapp with proper RLS makes re-publication safe.
--
-- Tables moved:
--   public.calls            → zapp.calls
--   public.talkx_recipients → zapp.talkx_recipients

-- ────────────────────────────────────────────────────────────────────
-- 1. Move public.calls → zapp.calls
-- ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'calls' AND c.relkind IN ('r','p')
  ) THEN
    -- Drop VIEW proxy in zapp that references public.calls (if any)
    EXECUTE 'DROP VIEW IF EXISTS zapp.calls CASCADE';

    -- Move physical table to zapp schema
    EXECUTE 'ALTER TABLE public.calls SET SCHEMA zapp';

    -- Drop old RLS policies (they reference public.profiles)
    EXECUTE 'DROP POLICY IF EXISTS "Users can view calls" ON zapp.calls';
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert calls" ON zapp.calls';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update their calls" ON zapp.calls';

    -- Recreate RLS policies using zapp schema functions
    EXECUTE $$
      CREATE POLICY "Users can view calls"
      ON zapp.calls FOR SELECT TO authenticated
      USING (true)
    $$;

    EXECUTE $$
      CREATE POLICY "Users can insert calls"
      ON zapp.calls FOR INSERT TO authenticated
      WITH CHECK (true)
    $$;

    EXECUTE $$
      CREATE POLICY "Users can update their calls"
      ON zapp.calls FOR UPDATE TO authenticated
      USING (agent_id IN (
        SELECT id FROM zapp.profiles WHERE user_id = auth.uid()
      ))
    $$;

    -- Re-enable RLS (carried over by SET SCHEMA but explicit for clarity)
    EXECUTE 'ALTER TABLE zapp.calls ENABLE ROW LEVEL SECURITY';

    -- Grant permissions
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON zapp.calls TO authenticated';
    EXECUTE 'REVOKE ALL ON zapp.calls FROM anon';

    -- Add to Realtime publication
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE zapp.calls';

    RAISE NOTICE 'public.calls → zapp.calls: moved and added to supabase_realtime';
  ELSE
    RAISE NOTICE 'public.calls not found as physical table; skipping (may already be in zapp)';

    -- Idempotent: ensure it is in the publication if it is now in zapp
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'zapp' AND c.relname = 'calls' AND c.relkind IN ('r','p')
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'calls'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE zapp.calls';
      RAISE NOTICE 'zapp.calls added to supabase_realtime (idempotent)';
    END IF;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 2. Move public.talkx_recipients → zapp.talkx_recipients
-- ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'talkx_recipients' AND c.relkind IN ('r','p')
  ) THEN
    -- Drop VIEW proxy in zapp that references public.talkx_recipients (if any)
    EXECUTE 'DROP VIEW IF EXISTS zapp.talkx_recipients CASCADE';

    -- Move physical table to zapp schema
    EXECUTE 'ALTER TABLE public.talkx_recipients SET SCHEMA zapp';

    -- Drop old RLS policies (they reference public.is_admin_or_supervisor and public.profiles)
    EXECUTE 'DROP POLICY IF EXISTS "Users can view recipients of own campaigns" ON zapp.talkx_recipients';
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert recipients to own campaigns" ON zapp.talkx_recipients';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update recipients of own campaigns" ON zapp.talkx_recipients';
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete recipients of own campaigns" ON zapp.talkx_recipients';

    -- Recreate RLS policies using zapp schema functions
    EXECUTE $$
      CREATE POLICY "Users can view recipients of own campaigns"
      ON zapp.talkx_recipients FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM zapp.talkx_campaigns tc
        WHERE tc.id = campaign_id
        AND (
          tc.created_by = (SELECT id FROM zapp.profiles WHERE user_id = auth.uid() LIMIT 1)
          OR zapp.is_admin_or_supervisor(auth.uid())
        )
      ))
    $$;

    EXECUTE $$
      CREATE POLICY "Users can insert recipients to own campaigns"
      ON zapp.talkx_recipients FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM zapp.talkx_campaigns tc
        WHERE tc.id = campaign_id
        AND tc.created_by = (SELECT id FROM zapp.profiles WHERE user_id = auth.uid() LIMIT 1)
      ))
    $$;

    EXECUTE $$
      CREATE POLICY "Users can update recipients of own campaigns"
      ON zapp.talkx_recipients FOR UPDATE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM zapp.talkx_campaigns tc
        WHERE tc.id = campaign_id
        AND tc.created_by = (SELECT id FROM zapp.profiles WHERE user_id = auth.uid() LIMIT 1)
      ))
    $$;

    EXECUTE $$
      CREATE POLICY "Users can delete recipients of own campaigns"
      ON zapp.talkx_recipients FOR DELETE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM zapp.talkx_campaigns tc
        WHERE tc.id = campaign_id
        AND tc.created_by = (SELECT id FROM zapp.profiles WHERE user_id = auth.uid() LIMIT 1)
        AND tc.status = 'draft'
      ))
    $$;

    -- Re-enable RLS
    EXECUTE 'ALTER TABLE zapp.talkx_recipients ENABLE ROW LEVEL SECURITY';

    -- Grant permissions
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.talkx_recipients TO authenticated';
    EXECUTE 'REVOKE ALL ON zapp.talkx_recipients FROM anon';

    -- Add to Realtime publication
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE zapp.talkx_recipients';

    RAISE NOTICE 'public.talkx_recipients → zapp.talkx_recipients: moved and added to supabase_realtime';
  ELSE
    RAISE NOTICE 'public.talkx_recipients not found as physical table; skipping (may already be in zapp)';

    -- Idempotent: ensure it is in the publication if it is now in zapp
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'zapp' AND c.relname = 'talkx_recipients' AND c.relkind IN ('r','p')
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'talkx_recipients'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE zapp.talkx_recipients';
      RAISE NOTICE 'zapp.talkx_recipients added to supabase_realtime (idempotent)';
    END IF;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 3. Fix fn_monitor_instance_health to also write to zapp.app_notifications
--    (canonical physical table in supabase_realtime publication) so that
--    useConnectionManagement.ts subscription on {schema:'zapp',
--    table:'app_notifications', filter:'type=eq.connection_alert'} fires.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_monitor_instance_health()
RETURNS TRIGGER AS $$
DECLARE
  is_down BOOLEAN;
  was_down BOOLEAN;
  alert_reason TEXT;
  admin_user_id UUID;
  notification_title TEXT;
  notification_body TEXT;
BEGIN
  is_down  := (NEW.status = 'disconnected' OR NEW.health_reason IN ('phantom_session', 'socket_closed'));
  was_down := (OLD.status = 'disconnected' OR OLD.health_reason IN ('phantom_session', 'socket_closed'));

  SELECT id INTO admin_user_id
  FROM zapp.profiles
  WHERE user_id IN (SELECT id FROM auth.users)
  LIMIT 1;

  -- Case 1: instance went DOWN (UP → DOWN transition)
  IF is_down AND NOT was_down THEN
    alert_reason := COALESCE(NEW.health_reason, 'Desconectado');

    IF admin_user_id IS NOT NULL THEN
      notification_title := '🚨 Alerta: Instância ' || NEW.name || ' caiu!';
      notification_body  := 'A instância WhatsApp ' || NEW.name || ' está em estado crítico: ' || alert_reason;

      -- Legacy write (kept for backward compat)
      INSERT INTO public.notifications (user_id, title, message, type, metadata)
      VALUES (admin_user_id, notification_title, notification_body, 'alert',
              jsonb_build_object('connection_id', NEW.id, 'status', 'down'));

      -- Canonical write to app_notifications (physical, in supabase_realtime)
      INSERT INTO zapp.app_notifications (user_id, title, message, type, metadata)
      VALUES (admin_user_id, notification_title, notification_body, 'connection_alert',
              jsonb_build_object('connection_id', NEW.id, 'reason', 'disconnected'));
    END IF;
  END IF;

  -- Case 2: instance came back UP (DOWN → UP transition)
  IF NOT is_down AND was_down THEN
    IF admin_user_id IS NOT NULL THEN
      notification_title := '✅ Instância ' || NEW.name || ' normalizada';
      notification_body  := 'A instância ' || NEW.name || ' voltou a ficar online e está operando normalmente.';

      INSERT INTO public.notifications (user_id, title, message, type, metadata)
      VALUES (admin_user_id, notification_title, notification_body, 'info',
              jsonb_build_object('connection_id', NEW.id, 'status', 'up'));

      INSERT INTO zapp.app_notifications (user_id, title, message, type, metadata)
      VALUES (admin_user_id, notification_title, notification_body, 'connection_alert',
              jsonb_build_object('connection_id', NEW.id, 'reason', 'reconnected'));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, public, auth;
