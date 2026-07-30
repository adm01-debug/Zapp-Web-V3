-- Migration: Create missing tables and views referenced by application code
-- Audit date: 2026-07-15
-- All objects created in schema "zapp" (the app's default schema)

BEGIN;

SET search_path TO zapp, public;

--------------------------------------------------------------------------------
-- 1. VIEWS (aliases / security wrappers)
--------------------------------------------------------------------------------

-- 1a. channel_connections_safe — security invoker view stripping config/credentials
CREATE OR REPLACE VIEW zapp.channel_connections_safe
WITH (security_invoker = true) AS
SELECT
  id,
  name,
  channel_type,
  status,
  is_active,
  updated_at,
  created_at,
  created_by,
  external_account_id,
  external_page_id,
  webhook_url,
  whatsapp_connection_id
FROM zapp.channel_connections;

GRANT SELECT ON zapp.channel_connections_safe TO authenticated, anon, service_role;

-- 1b. evolution_instances — alias over existing evolution_instances_public view
CREATE OR REPLACE VIEW zapp.evolution_instances AS
SELECT * FROM zapp.evolution_instances_public;

GRANT SELECT ON zapp.evolution_instances TO authenticated, anon, service_role;

--------------------------------------------------------------------------------
-- 2. NEW TABLES
--------------------------------------------------------------------------------

-- 2a. contact_assignments
CREATE TABLE IF NOT EXISTS zapp.contact_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID NOT NULL,
  assigned_to_user_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_contact_assignments_contact UNIQUE (contact_id)
);

-- 2b. contact_intelligence
CREATE TABLE IF NOT EXISTS zapp.contact_intelligence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID NOT NULL UNIQUE,
  sentiment       TEXT,
  engagement_score NUMERIC,
  predicted_value  NUMERIC,
  risk_level      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2c. dashboard_queries
CREATE TABLE IF NOT EXISTS zapp.dashboard_queries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  query_name TEXT,
  query_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2d. email_watch_history
CREATE TABLE IF NOT EXISTS zapp.email_watch_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL,
  history_id          TEXT,
  expires_at          TIMESTAMPTZ,
  watch_registered_at TIMESTAMPTZ DEFAULT now(),
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_email_watch_account UNIQUE (account_id)
);

-- 2e. forwarded_messages
CREATE TABLE IF NOT EXISTS zapp.forwarded_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id UUID NOT NULL,
  target_id         UUID NOT NULL,
  forwarded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2f. integrations
CREATE TABLE IF NOT EXISTS zapp.integrations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT NOT NULL,
  config     JSONB DEFAULT '{}'::jsonb,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2g. message_attempts
CREATE TABLE IF NOT EXISTS zapp.message_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  error       TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2h. migration_audit
CREATE TABLE IF NOT EXISTS zapp.migration_audit (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation  TEXT NOT NULL,
  table_name TEXT,
  new_data   JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2i. onboarding_steps
CREATE TABLE IF NOT EXISTS zapp.onboarding_steps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  step_key   TEXT,
  completed  BOOLEAN NOT NULL DEFAULT false,
  timestamp  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2j. personal_stickers
CREATE TABLE IF NOT EXISTS zapp.personal_stickers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  url        TEXT NOT NULL,
  name       TEXT,
  category   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2k. search_history
CREATE TABLE IF NOT EXISTS zapp.search_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID,
  query       TEXT NOT NULL,
  result_type TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2l. search_insights
CREATE TABLE IF NOT EXISTS zapp.search_insights (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_term  TEXT NOT NULL,
  search_count BIGINT NOT NULL DEFAULT 0,
  click_count  BIGINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2m. sentiment_alerts
CREATE TABLE IF NOT EXISTS zapp.sentiment_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID,
  message_id      UUID,
  sentiment_score NUMERIC,
  alert_level     TEXT CHECK (alert_level IN ('low', 'medium', 'high')),
  acknowledged    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2n. sicoob_reply_outbox
CREATE TABLE IF NOT EXISTS zapp.sicoob_reply_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID NOT NULL,
  message_id      UUID NOT NULL UNIQUE,
  agent_id        UUID,
  content         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','sent','failed','abandoned')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2o. storage_cleanup_logs
CREATE TABLE IF NOT EXISTS zapp.storage_cleanup_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id       TEXT NOT NULL,
  files_deleted   INTEGER NOT NULL,
  total_size_bytes BIGINT,
  status          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 2p. sts_telemetry
CREATE TABLE IF NOT EXISTS zapp.sts_telemetry (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID,
  input_size_bytes BIGINT,
  status_code      INTEGER,
  response_time_ms INTEGER,
  error_type       TEXT,
  metadata         JSONB DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- 2q. webhook_health_checks
CREATE TABLE IF NOT EXISTS zapp.webhook_health_checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      TEXT,
  status          TEXT CHECK (status IN ('healthy', 'degraded', 'failed')),
  error_message   TEXT,
  last_checked_at TIMESTAMPTZ,
  acknowledged    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2r. webhook_idempotency
CREATE TABLE IF NOT EXISTS zapp.webhook_idempotency (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       VARCHAR(50) NOT NULL,
  webhook_id   VARCHAR(255) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'processing',
  error_message TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  CONSTRAINT webhook_idempotency_source_id_key UNIQUE (source, webhook_id)
);

-- 2s. webhook_preferences
CREATE TABLE IF NOT EXISTS zapp.webhook_preferences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2t. webhook_reprocess_queue
CREATE TABLE IF NOT EXISTS zapp.webhook_reprocess_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID,
  payload       JSONB NOT NULL,
  last_error    TEXT,
  attempts      INTEGER DEFAULT 0,
  max_attempts  INTEGER DEFAULT 5,
  next_retry_at TIMESTAMPTZ DEFAULT now(),
  status        TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','failed','completed')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 2u. workspace_settings
CREATE TABLE IF NOT EXISTS zapp.workspace_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  description         TEXT,
  logo_url            TEXT,
  default_queue       TEXT,
  working_hours_start TEXT,
  working_hours_end   TEXT,
  timezone            TEXT DEFAULT 'America/Sao_Paulo',
  settings            JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 3. updated_at TRIGGERS
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION zapp.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'contact_assignments', 'contact_intelligence', 'dashboard_queries',
    'email_watch_history', 'integrations', 'onboarding_steps',
    'search_insights', 'sicoob_reply_outbox', 'webhook_preferences',
    'webhook_reprocess_queue', 'workspace_settings'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON zapp.%I
       FOR EACH ROW EXECUTE FUNCTION zapp.set_updated_at()',
      tbl, tbl
    );
  END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
--------------------------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'contact_assignments', 'contact_intelligence', 'dashboard_queries',
    'email_watch_history', 'forwarded_messages', 'integrations',
    'message_attempts', 'migration_audit', 'onboarding_steps',
    'personal_stickers', 'search_history', 'search_insights',
    'sentiment_alerts', 'sicoob_reply_outbox', 'storage_cleanup_logs',
    'sts_telemetry', 'webhook_health_checks', 'webhook_idempotency',
    'webhook_preferences', 'webhook_reprocess_queue', 'workspace_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE zapp.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- Service role bypass (edge functions use service_role key)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'contact_assignments', 'contact_intelligence', 'dashboard_queries',
    'email_watch_history', 'forwarded_messages', 'integrations',
    'message_attempts', 'migration_audit', 'onboarding_steps',
    'personal_stickers', 'search_history', 'search_insights',
    'sentiment_alerts', 'sicoob_reply_outbox', 'storage_cleanup_logs',
    'sts_telemetry', 'webhook_health_checks', 'webhook_idempotency',
    'webhook_preferences', 'webhook_reprocess_queue', 'workspace_settings'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "service_role_full_%I" ON zapp.%I
       FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- User-scoped read policies for tables with user_id column
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'dashboard_queries', 'onboarding_steps', 'personal_stickers',
    'search_history', 'webhook_preferences'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "auth_user_select_%I" ON zapp.%I
       FOR SELECT TO authenticated USING (user_id = auth.uid())',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "auth_user_write_%I" ON zapp.%I
       FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
      tbl, tbl
    );
  END LOOP;
END $$;

-- Authenticated read-only for general reference tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'contact_assignments', 'contact_intelligence', 'forwarded_messages',
    'integrations', 'message_attempts', 'sentiment_alerts',
    'search_insights', 'webhook_health_checks', 'workspace_settings'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "auth_select_%I" ON zapp.%I
       FOR SELECT TO authenticated USING (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- Write policies for tables that authenticated users insert/update
CREATE POLICY "auth_upsert_contact_assignments" ON zapp.contact_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_upsert_workspace_settings" ON zapp.workspace_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_write_sentiment_alerts" ON zapp.sentiment_alerts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_write_webhook_health_checks" ON zapp.webhook_health_checks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_write_forwarded_messages" ON zapp.forwarded_messages
  FOR INSERT TO authenticated WITH CHECK (true);

-- Write-only audit tables (edge functions via service_role, deny direct user access)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'storage_cleanup_logs', 'sts_telemetry', 'migration_audit',
    'email_watch_history', 'sicoob_reply_outbox', 'webhook_idempotency',
    'webhook_reprocess_queue'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "deny_anon_%I" ON zapp.%I
       FOR ALL TO anon USING (false) WITH CHECK (false)',
      tbl, tbl
    );
  END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 5. GRANTS
--------------------------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'contact_assignments', 'contact_intelligence', 'dashboard_queries',
    'email_watch_history', 'forwarded_messages', 'integrations',
    'message_attempts', 'migration_audit', 'onboarding_steps',
    'personal_stickers', 'search_history', 'search_insights',
    'sentiment_alerts', 'sicoob_reply_outbox', 'storage_cleanup_logs',
    'sts_telemetry', 'webhook_health_checks', 'webhook_idempotency',
    'webhook_preferences', 'webhook_reprocess_queue', 'workspace_settings'
  ] LOOP
    EXECUTE format('GRANT ALL ON zapp.%I TO service_role', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.%I TO authenticated', tbl);
  END LOOP;
END $$;

-- search_history uses BIGINT IDENTITY, grant sequence usage
GRANT USAGE ON ALL SEQUENCES IN SCHEMA zapp TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 6. INDEXES
--------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_contact_assignments_contact ON zapp.contact_assignments (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_intelligence_contact ON zapp.contact_intelligence (contact_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_queries_user ON zapp.dashboard_queries (user_id);
CREATE INDEX IF NOT EXISTS idx_email_watch_history_account ON zapp.email_watch_history (account_id);
CREATE INDEX IF NOT EXISTS idx_forwarded_messages_source ON zapp.forwarded_messages (source_message_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON zapp.integrations (type);
CREATE INDEX IF NOT EXISTS idx_message_attempts_message ON zapp.message_attempts (message_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_user ON zapp.onboarding_steps (user_id);
CREATE INDEX IF NOT EXISTS idx_personal_stickers_user ON zapp.personal_stickers (user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_timestamp ON zapp.search_history (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_search_insights_count ON zapp.search_insights (search_count DESC);
CREATE INDEX IF NOT EXISTS idx_sentiment_alerts_contact ON zapp.sentiment_alerts (contact_id);
CREATE INDEX IF NOT EXISTS idx_sicoob_outbox_status ON zapp.sicoob_reply_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_storage_logs_bucket ON zapp.storage_cleanup_logs (bucket_id);
CREATE INDEX IF NOT EXISTS idx_sts_telemetry_task ON zapp.sts_telemetry (task_id);
CREATE INDEX IF NOT EXISTS idx_webhook_health_created ON zapp.webhook_health_checks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_idemp_source ON zapp.webhook_idempotency (source, webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_prefs_user ON zapp.webhook_preferences (user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_reprocess_status ON zapp.webhook_reprocess_queue (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_workspace_settings_ws ON zapp.workspace_settings (workspace_id);

COMMIT;
