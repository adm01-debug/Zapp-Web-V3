-- =============================================================================
-- Migration: zapp VIEW proxies for edge function tables (BUG-37 deploy)
--
-- Root cause: archive/20260724000050 was placed in archive/ and never deployed
-- by the Supabase CLI. 20 tables used by edge functions via createZappAdminClient()
-- (db.schema='zapp') had no corresponding object in the zapp schema, causing
-- PGRST205 at runtime for every affected edge function call.
--
-- This is a straight port of archive/20260724000050 to a deployable migration.
-- All 20 VIEWs use CREATE OR REPLACE — safe to run even if some already exist.
-- All use security_invoker=on so underlying table RLS still applies.
--
-- 5 tables from the original list are SKIPPED (already physical tables in zapp):
--   query_telemetry          (moved by earlier migration)
--   sicoob_contact_mapping   (moved by earlier migration)
--   rate_limit_logs          (moved by migration 47)
--   sts_telemetry            (physical table in zapp — migration 20260715)
--   sicoob_reply_outbox      (physical table in zapp — migration 20260715)
--
-- Affected edge functions:
--   create-user, gmail-token-refresh → gmail_accounts, user_service_accounts
--   gmail-webhook                    → gmail_threads, gmail_messages
--   gmail-health                     → gmail_health_logs, gmail_health_summary, gmail_revalidation_jobs
--   gmail-sync                       → gmail_labels
--   voice-changer                    → voice_conversion_queue
--   outlook-oauth, email-imap-bridge → imap_smtp_accounts
--   whatsapp-cloud-api               → whatsapp_official_credentials
--   whatsapp-cloud-webhook*          → whatsapp_cloud_webhook_pings
--   provider-healthcheck, provider-router → channel_provider_routes, provider_configs, provider_session_logs, provider_sessions
--   external-db-proxy, proxy-health, proxy-metrics → proxy_metrics, proxy_alerts
--   instance-pause-control           → instance_processing_pauses
--   evolution-health                 → messages_whatsapp
-- =============================================================================

-- ── 1. gmail_accounts ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.gmail_accounts
  WITH (security_invoker = on)
AS SELECT * FROM email_app.gmail_accounts;

REVOKE ALL ON zapp.gmail_accounts FROM PUBLIC, anon;
GRANT ALL    ON zapp.gmail_accounts TO service_role;
GRANT SELECT ON zapp.gmail_accounts TO authenticated;

-- ── 2. gmail_threads ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.gmail_threads
  WITH (security_invoker = on)
AS SELECT * FROM public.gmail_threads;

REVOKE ALL ON zapp.gmail_threads FROM PUBLIC, anon;
GRANT ALL  ON zapp.gmail_threads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.gmail_threads TO authenticated;

-- ── 3. gmail_messages ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.gmail_messages
  WITH (security_invoker = on)
AS SELECT * FROM public.gmail_messages;

REVOKE ALL ON zapp.gmail_messages FROM PUBLIC, anon;
GRANT ALL  ON zapp.gmail_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.gmail_messages TO authenticated;

-- ── 4. gmail_health_logs ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.gmail_health_logs
  WITH (security_invoker = on)
AS SELECT * FROM public.gmail_health_logs;

REVOKE ALL ON zapp.gmail_health_logs FROM PUBLIC, anon;
GRANT ALL  ON zapp.gmail_health_logs TO service_role;
GRANT SELECT ON zapp.gmail_health_logs TO authenticated;

-- ── 5. gmail_health_summary ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.gmail_health_summary
  WITH (security_invoker = on)
AS SELECT * FROM public.gmail_health_summary;

REVOKE ALL ON zapp.gmail_health_summary FROM PUBLIC, anon;
GRANT ALL  ON zapp.gmail_health_summary TO service_role;
GRANT SELECT ON zapp.gmail_health_summary TO authenticated;

-- ── 6. gmail_revalidation_jobs ────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.gmail_revalidation_jobs
  WITH (security_invoker = on)
AS SELECT * FROM public.gmail_revalidation_jobs;

REVOKE ALL ON zapp.gmail_revalidation_jobs FROM PUBLIC, anon;
GRANT ALL  ON zapp.gmail_revalidation_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.gmail_revalidation_jobs TO authenticated;

-- ── 7. gmail_labels ───────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.gmail_labels
  WITH (security_invoker = on)
AS SELECT * FROM public.gmail_labels;

REVOKE ALL ON zapp.gmail_labels FROM PUBLIC, anon;
GRANT ALL  ON zapp.gmail_labels TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.gmail_labels TO authenticated;

-- ── 8. voice_conversion_queue ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.voice_conversion_queue
  WITH (security_invoker = on)
AS SELECT * FROM public.voice_conversion_queue;

REVOKE ALL ON zapp.voice_conversion_queue FROM PUBLIC, anon;
GRANT ALL  ON zapp.voice_conversion_queue TO service_role;
GRANT SELECT, INSERT, UPDATE ON zapp.voice_conversion_queue TO authenticated;

-- ── 9. imap_smtp_accounts ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.imap_smtp_accounts
  WITH (security_invoker = on)
AS SELECT * FROM public.imap_smtp_accounts;

REVOKE ALL ON zapp.imap_smtp_accounts FROM PUBLIC, anon;
GRANT ALL  ON zapp.imap_smtp_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.imap_smtp_accounts TO authenticated;

-- ── 10. whatsapp_official_credentials ────────────────────────────────────────
-- P0: app_secret and access_token must NEVER reach authenticated users.
-- Only edge functions (running as service_role) read these credentials.
CREATE OR REPLACE VIEW zapp.whatsapp_official_credentials
  WITH (security_invoker = on)
AS SELECT * FROM public.whatsapp_official_credentials;

REVOKE ALL ON zapp.whatsapp_official_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL  ON zapp.whatsapp_official_credentials TO service_role;

-- ── 11. whatsapp_cloud_webhook_pings ─────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.whatsapp_cloud_webhook_pings
  WITH (security_invoker = on)
AS SELECT * FROM public.whatsapp_cloud_webhook_pings;

REVOKE ALL ON zapp.whatsapp_cloud_webhook_pings FROM PUBLIC, anon;
GRANT ALL  ON zapp.whatsapp_cloud_webhook_pings TO service_role;
GRANT SELECT ON zapp.whatsapp_cloud_webhook_pings TO authenticated;

-- ── 12. channel_provider_routes ───────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.channel_provider_routes
  WITH (security_invoker = on)
AS SELECT * FROM public.channel_provider_routes;

REVOKE ALL ON zapp.channel_provider_routes FROM PUBLIC, anon;
GRANT ALL  ON zapp.channel_provider_routes TO service_role;
GRANT SELECT ON zapp.channel_provider_routes TO authenticated;

-- ── 13. provider_configs ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.provider_configs
  WITH (security_invoker = on)
AS SELECT * FROM public.provider_configs;

REVOKE ALL ON zapp.provider_configs FROM PUBLIC, anon;
GRANT ALL  ON zapp.provider_configs TO service_role;
GRANT SELECT ON zapp.provider_configs TO authenticated;

-- ── 14. provider_sessions ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.provider_sessions
  WITH (security_invoker = on)
AS SELECT * FROM public.provider_sessions;

REVOKE ALL ON zapp.provider_sessions FROM PUBLIC, anon;
GRANT ALL  ON zapp.provider_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.provider_sessions TO authenticated;

-- ── 15. provider_session_logs ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.provider_session_logs
  WITH (security_invoker = on)
AS SELECT * FROM public.provider_session_logs;

REVOKE ALL ON zapp.provider_session_logs FROM PUBLIC, anon;
GRANT ALL  ON zapp.provider_session_logs TO service_role;
GRANT SELECT ON zapp.provider_session_logs TO authenticated;

-- ── 16. proxy_metrics ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.proxy_metrics
  WITH (security_invoker = on)
AS SELECT * FROM public.proxy_metrics;

REVOKE ALL ON zapp.proxy_metrics FROM PUBLIC, anon;
GRANT ALL  ON zapp.proxy_metrics TO service_role;
GRANT SELECT ON zapp.proxy_metrics TO authenticated;

-- ── 17. proxy_alerts ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.proxy_alerts
  WITH (security_invoker = on)
AS SELECT * FROM public.proxy_alerts;

REVOKE ALL ON zapp.proxy_alerts FROM PUBLIC, anon;
GRANT ALL  ON zapp.proxy_alerts TO service_role;
GRANT SELECT ON zapp.proxy_alerts TO authenticated;

-- ── 18. instance_processing_pauses ────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.instance_processing_pauses
  WITH (security_invoker = on)
AS SELECT * FROM public.instance_processing_pauses;

REVOKE ALL ON zapp.instance_processing_pauses FROM PUBLIC, anon;
GRANT ALL  ON zapp.instance_processing_pauses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.instance_processing_pauses TO authenticated;

-- ── 19. user_service_accounts ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.user_service_accounts
  WITH (security_invoker = on)
AS SELECT * FROM public.user_service_accounts;

REVOKE ALL ON zapp.user_service_accounts FROM PUBLIC, anon;
GRANT ALL  ON zapp.user_service_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.user_service_accounts TO authenticated;

-- ── 20. messages_whatsapp ─────────────────────────────────────────────────────
-- P1: The source table public.messages_whatsapp may not exist on all envs
-- (the only migration creating it is in archive/ and was never deployed).
-- Wrap in existence check to prevent the migration from failing on envs where
-- the table is absent, while still creating the view on envs where it exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'messages_whatsapp'
      AND c.relkind IN ('r','p','f','v')
  ) THEN
    EXECUTE 'CREATE OR REPLACE VIEW zapp.messages_whatsapp
               WITH (security_invoker = on)
             AS SELECT * FROM public.messages_whatsapp';
    EXECUTE 'REVOKE ALL ON zapp.messages_whatsapp FROM PUBLIC, anon';
    EXECUTE 'GRANT ALL    ON zapp.messages_whatsapp TO service_role';
    EXECUTE 'GRANT SELECT ON zapp.messages_whatsapp TO authenticated';
    RAISE NOTICE 'Created zapp.messages_whatsapp view proxy.';
  ELSE
    RAISE NOTICE 'SKIP zapp.messages_whatsapp: public.messages_whatsapp does not exist on this env.';
  END IF;
END $$;
