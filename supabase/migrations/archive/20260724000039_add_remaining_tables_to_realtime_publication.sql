-- Migration: definitively add all remaining tables to supabase_realtime publication.
--
-- Context:
--   Migrations 17, 23, 24 attempted to add these tables but used
--   `EXCEPTION WHEN others THEN RAISE WARNING`, silently swallowing failures.
--   Tables that did not yet exist as physical tables at the time of those migrations,
--   or tables whose ALTER PUBLICATION failed for any reason, were never actually added.
--   This migration re-attempts them all with the correct idempotent pattern:
--     1. Verify the table is a physical table (relkind IN ('r', 'p')) — skips VIEW proxies.
--     2. Verify the table is NOT already in the publication — skips if already there.
--     3. Executes ALTER PUBLICATION without swallowing errors — failures propagate.
--
-- Ordering note: this migration runs AFTER 20260724000037 (which creates
--   zapp.password_reset_tokens) so that table exists when we try to add it.
--
-- Covers every table referenced in frontend postgres_changes subscriptions that
-- is not already definitively confirmed as in supabase_realtime.

DO $$
DECLARE
  targets TEXT[][] := ARRAY[
    -- Auth / profiles (AuthProvider.tsx:405, :421)
    ARRAY['zapp', 'profiles'],               -- AuthProvider.tsx:405
    ARRAY['zapp', 'user_roles'],             -- AuthProvider.tsx:421

    -- Security / audit
    ARRAY['zapp', 'security_audit_logs'],    -- useSecurityAuditLogs.ts:58
    ARRAY['zapp', 'rate_limit_logs'],        -- useRateLimitLogs.ts:174, RateLimitRealtimeAlerts.tsx:64
    ARRAY['zapp', 'password_reset_requests'], -- PasswordResetRequestsPanel.tsx:49
    ARRAY['zapp', 'hmac_selftest_audit'],    -- referenced in monitoring subscriptions

    -- Connection / health monitoring
    ARRAY['zapp', 'connection_health_logs'], -- ConnectionHealthPanel.tsx:95, DegradedConnectionsBanner.tsx:56
    ARRAY['zapp', 'calls'],                  -- useIncomingCallListener.ts subscription
    ARRAY['zapp', 'channel_connections'],    -- useConnectionsRealtime.ts:52
    ARRAY['zapp', 'system_health_incidents'],-- useBridgeStatus.ts subscription
    ARRAY['zapp', 'provider_message_log'],   -- useBridgeStatus.ts traffic subscription

    -- Automation / workflows
    ARRAY['zapp', 'conversation_sla'],       -- useAutomationSuggestions, SLA monitoring

    -- Messaging / audio
    ARRAY['zapp', 'audio_meme_favorites'],   -- useAudioManagement.ts:101
    ARRAY['zapp', 'voice_conversion_queue'], -- voice conversion hooks

    -- Evolution / retry metrics
    ARRAY['zapp', 'evolution_retry_metrics'], -- useRetryMetrics.ts:121

    -- TalkX
    ARRAY['zapp', 'talkx_recipients'],       -- TalkX live subscriptions

    -- Email health (physical tables in email_app schema)
    ARRAY['email_app', 'email_health_summary'],    -- useEmailHealthStatus.ts subscription
    ARRAY['email_app', 'email_revalidation_jobs']  -- useEmailHealthStatus.ts revalidation sub
  ];
  t           TEXT[];
  v_schema    TEXT;
  v_table     TEXT;
BEGIN
  FOREACH t SLICE 1 IN ARRAY targets
  LOOP
    v_schema := t[1];
    v_table  := t[2];

    -- 1. Verify the object is a physical (ordinary or partitioned) table.
    --    This skips VIEW proxies in public/zapp that share names with physical tables.
    IF NOT EXISTS (
      SELECT 1
      FROM   pg_class     c
      JOIN   pg_namespace n ON n.oid = c.relnamespace
      WHERE  n.nspname  = v_schema
        AND  c.relname  = v_table
        AND  c.relkind IN ('r', 'p')   -- 'r' = ordinary, 'p' = partitioned root
    ) THEN
      RAISE NOTICE 'SKIP %.% — not a physical table in this environment', v_schema, v_table;
      CONTINUE;
    END IF;

    -- 2. Skip if already in the publication.
    IF EXISTS (
      SELECT 1
      FROM   pg_publication_tables
      WHERE  pubname    = 'supabase_realtime'
        AND  schemaname = v_schema
        AND  tablename  = v_table
    ) THEN
      RAISE NOTICE 'SKIP %.% — already in supabase_realtime', v_schema, v_table;
      CONTINUE;
    END IF;

    -- 3. Add to publication; let errors propagate (no silent swallowing).
    EXECUTE format(
      'ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I',
      v_schema, v_table
    );
    RAISE NOTICE 'ADDED %.% to supabase_realtime', v_schema, v_table;
  END LOOP;
END;
$$;
