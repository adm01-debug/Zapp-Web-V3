-- Migration: Fix warroom_alerts schema gaps + create v_alerts_active VIEW (BUG-52, BUG-53)
--
-- BUG-52: public.warroom_alerts is the physical table but ALL frontend code accesses it
--   via the main supabase client (db.schema:'zapp') or safeClient. PostgREST routes
--   to the zapp Accept-Profile header, so without a zapp view or the physical table in
--   zapp, every SELECT/INSERT/UPDATE returns PGRST205. Additionally, Realtime
--   subscriptions in useAlertManagement.ts and useWarRoomAlerts.ts use schema:'zapp',
--   so WAL events from public.warroom_alerts never arrive (silent no-op).
--   Fix: move physical table to zapp, create public VIEW proxy, update publication.
--
-- BUG-53: v_alerts_active VIEW does not exist in any migration but is queried by
--   safeClient.from('v_alerts_active') in useBridgeStatus.ts → PGRST205 on every
--   health check. Fix: create VIEW in zapp from zapp.warroom_alerts.
--
-- NOTE: Migrations 20260724000016 / 20260724000017 / 20260724000019 tried to add
--   'zapp.warroom_alerts' to supabase_realtime, but no such relation existed in zapp
--   at that time — those ALTER PUBLICATION statements silently no-op'd or errored.
--   This migration is the definitive fix.
--
-- All DDL is idempotent.

-- ── 1. Move public.warroom_alerts → zapp.warroom_alerts ──────────────────────
DO $$
BEGIN
  -- Only move if table is still in public and not already in zapp as a physical table
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'warroom_alerts' AND n.nspname = 'public' AND c.relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'warroom_alerts' AND n.nspname = 'zapp' AND c.relkind = 'r'
  ) THEN
    -- Drop any existing zapp VIEW that collides with the physical table name
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'warroom_alerts' AND n.nspname = 'zapp' AND c.relkind = 'v'
    ) THEN
      DROP VIEW zapp.warroom_alerts;
      RAISE NOTICE 'Dropped existing zapp.warroom_alerts VIEW before schema move';
    END IF;

    ALTER TABLE public.warroom_alerts SET SCHEMA zapp;
    RAISE NOTICE 'Moved public.warroom_alerts → zapp.warroom_alerts';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'warroom_alerts' AND n.nspname = 'zapp' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'zapp.warroom_alerts already a physical table — skipping move';
  ELSE
    RAISE NOTICE 'public.warroom_alerts not found as a physical table — skipping move';
  END IF;
END;
$$;

-- ── 2. Grant permissions on the physical table ────────────────────────────────
REVOKE ALL ON zapp.warroom_alerts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.warroom_alerts TO authenticated;
GRANT ALL ON zapp.warroom_alerts TO service_role;

-- ── 3. Create public.warroom_alerts VIEW proxy (backward compatibility) ───────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'warroom_alerts' AND n.nspname = 'public'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'warroom_alerts' AND n.nspname = 'zapp' AND c.relkind = 'r'
    ) THEN
      EXECUTE $ddl$
        CREATE VIEW public.warroom_alerts
          WITH (security_invoker = on)
        AS SELECT * FROM zapp.warroom_alerts
      $ddl$;
      RAISE NOTICE 'Created public.warroom_alerts VIEW → zapp.warroom_alerts';
    ELSE
      RAISE NOTICE 'zapp.warroom_alerts not found — skipping public VIEW creation';
    END IF;
  ELSE
    RAISE NOTICE 'public.warroom_alerts already exists — skipping VIEW creation';
  END IF;
END;
$$;

REVOKE ALL ON public.warroom_alerts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warroom_alerts TO authenticated;
GRANT ALL ON public.warroom_alerts TO service_role;

-- ── 4. Remove public.warroom_alerts from supabase_realtime (now a VIEW) ───────
-- PostgreSQL rejects publications containing VIEWs; if old publication entry
-- exists, drop it. Guard: only attempt if it's currently listed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'warroom_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.warroom_alerts;
    RAISE NOTICE 'Removed public.warroom_alerts from supabase_realtime';
  ELSE
    RAISE NOTICE 'public.warroom_alerts was not in supabase_realtime — skipping DROP';
  END IF;
END;
$$;

-- ── 5. Add zapp.warroom_alerts to supabase_realtime ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename  = 'warroom_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.warroom_alerts;
    RAISE NOTICE 'Added zapp.warroom_alerts to supabase_realtime';
  ELSE
    RAISE NOTICE 'zapp.warroom_alerts already in supabase_realtime — skipping';
  END IF;
END;
$$;

-- ── 6. Create zapp.v_alerts_active VIEW (BUG-53) ─────────────────────────────
-- Used by:
--   useBridgeStatus.ts:130 → safeClient.from<ActiveAlert>('v_alerts_active', ...)
--     ActiveAlert interface: { id: string; title: string; alert_type: string }
-- Definition: unread (is_read = false) AND not dismissed (dismissed_by IS NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'v_alerts_active' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.v_alerts_active already exists — skipping';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'warroom_alerts' AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.warroom_alerts not found — skipping v_alerts_active creation';
  ELSE
    EXECUTE $ddl$
      CREATE VIEW zapp.v_alerts_active
        WITH (security_invoker = on)
      AS
        SELECT
          id,
          alert_type,
          title,
          message,
          source,
          is_read,
          dismissed_by,
          created_at
        FROM zapp.warroom_alerts
        WHERE is_read = false
          AND dismissed_by IS NULL
        ORDER BY created_at DESC
    $ddl$;
    RAISE NOTICE 'Created zapp.v_alerts_active VIEW';
  END IF;
END;
$$;

REVOKE ALL ON zapp.v_alerts_active FROM PUBLIC, anon;
GRANT SELECT ON zapp.v_alerts_active TO authenticated;
GRANT ALL    ON zapp.v_alerts_active TO service_role;
