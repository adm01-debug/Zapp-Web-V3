-- Fix: Add all application tables to supabase_realtime with their correct zapp schema.
--
-- Root cause: Previous migrations added public.TABLE entries to the publication.
-- In this project, public.* are proxy VIEWS (532 of them). Views never emit WAL events.
-- Physical tables live in zapp (or email_app) schema. Any subscription with schema:'public'
-- was a silent no-op — no events, no reconnects, nothing.
--
-- This migration adds the zapp.TABLE (and email_app.TABLE) physical tables to the
-- supabase_realtime publication. Client subscriptions have been updated in the same
-- PR to use schema: 'zapp' (or 'email_app' for email module tables).
--
-- Idempotent: each table is guarded by a pg_publication_tables existence check.
-- Non-fatal: tables that don't exist (or are views) emit a WARNING and continue.

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    -- Core infra / status tables
    'zapp.warroom_alerts',
    'zapp.notifications',
    'zapp.calls',
    'zapp.connection_health_logs',
    'zapp.security_alerts',
    'zapp.password_reset_requests',
    'zapp.security_audit_logs',
    'zapp.hmac_selftest_audit',
    'zapp.rate_limit_logs',
    'zapp.evolution_retry_metrics',
    'zapp.provider_message_log',
    'zapp.system_health_incidents',
    'zapp.channel_connections',

    -- Automation / workflows
    'zapp.automation_executions',

    -- Queue management
    'zapp.queues',
    'zapp.queue_members',
    'zapp.queue_positions',

    -- Messaging / reactions
    'zapp.whisper_messages',
    'zapp.message_reactions',
    'zapp.team_message_reactions',
    'zapp.voice_conversion_queue',

    -- SLA / deals
    'zapp.conversation_sla',
    'zapp.sales_deals',

    -- Analytics / stats
    'zapp.agent_stats',

    -- Audio
    'zapp.audio_memes',
    'zapp.audio_meme_favorites',

    -- TalkX campaigns
    'zapp.talkx_campaigns',
    'zapp.talkx_recipients',

    -- Email health (email_app schema — physical tables there)
    'email_app.email_health_summary',
    'email_app.email_revalidation_jobs'
  ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname    = 'supabase_realtime'
        AND schemaname = split_part(tbl, '.', 1)
        AND tablename  = split_part(tbl, '.', 2)
    ) THEN
      BEGIN
        EXECUTE format(
          'ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I',
          split_part(tbl, '.', 1), split_part(tbl, '.', 2)
        );
        RAISE NOTICE 'Added % to supabase_realtime', tbl;
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not add % to supabase_realtime: % (%)', tbl, SQLERRM, SQLSTATE;
      END;
    ELSE
      RAISE NOTICE '% already in supabase_realtime, skipping', tbl;
    END IF;
  END LOOP;
END $$;
