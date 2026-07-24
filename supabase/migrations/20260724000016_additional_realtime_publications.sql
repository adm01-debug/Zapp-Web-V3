-- Fix missing supabase_realtime publications.
-- The frontend subscribes to these tables with schema-qualified paths (zapp.*, financeiro.*, email_app.*)
-- but many were only ever added as public.* proxy VIEWs — which are silent no-ops in Realtime.
-- All tables here are physical tables in their respective schemas.
--
-- Idempotent: each table is checked before ALTER PUBLICATION to avoid errors on re-apply.
-- Errors are NOT swallowed: if a table cannot be added, the migration fails immediately
-- so the problem is visible rather than silently skipped.

DO $$
DECLARE
  tbl text;
  schema_name text;
  table_name text;
BEGIN
  -- zapp schema tables actively subscribed by frontend hooks
  FOR tbl IN SELECT unnest(ARRAY[
    'zapp.team_messages',           -- useTeamConversations.ts:130
    'zapp.talkx_campaigns',         -- TalkXView.tsx:92
    'zapp.sales_deals',             -- useBusinessLogicManagement.ts:452
    'zapp.automation_executions',   -- useAutomationLogs.ts, useAutomationSuggestions.ts
    'zapp.agent_stats',             -- useDashboardVisualizationManagement.ts:734
    'zapp.warroom_alerts',          -- useWarRoomAlerts.ts (2 subscriptions)
    'zapp.queues',                  -- useQueueManagement.ts and others
    'zapp.queue_members',           -- queue hooks
    'zapp.queue_positions',         -- queue hooks
    'zapp.qr_attempts',             -- QrAttemptsPanel.tsx:104
    'zapp.whatsapp_connections',    -- useConnectionManagement.ts (UPDATE subscription)
    'zapp.audio_memes',             -- audio meme subscriptions
    'financeiro.payment_links',     -- PaymentLinksView.tsx:61 (physical table is financeiro.payment_links; public.payment_links is a VIEW proxy)
    'email_app.email_accounts'      -- useGmailOAuthFlow.ts:292
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
      -- No EXCEPTION WHEN others: let errors propagate so the migration fails
      -- visibly rather than silently skipping a required table.
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', schema_name, table_name);
      RAISE NOTICE 'Added %.% to supabase_realtime', schema_name, table_name;
    ELSE
      RAISE NOTICE '%.% already in supabase_realtime, skipping', schema_name, table_name;
    END IF;
  END LOOP;
END $$;

-- ── Post-apply validation ─────────────────────────────────────────────────────
-- Verify every required table is now present in the publication.
-- Raises an exception (fails the migration) if any are missing.
DO $$
DECLARE
  missing_tables TEXT[] := ARRAY[]::TEXT[];
  tbl            TEXT;
  schema_name    TEXT;
  table_name     TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'zapp.team_messages',
    'zapp.talkx_campaigns',
    'zapp.sales_deals',
    'zapp.automation_executions',
    'zapp.agent_stats',
    'zapp.warroom_alerts',
    'zapp.queues',
    'zapp.queue_members',
    'zapp.queue_positions',
    'zapp.qr_attempts',
    'zapp.whatsapp_connections',
    'zapp.audio_memes',
    'financeiro.payment_links',
    'email_app.email_accounts'
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
      missing_tables := array_append(missing_tables, tbl);
    END IF;
  END LOOP;

  IF array_length(missing_tables, 1) > 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: % table(s) not in supabase_realtime publication: %',
      array_length(missing_tables, 1),
      array_to_string(missing_tables, ', ')
      USING ERRCODE = 'P0001';
  ELSE
    RAISE NOTICE 'POST-CHECK OK: all 14 required tables are in supabase_realtime';
  END IF;
END $$;
