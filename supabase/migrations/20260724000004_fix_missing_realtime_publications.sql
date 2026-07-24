-- Fix missing supabase_realtime publications.
-- The frontend subscribes to these tables with schema-qualified paths (zapp.*, financeiro.*, email_app.*)
-- but many were only ever added as public.* proxy VIEWs — which are silent no-ops in Realtime.
-- All tables here are physical tables in their respective schemas.
--
-- Idempotent: each table is checked before ALTER PUBLICATION to avoid errors on re-apply.

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
    'public.payment_links',         -- PaymentLinksView.tsx:61 (table remains in public schema; never moved by 20260716)
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
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', schema_name, table_name);
    END IF;
  END LOOP;
END $$;
