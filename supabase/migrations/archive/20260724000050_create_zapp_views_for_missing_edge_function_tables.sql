-- Migration: Create zapp VIEW proxies for missing edge function tables (BUG-37)
--
-- Problem: Several tables accessed by edge functions via createZappAdminClient()
-- (db: { schema: "zapp" }) had no corresponding view or table in the zapp
-- schema. PostgREST returns PGRST205 ("Relation not found") at runtime.
--
-- This migration creates 20 VIEW proxies. 5 tables were skipped because they
-- already exist as physical tables in zapp (either moved by batch migrations
-- 43-47 or created directly in zapp by migration 20260715):
--   SKIP: query_telemetry          (moved by migration 43/44/45)
--   SKIP: sicoob_contact_mapping   (moved by migration 43/44/45)
--   SKIP: rate_limit_logs          (moved by migration 47)
--   SKIP: sts_telemetry            (physical table in zapp — migration 20260715)
--   SKIP: sicoob_reply_outbox      (physical table in zapp — migration 20260715)
--
-- Affected edge functions (VIEWs created here):
--   create-user              → gmail_accounts, user_service_accounts
--   gmail-token-refresh      → gmail_accounts
--   gmail-webhook            → gmail_threads, gmail_messages
--   gmail-health             → gmail_health_logs, gmail_health_summary, gmail_revalidation_jobs
--   gmail-sync               → gmail_labels
--   voice-changer            → voice_conversion_queue
--   outlook-oauth            → imap_smtp_accounts
--   email-imap-bridge        → imap_smtp_accounts
--   whatsapp-cloud-api       → whatsapp_official_credentials
--   whatsapp-cloud-webhook   → whatsapp_cloud_webhook_pings
--   whatsapp-cloud-webhook-verify → whatsapp_cloud_webhook_pings
--   provider-healthcheck     → channel_provider_routes, provider_configs, provider_session_logs
--   provider-router          → channel_provider_routes, provider_sessions, provider_configs, provider_session_logs
--   external-db-proxy/utils  → proxy_metrics
--   proxy-health             → proxy_metrics, proxy_alerts
--   proxy-metrics            → proxy_metrics
--   instance-pause-control   → instance_processing_pauses
--   evolution-health         → messages_whatsapp
--
-- All views use security_invoker=on so the underlying table's RLS still applies.

-- ── 1. gmail_accounts ─────────────────────────────────────────────────────────
-- Contains OAuth refresh tokens — read-only for authenticated.
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

-- ── 9. sts_telemetry — SKIP: already a physical table in zapp (migration 20260715_create_missing_schema_objects) ──

-- ── 10. imap_smtp_accounts ────────────────────────────────────────────────────
-- Contains IMAP/SMTP passwords.
CREATE OR REPLACE VIEW zapp.imap_smtp_accounts
  WITH (security_invoker = on)
AS SELECT * FROM public.imap_smtp_accounts;

REVOKE ALL ON zapp.imap_smtp_accounts FROM PUBLIC, anon;
GRANT ALL  ON zapp.imap_smtp_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.imap_smtp_accounts TO authenticated;

-- ── 11. whatsapp_official_credentials ────────────────────────────────────────
-- Contains WhatsApp Cloud API tokens — read-only for authenticated.
CREATE OR REPLACE VIEW zapp.whatsapp_official_credentials
  WITH (security_invoker = on)
AS SELECT * FROM public.whatsapp_official_credentials;

REVOKE ALL ON zapp.whatsapp_official_credentials FROM PUBLIC, anon;
GRANT ALL    ON zapp.whatsapp_official_credentials TO service_role;
GRANT SELECT ON zapp.whatsapp_official_credentials TO authenticated;

-- ── 12. whatsapp_cloud_webhook_pings ─────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.whatsapp_cloud_webhook_pings
  WITH (security_invoker = on)
AS SELECT * FROM public.whatsapp_cloud_webhook_pings;

REVOKE ALL ON zapp.whatsapp_cloud_webhook_pings FROM PUBLIC, anon;
GRANT ALL  ON zapp.whatsapp_cloud_webhook_pings TO service_role;
GRANT SELECT ON zapp.whatsapp_cloud_webhook_pings TO authenticated;

-- ── 13. channel_provider_routes ───────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.channel_provider_routes
  WITH (security_invoker = on)
AS SELECT * FROM public.channel_provider_routes;

REVOKE ALL ON zapp.channel_provider_routes FROM PUBLIC, anon;
GRANT ALL  ON zapp.channel_provider_routes TO service_role;
GRANT SELECT ON zapp.channel_provider_routes TO authenticated;

-- ── 14. provider_configs ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.provider_configs
  WITH (security_invoker = on)
AS SELECT * FROM public.provider_configs;

REVOKE ALL ON zapp.provider_configs FROM PUBLIC, anon;
GRANT ALL  ON zapp.provider_configs TO service_role;
GRANT SELECT ON zapp.provider_configs TO authenticated;

-- ── 15. provider_sessions ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.provider_sessions
  WITH (security_invoker = on)
AS SELECT * FROM public.provider_sessions;

REVOKE ALL ON zapp.provider_sessions FROM PUBLIC, anon;
GRANT ALL  ON zapp.provider_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.provider_sessions TO authenticated;

-- ── 16. provider_session_logs ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.provider_session_logs
  WITH (security_invoker = on)
AS SELECT * FROM public.provider_session_logs;

REVOKE ALL ON zapp.provider_session_logs FROM PUBLIC, anon;
GRANT ALL  ON zapp.provider_session_logs TO service_role;
GRANT SELECT ON zapp.provider_session_logs TO authenticated;

-- ── 17. proxy_metrics ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.proxy_metrics
  WITH (security_invoker = on)
AS SELECT * FROM public.proxy_metrics;

REVOKE ALL ON zapp.proxy_metrics FROM PUBLIC, anon;
GRANT ALL  ON zapp.proxy_metrics TO service_role;
GRANT SELECT ON zapp.proxy_metrics TO authenticated;

-- ── 18. proxy_alerts ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.proxy_alerts
  WITH (security_invoker = on)
AS SELECT * FROM public.proxy_alerts;

REVOKE ALL ON zapp.proxy_alerts FROM PUBLIC, anon;
GRANT ALL  ON zapp.proxy_alerts TO service_role;
GRANT SELECT ON zapp.proxy_alerts TO authenticated;

-- ── 19. query_telemetry — SKIP: already a physical table in zapp (moved by earlier migration) ──

-- ── 20. instance_processing_pauses ────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.instance_processing_pauses
  WITH (security_invoker = on)
AS SELECT * FROM public.instance_processing_pauses;

REVOKE ALL ON zapp.instance_processing_pauses FROM PUBLIC, anon;
GRANT ALL  ON zapp.instance_processing_pauses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.instance_processing_pauses TO authenticated;

-- ── 21. sicoob_contact_mapping — SKIP: already a physical table in zapp (moved by earlier migration) ──

-- ── 22. sicoob_reply_outbox — SKIP: already a physical table in zapp (migration 20260715_create_missing_schema_objects) ──

-- ── 23. rate_limit_logs — SKIP: already a physical table in zapp (moved by migration 47) ──

-- ── 24. user_service_accounts ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.user_service_accounts
  WITH (security_invoker = on)
AS SELECT * FROM public.user_service_accounts;

REVOKE ALL ON zapp.user_service_accounts FROM PUBLIC, anon;
GRANT ALL  ON zapp.user_service_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.user_service_accounts TO authenticated;

-- ── 25. messages_whatsapp ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW zapp.messages_whatsapp
  WITH (security_invoker = on)
AS SELECT * FROM public.messages_whatsapp;

REVOKE ALL ON zapp.messages_whatsapp FROM PUBLIC, anon;
GRANT ALL  ON zapp.messages_whatsapp TO service_role;
GRANT SELECT ON zapp.messages_whatsapp TO authenticated;
