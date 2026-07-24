-- Fix: Add all zapp.* and email_app.* physical tables subscribed via Realtime
-- that are missing from supabase_realtime publication.
--
-- Context: When the project migrated from Lovable Cloud → self-hosted Supabase,
-- the physical tables moved from `public.*` to `zapp.*`/`email_app.*`.
-- Early migrations added `public.*` to the publication (those are now VIEW proxies
-- and never emit CDC). This migration adds the actual physical tables.
--
-- All additions are guarded: skipped if already in publication OR if the table
-- does not yet exist (forward-reference protection).

DO $$
DECLARE
  t          TEXT[];
  v_schema   TEXT;
  v_table    TEXT;
  targets    TEXT[][] := ARRAY[
    -- Core DLQ / messaging
    ARRAY['zapp', 'failed_messages'],
    -- Notifications (useNotificationManagement, useDashboard, etc.)
    ARRAY['zapp', 'app_notifications'],
    -- Agent stats panel
    ARRAY['zapp', 'agent_stats'],
    -- Audio management
    ARRAY['zapp', 'audio_memes'],
    -- QR code authentication flow
    ARRAY['zapp', 'qr_attempts'],
    -- Queue management
    ARRAY['zapp', 'queue_members'],
    ARRAY['zapp', 'queue_positions'],
    ARRAY['zapp', 'queues'],
    -- CRM / Sales
    ARRAY['zapp', 'sales_deals'],
    -- TalkX campaign broadcaster
    ARRAY['zapp', 'talkx_campaigns'],
    -- Team chat (team_conversations/team_conversation_members already added in 20260702213000)
    ARRAY['zapp', 'team_messages'],
    -- War room alerts
    ARRAY['zapp', 'warroom_alerts'],
    -- WhatsApp connection health indicator in UI
    ARRAY['zapp', 'whatsapp_connections'],
    -- Gmail integration: thread-level real-time updates
    ARRAY['email_app', 'email_threads']
  ];
BEGIN
  FOREACH t SLICE 1 IN ARRAY targets
  LOOP
    v_schema := t[1];
    v_table  := t[2];

    -- Skip if already in publication
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname    = 'supabase_realtime'
        AND schemaname = v_schema
        AND tablename  = v_table
    ) THEN
      RAISE NOTICE 'SKIP %.% — already in supabase_realtime', v_schema, v_table;
      CONTINUE;
    END IF;

    -- Skip if the physical table does not exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname  = v_schema
        AND c.relname  = v_table
        AND c.relkind IN ('r', 'p')  -- ordinary or partitioned table
    ) THEN
      RAISE NOTICE 'SKIP %.% — table does not exist (yet)', v_schema, v_table;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I',
      v_schema, v_table
    );
    RAISE NOTICE 'ADDED %.% to supabase_realtime', v_schema, v_table;
  END LOOP;
END $$;

-- Verification: any table that EXISTS physically but is still missing from the
-- publication after the loop above indicates an unexpected failure.
DO $$
DECLARE
  missing  TEXT[] := ARRAY[]::TEXT[];
  t        TEXT[];
  targets  TEXT[][] := ARRAY[
    ARRAY['zapp', 'failed_messages'],
    ARRAY['zapp', 'app_notifications'],
    ARRAY['zapp', 'agent_stats'],
    ARRAY['zapp', 'audio_memes'],
    ARRAY['zapp', 'qr_attempts'],
    ARRAY['zapp', 'queue_members'],
    ARRAY['zapp', 'queue_positions'],
    ARRAY['zapp', 'queues'],
    ARRAY['zapp', 'sales_deals'],
    ARRAY['zapp', 'talkx_campaigns'],
    ARRAY['zapp', 'team_messages'],
    ARRAY['zapp', 'warroom_alerts'],
    ARRAY['zapp', 'whatsapp_connections'],
    ARRAY['email_app', 'email_threads']
  ];
BEGIN
  FOREACH t SLICE 1 IN ARRAY targets
  LOOP
    -- Only flag as missing if the table exists but is not published
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = t[1] AND c.relname = t[2] AND c.relkind IN ('r', 'p')
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname    = 'supabase_realtime'
        AND schemaname = t[1]
        AND tablename  = t[2]
    ) THEN
      missing := missing || (t[1] || '.' || t[2]);
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: tables exist but not in supabase_realtime: %',
      array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'OK: all existing target tables are now in supabase_realtime publication';
END $$;

-- Set REPLICA IDENTITY FULL on zapp.whatsapp_connections so that UPDATE events
-- expose old.status in payload.old — required by useEvolutionAutoReconnect.ts
-- (checks oldConnection.status === 'connected') and useConnectionsRealtime.ts.
-- PostgreSQL default replica identity only includes primary key columns in old;
-- without FULL, status is absent and reconnect / announcement logic misfires.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whatsapp_connections' AND n.nspname = 'zapp'
      AND c.relkind = 'r'
      AND c.relreplident = 'f'  -- 'f' = FULL already set
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'whatsapp_connections' AND n.nspname = 'zapp'
        AND c.relkind = 'r'
    ) THEN
      ALTER TABLE zapp.whatsapp_connections REPLICA IDENTITY FULL;
      RAISE NOTICE 'SET REPLICA IDENTITY FULL on zapp.whatsapp_connections';
    END IF;
  ELSE
    RAISE NOTICE 'SKIP zapp.whatsapp_connections — REPLICA IDENTITY FULL already set';
  END IF;
END $$;
