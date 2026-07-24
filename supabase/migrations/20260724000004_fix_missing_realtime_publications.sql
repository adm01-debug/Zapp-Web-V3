-- Fix missing supabase_realtime publications.
--
-- Context: All of these are physical tables in `public` schema (or `email_app`).
-- They were NEVER moved to the `zapp` schema by the 20260716_fix_public_to_zapp_schema.sql
-- migration (which only moved security/infrastructure tables). Frontend hooks were
-- incorrectly written with schema: 'zapp', making every subscription a silent no-op.
-- Both the frontend code AND the publication entries are fixed together.
--
-- Physical schema verified by absence from 20260716_fix_public_to_zapp_schema.sql
-- (which is the only migration that ran ALTER TABLE ... SET SCHEMA zapp).
--
-- Idempotent: each entry guarded by pg_publication_tables check.
-- Per-iteration EXCEPTION block: a single failure does not abort the rest.

DO $$
DECLARE
  tbl         text;
  schema_name text;
  table_name  text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'public.team_messages',               -- useTeamConversations.ts:130
    'public.team_conversations',          -- useTeamConversations.ts:134
    'public.team_conversation_members',   -- useTeamConversations.ts:139
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
