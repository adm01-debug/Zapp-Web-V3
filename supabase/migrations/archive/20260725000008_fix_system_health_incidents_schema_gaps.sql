-- Migration: Fix system_health_incidents schema gaps (BUG-46)
--
-- Problem 1: `safeClient.from('system_health_incidents')` routes via zapp schema
--   (Accept-Profile: zapp) but the table is physical in public — no VIEW proxy in zapp
--   → PostgREST returns PGRST205.
--
-- Problem 2: Realtime subscription in useBridgeStatus.ts used schema:'zapp' but
--   the physical table (and its WAL events) are in public → silent no-op.
--   Fix: TypeScript changed to schema:'public'; migration ensures public table is
--   in the publication.
--
-- Problem 3: Migration 20260711_fk_backing_indexes_wave2.sql:12 tried to create
--   idx_sys_health_incidents_created_by on a column that does not exist yet.
--   That statement (and potentially the whole migration file) failed.
--   Fix: Add the missing column and re-run all 12 indexes from that migration (idempotent).
--
-- All DDL is idempotent.

-- ── 1. Add missing created_by column ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'system_health_incidents'
      AND a.attname = 'created_by' AND a.attnum > 0 AND NOT a.attisdropped
  ) THEN
    ALTER TABLE public.system_health_incidents
      ADD COLUMN created_by UUID REFERENCES auth.users(id);
    RAISE NOTICE 'Added created_by column to public.system_health_incidents';
  ELSE
    RAISE NOTICE 'created_by column already exists — skipping';
  END IF;
END;
$$;

-- ── 2. Create zapp VIEW proxy ─────────────────────────────────────────────────
-- Allows safeClient.from('system_health_incidents') to resolve via zapp schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'system_health_incidents' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.system_health_incidents already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'system_health_incidents' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE 'source public.system_health_incidents not found — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.system_health_incidents
        WITH (security_invoker = on)
      AS SELECT * FROM public.system_health_incidents
    $ddl$;
    RAISE NOTICE 'created zapp.system_health_incidents → public.system_health_incidents';
  END IF;
END;
$$;

REVOKE ALL ON zapp.system_health_incidents FROM PUBLIC, anon;
GRANT SELECT ON zapp.system_health_incidents TO authenticated;
GRANT ALL    ON zapp.system_health_incidents TO service_role;

-- ── 3. Ensure public.system_health_incidents is in supabase_realtime ──────────
-- The Realtime subscription (now using schema:'public') needs the physical table
-- in the publication to receive WAL events. Migrations 20/24 already added it
-- but we guard idempotently.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'system_health_incidents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_health_incidents;
    RAISE NOTICE 'Added public.system_health_incidents to supabase_realtime';
  ELSE
    RAISE NOTICE 'public.system_health_incidents already in supabase_realtime — skipping';
  END IF;
END;
$$;

-- ── 4. Re-run all 12 indexes from 20260711_fk_backing_indexes_wave2.sql ───────
-- That migration may have failed entirely when line 12 hit the missing created_by
-- column. All statements are idempotent (IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS idx_warroom_alerts_dismissed_by   ON public.warroom_alerts(dismissed_by);
CREATE INDEX IF NOT EXISTS idx_queues_department_id          ON zapp.queues(department_id);
CREATE INDEX IF NOT EXISTS idx_system_connections_created_by ON public.system_connections(created_by);
CREATE INDEX IF NOT EXISTS idx_dept_invitations_created_by   ON public.department_invitations(created_by);
CREATE INDEX IF NOT EXISTS idx_dept_invitations_invited_by   ON public.department_invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_sys_health_incidents_created_by ON public.system_health_incidents(created_by);
CREATE INDEX IF NOT EXISTS idx_qr_attempts_connection_id     ON zapp.qr_attempts(connection_id);
CREATE INDEX IF NOT EXISTS idx_transfer_comments_agent_id    ON zapp.transfer_comments(agent_id);
CREATE INDEX IF NOT EXISTS idx_automations_channel_id        ON zapp.automations(channel_id);
CREATE INDEX IF NOT EXISTS idx_automations_department_id     ON zapp.automations(department_id);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_requests_reviewed_by ON public.password_reset_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_user_sessions_device_id       ON public.user_sessions(device_id);
