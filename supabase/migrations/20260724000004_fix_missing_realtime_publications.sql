-- Fix missing supabase_realtime publications.
--
-- Context: Physical tables that need to be in supabase_realtime.
-- team_messages: moved to zapp by migration 000005 (was public); included here via 000005.
-- team_conversations + team_conversation_members: physical tables in zapp (public.* are VIEWs).
-- Other tables: physical in public or email_app schemas.
--
-- Idempotent: each entry guarded by pg_publication_tables check.
-- Per-iteration EXCEPTION block: a single failure does not abort the rest.
-- VIEWs are NOT included here — ALTER PUBLICATION ADD TABLE <view> fails in PostgreSQL.

DO $$
DECLARE
  tbl         text;
  schema_name text;
  table_name  text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'zapp.team_conversations',            -- useTeamConversations.ts: physical table in zapp
    'zapp.team_conversation_members',     -- useTeamConversations.ts: physical table in zapp
    'public.talkx_campaigns',             -- TalkXView.tsx:93
    'public.sales_deals',             -- useBusinessLogicManagement.ts:452
    'public.automation_executions',   -- useAutomationLogs.ts, useAutomationSuggestions.ts, useAutomationManagement.ts
    'public.agent_stats',             -- useDashboardVisualizationManagement.ts:734
    'public.warroom_alerts',          -- useWarRoomAlerts.ts, AdminAlertHistoryPage.tsx
    'public.queues',                  -- useQueues.ts
    'public.queue_members',           -- useQueues.ts
    'public.queue_positions',         -- useQueues.ts
    'public.qr_attempts',             -- QrAttemptsPanel.tsx:104
    'public.whatsapp_connections',    -- useConnectionsRealtime.ts, useEvolutionMonitoring.ts, DegradedConnectionsBanner.tsx
    'public.audio_memes',             -- useAudioManagement.ts
    'public.payment_links',           -- PaymentLinksView.tsx:61
    'email_app.email_accounts'        -- useGmailOAuthFlow.ts:292
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
      BEGIN
        EXECUTE format(
          'ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I',
          schema_name, table_name
        );
        RAISE NOTICE 'Added %.% to supabase_realtime', schema_name, table_name;
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not add %.% to supabase_realtime: % (%)',
          schema_name, table_name, SQLERRM, SQLSTATE;
      END;
    ELSE
      RAISE NOTICE '%.% already in supabase_realtime, skipping', schema_name, table_name;
    END IF;
  END LOOP;
END $$;
