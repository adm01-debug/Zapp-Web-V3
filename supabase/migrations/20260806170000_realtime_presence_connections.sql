-- ═══════════════════════════════════════════════════════════════════════
-- SECTION: 20260806170000_realtime_presence_connections.sql
-- ═══════════════════════════════════════════════════════════════════════

-- Publishes zapp.agent_presence and zapp.whatsapp_connections on
-- supabase_realtime so the frontend can replace 60s polling with
-- postgres_changes subscriptions (useAgents.ts, DegradedConnectionsBanner.tsx,
-- useRealtimePresenceAndConnections.ts).
--
-- Context: the LIVE database already has both tables in the publication
-- (verified via pg_publication_tables on 2026-08-06), but NO migration in
-- this repo records it — fresh environments built from migrations would
-- ship WITHOUT them and the frontend subscriptions would silently never
-- fire. This migration closes the drift idempotently:
--   * already published → skip (no-op on the live DB);
--   * missing           → add (fresh envs).
--
-- REPLICA IDENTITY: live DB had agent_presence on 'd' (default) and
-- whatsapp_connections on 'f' (full). Frontend DELETE handlers rely on
-- payload.old carrying user_id (useAgents.ts removes presence by user_id);
-- with default identity a table without a reliable PK emits empty old
-- rows. Set FULL on both (guarded) for parity with live state and
-- dependable DELETE/UPDATE payloads.

DO $$
DECLARE
  tbl         text;
  schema_name text;
  table_name  text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'zapp.agent_presence',        -- useAgents.ts (status/active_conversations overlay)
    'zapp.whatsapp_connections'   -- DegradedConnectionsBanner.tsx, useConnectionsRealtime.ts
  ])
  LOOP
    schema_name := split_part(tbl, '.', 1);
    table_name  := split_part(tbl, '.', 2);

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname    = 'supabase_realtime'
        AND schemaname = schema_name
        AND tablename  = table_name
    ) THEN
      -- No EXCEPTION WHEN others: let errors propagate so the migration
      -- fails visibly rather than silently skipping a required table.
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', schema_name, table_name);
      RAISE NOTICE 'Added %.% to supabase_realtime', schema_name, table_name;
    ELSE
      RAISE NOTICE '%.% already in supabase_realtime, skipping', schema_name, table_name;
    END IF;
  END LOOP;
END $$;

-- ── REPLICA IDENTITY FULL (guarded) ──────────────────────────────────────────
DO $$
DECLARE
  tbl         text;
  schema_name text;
  table_name  text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['zapp.agent_presence', 'zapp.whatsapp_connections'])
  LOOP
    schema_name := split_part(tbl, '.', 1);
    table_name  := split_part(tbl, '.', 2);

    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = table_name
        AND n.nspname = schema_name
        AND c.relreplident <> 'f'
    ) THEN
      EXECUTE format('ALTER TABLE %I.%I REPLICA IDENTITY FULL', schema_name, table_name);
      RAISE NOTICE 'Set REPLICA IDENTITY FULL on %.%', schema_name, table_name;
    ELSE
      RAISE NOTICE '%.% already REPLICA IDENTITY FULL or missing, skipping', schema_name, table_name;
    END IF;
  END LOOP;
END $$;

-- ── Post-apply validation ─────────────────────────────────────────────────────
DO $$
DECLARE
  missing_tables TEXT[] := ARRAY[]::TEXT[];
  tbl            TEXT;
  schema_name    TEXT;
  table_name     TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['zapp.agent_presence', 'zapp.whatsapp_connections'])
  LOOP
    schema_name := split_part(tbl, '.', 1);
    table_name  := split_part(tbl, '.', 2);

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname    = 'supabase_realtime'
        AND schemaname = schema_name
        AND tablename  = table_name
    ) THEN
      missing_tables := array_append(missing_tables, tbl);
    END IF;
  END LOOP;

  IF array_length(missing_tables, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: tables not in supabase_realtime: %',
      array_to_string(missing_tables, ', ');
  END IF;
  RAISE NOTICE 'OK: zapp.agent_presence and zapp.whatsapp_connections verified in supabase_realtime';
END $$;
