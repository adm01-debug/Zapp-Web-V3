-- Migration: move 6 remaining public tables that have zapp-schema realtime subscriptions
--
-- Context:
--   Frontend subscription code uses { schema: 'zapp', table: 'X' } for all of these,
--   but the physical tables were still in public schema.
--   Migration 20260724000039 correctly SKIPPED them (relkind='v' — VIEW proxies in zapp,
--   not physical tables), so they were never added to supabase_realtime.
--   Result: all 6 subscriptions were silent no-ops.
--
--   Subscriptions fixed:
--     • connection_health_logs  — ConnectionHealthPanel.tsx:96
--     • rate_limit_logs         — useRateLimitLogs.ts:175
--     • security_audit_logs     — useSecurityAuditLogs.ts:59
--     • evolution_retry_metrics — useRetryMetrics.ts:122
--     • audio_meme_favorites    — useAudioManagement.ts:102
--     • automation_executions   — useAutomationLogs.ts:86, useAutomationSuggestions.ts:79
--
--   Pattern per table (idempotent):
--     1. Move public.X to zapp schema if not already there
--     2. Enable RLS (idempotent)
--     3. Drop stale policies (that used public.* functions)
--     4. Recreate using zapp.* functions
--     5. Grant permissions
--     6. Add to supabase_realtime publication
--
--   Helper functions also updated to reference zapp schema tables:
--     • public.log_security_event()  → writes to zapp.security_audit_logs
--     • public.cleanup_old_evolution_retry_metrics() → reads zapp.evolution_retry_metrics

-- ---------------------------------------------------------------------------
-- 1. zapp.connection_health_logs
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'connection_health_logs' AND c.relkind IN ('r','p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'   AND c.relname = 'connection_health_logs' AND c.relkind IN ('r','p')
  ) THEN
    EXECUTE 'ALTER TABLE public.connection_health_logs SET SCHEMA zapp';
    RAISE NOTICE 'MOVED connection_health_logs to zapp';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'connection_health_logs' AND c.relkind IN ('r','p')
  ) THEN
    RAISE NOTICE 'connection_health_logs already in zapp — skipping move';
  ELSE
    RAISE NOTICE 'connection_health_logs not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'connection_health_logs' AND c.relkind IN ('r','p')
  ) THEN RETURN; END IF;

  ALTER TABLE zapp.connection_health_logs ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Admins can view health logs"      ON zapp.connection_health_logs;
  DROP POLICY IF EXISTS "Service can insert health logs"   ON zapp.connection_health_logs;

  CREATE POLICY "Admins can view health logs"
    ON zapp.connection_health_logs FOR SELECT TO authenticated
    USING (zapp.is_admin_or_supervisor(auth.uid()));

  CREATE POLICY "Service can insert health logs"
    ON zapp.connection_health_logs FOR INSERT TO authenticated
    WITH CHECK (true);

  GRANT SELECT, INSERT ON zapp.connection_health_logs TO authenticated;
  GRANT ALL ON zapp.connection_health_logs TO service_role;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'connection_health_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.connection_health_logs;
    RAISE NOTICE 'ADDED zapp.connection_health_logs to supabase_realtime';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. zapp.rate_limit_logs
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'rate_limit_logs' AND c.relkind IN ('r','p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'   AND c.relname = 'rate_limit_logs' AND c.relkind IN ('r','p')
  ) THEN
    EXECUTE 'ALTER TABLE public.rate_limit_logs SET SCHEMA zapp';
    RAISE NOTICE 'MOVED rate_limit_logs to zapp';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'rate_limit_logs' AND c.relkind IN ('r','p')
  ) THEN
    RAISE NOTICE 'rate_limit_logs already in zapp — skipping move';
  ELSE
    RAISE NOTICE 'rate_limit_logs not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'rate_limit_logs' AND c.relkind IN ('r','p')
  ) THEN RETURN; END IF;

  ALTER TABLE zapp.rate_limit_logs ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Admins can view rate limit logs"  ON zapp.rate_limit_logs;
  DROP POLICY IF EXISTS "System can insert rate limit logs" ON zapp.rate_limit_logs;

  CREATE POLICY "Admins can view rate limit logs"
    ON zapp.rate_limit_logs FOR SELECT TO authenticated
    USING (zapp.is_admin_or_supervisor(auth.uid()));

  CREATE POLICY "System can insert rate limit logs"
    ON zapp.rate_limit_logs FOR INSERT TO authenticated
    WITH CHECK (true);

  GRANT SELECT, INSERT ON zapp.rate_limit_logs TO authenticated;
  GRANT ALL ON zapp.rate_limit_logs TO service_role;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'rate_limit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.rate_limit_logs;
    RAISE NOTICE 'ADDED zapp.rate_limit_logs to supabase_realtime';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. zapp.security_audit_logs
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'security_audit_logs' AND c.relkind IN ('r','p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'   AND c.relname = 'security_audit_logs' AND c.relkind IN ('r','p')
  ) THEN
    EXECUTE 'ALTER TABLE public.security_audit_logs SET SCHEMA zapp';
    RAISE NOTICE 'MOVED security_audit_logs to zapp';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'security_audit_logs' AND c.relkind IN ('r','p')
  ) THEN
    RAISE NOTICE 'security_audit_logs already in zapp — skipping move';
  ELSE
    RAISE NOTICE 'security_audit_logs not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'security_audit_logs' AND c.relkind IN ('r','p')
  ) THEN RETURN; END IF;

  ALTER TABLE zapp.security_audit_logs ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Users can view their own security logs" ON zapp.security_audit_logs;
  DROP POLICY IF EXISTS "Admins can view all security logs"      ON zapp.security_audit_logs;
  DROP POLICY IF EXISTS "System can insert security logs"        ON zapp.security_audit_logs;

  -- Users see their own; admins/supervisors see all
  CREATE POLICY "Users can view their own security logs"
    ON zapp.security_audit_logs FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR zapp.is_admin_or_supervisor(auth.uid()));

  CREATE POLICY "System can insert security logs"
    ON zapp.security_audit_logs FOR INSERT TO authenticated
    WITH CHECK (true);

  GRANT SELECT, INSERT ON zapp.security_audit_logs TO authenticated;
  GRANT ALL ON zapp.security_audit_logs TO service_role;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'security_audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.security_audit_logs;
    RAISE NOTICE 'ADDED zapp.security_audit_logs to supabase_realtime';
  END IF;
END;
$$;

-- Update public.log_security_event() to write to zapp.security_audit_logs
CREATE OR REPLACE FUNCTION public.log_security_event(
    p_event_type TEXT,
    p_resource   TEXT,
    p_action     TEXT,
    p_status     TEXT,
    p_details    JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public, auth
AS $$
BEGIN
    INSERT INTO zapp.security_audit_logs (
        user_id, event_type, resource, action, status, details
    ) VALUES (
        auth.uid(), p_event_type, p_resource, p_action, p_status, p_details
    );
EXCEPTION WHEN undefined_table THEN
    -- table not yet in zapp (shouldn't happen after this migration)
    NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. zapp.evolution_retry_metrics
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'evolution_retry_metrics' AND c.relkind IN ('r','p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'   AND c.relname = 'evolution_retry_metrics' AND c.relkind IN ('r','p')
  ) THEN
    EXECUTE 'ALTER TABLE public.evolution_retry_metrics SET SCHEMA zapp';
    RAISE NOTICE 'MOVED evolution_retry_metrics to zapp';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'evolution_retry_metrics' AND c.relkind IN ('r','p')
  ) THEN
    RAISE NOTICE 'evolution_retry_metrics already in zapp — skipping move';
  ELSE
    RAISE NOTICE 'evolution_retry_metrics not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'evolution_retry_metrics' AND c.relkind IN ('r','p')
  ) THEN RETURN; END IF;

  ALTER TABLE zapp.evolution_retry_metrics ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Admins and supervisors can view retry metrics" ON zapp.evolution_retry_metrics;

  CREATE POLICY "Admins and supervisors can view retry metrics"
    ON zapp.evolution_retry_metrics FOR SELECT TO authenticated
    USING (zapp.is_admin_or_supervisor(auth.uid()));

  -- INSERT restricted to service_role (no authenticated INSERT policy)
  REVOKE INSERT ON zapp.evolution_retry_metrics FROM authenticated;
  GRANT SELECT ON zapp.evolution_retry_metrics TO authenticated;
  GRANT ALL ON zapp.evolution_retry_metrics TO service_role;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'evolution_retry_metrics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.evolution_retry_metrics;
    RAISE NOTICE 'ADDED zapp.evolution_retry_metrics to supabase_realtime';
  END IF;
END;
$$;

-- Update cleanup function to reference zapp schema
CREATE OR REPLACE FUNCTION public.cleanup_old_evolution_retry_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $$
BEGIN
    DELETE FROM zapp.evolution_retry_metrics
    WHERE created_at < now() - INTERVAL '30 days';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. zapp.audio_meme_favorites
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'audio_meme_favorites' AND c.relkind IN ('r','p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'   AND c.relname = 'audio_meme_favorites' AND c.relkind IN ('r','p')
  ) THEN
    EXECUTE 'ALTER TABLE public.audio_meme_favorites SET SCHEMA zapp';
    RAISE NOTICE 'MOVED audio_meme_favorites to zapp';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'audio_meme_favorites' AND c.relkind IN ('r','p')
  ) THEN
    RAISE NOTICE 'audio_meme_favorites already in zapp — skipping move';
  ELSE
    RAISE NOTICE 'audio_meme_favorites not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'audio_meme_favorites' AND c.relkind IN ('r','p')
  ) THEN RETURN; END IF;

  ALTER TABLE zapp.audio_meme_favorites ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "users manage own meme favorites" ON zapp.audio_meme_favorites;

  CREATE POLICY "users manage own meme favorites"
    ON zapp.audio_meme_favorites FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

  GRANT SELECT, INSERT, DELETE ON zapp.audio_meme_favorites TO authenticated;
  GRANT ALL ON zapp.audio_meme_favorites TO service_role;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'audio_meme_favorites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.audio_meme_favorites;
    RAISE NOTICE 'ADDED zapp.audio_meme_favorites to supabase_realtime';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. zapp.automation_executions
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'automation_executions' AND c.relkind IN ('r','p')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'   AND c.relname = 'automation_executions' AND c.relkind IN ('r','p')
  ) THEN
    EXECUTE 'ALTER TABLE public.automation_executions SET SCHEMA zapp';
    RAISE NOTICE 'MOVED automation_executions to zapp';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'automation_executions' AND c.relkind IN ('r','p')
  ) THEN
    RAISE NOTICE 'automation_executions already in zapp — skipping move';
  ELSE
    RAISE NOTICE 'automation_executions not found in public or zapp — nothing to move';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'automation_executions' AND c.relkind IN ('r','p')
  ) THEN RETURN; END IF;

  ALTER TABLE zapp.automation_executions ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "executions_view_scoped"          ON zapp.automation_executions;
  DROP POLICY IF EXISTS "executions_insert_authenticated"  ON zapp.automation_executions;
  DROP POLICY IF EXISTS "executions_update_scoped"        ON zapp.automation_executions;
  DROP POLICY IF EXISTS "executions_admin_delete"         ON zapp.automation_executions;

  CREATE POLICY "executions_view_scoped"
    ON zapp.automation_executions FOR SELECT TO authenticated
    USING (
      zapp.has_role(auth.uid(), 'admin')
      OR zapp.has_role(auth.uid(), 'dev')
      OR zapp.has_role(auth.uid(), 'supervisor')
      OR zapp.has_role(auth.uid(), 'manager')
      OR assigned_to = auth.uid()
    );

  CREATE POLICY "executions_insert_authenticated"
    ON zapp.automation_executions FOR INSERT TO authenticated
    WITH CHECK (true);

  CREATE POLICY "executions_update_scoped"
    ON zapp.automation_executions FOR UPDATE TO authenticated
    USING (
      zapp.has_role(auth.uid(), 'admin')
      OR zapp.has_role(auth.uid(), 'dev')
      OR zapp.has_role(auth.uid(), 'supervisor')
      OR assigned_to = auth.uid()
    );

  CREATE POLICY "executions_admin_delete"
    ON zapp.automation_executions FOR DELETE TO authenticated
    USING (
      zapp.has_role(auth.uid(), 'admin')
      OR zapp.has_role(auth.uid(), 'dev')
    );

  GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.automation_executions TO authenticated;
  GRANT ALL ON zapp.automation_executions TO service_role;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'automation_executions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.automation_executions;
    RAISE NOTICE 'ADDED zapp.automation_executions to supabase_realtime';
  END IF;
END;
$$;
