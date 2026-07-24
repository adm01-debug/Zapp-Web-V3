-- Creates 8 zapp.evolution_* tables whose CREATE TABLE migrations were lost
-- during the Lovable Cloud → self-hosted migration.
--
-- Affected tables (all referenced by active Edge Functions):
--   evolution_bitrix_queue         — evolution-bitrix-sync/index.ts
--   evolution_chatbot_responses    — evolution-chatbot/index.ts
--   evolution_deals                — evolution-bitrix-sync, evolution-chatbot, evolution-followup
--   evolution_followups            — evolution-followup/index.ts
--   evolution_message_queue        — evolution-sender, evolution-templates, evolution-followup
--   evolution_message_templates    — evolution-sender, evolution-templates, evolution-followup
--   evolution_performance_metrics  — evolution-bitrix-sync, evolution-followup, evolution-sender
--   evolution_tags                 — automation-suggest-reply/index.ts
--
-- Without these tables every relevant edge function call fails on INSERT/SELECT
-- with "relation does not exist", silently aborting before reaching any downstream
-- inserts (alerts, metrics, queue entries, etc.).
--
-- All statements are idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- policy-guarded DO blocks) — safe to apply against a DB where any subset already exists.
--
-- None of these tables require supabase_realtime publication: all consumers are
-- edge functions (service_role), not frontend Realtime subscriptions.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. evolution_bitrix_queue
--    Queue for Bitrix24 CRM sync operations (create/update contact & deal).
--    Consumed by evolution-bitrix-sync (BATCH 20, exponential backoff retry).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.evolution_bitrix_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','processing','completed','failed')),
  operation        TEXT        NOT NULL
                               CHECK (operation IN ('create','update')),
  entity_type      TEXT        NOT NULL
                               CHECK (entity_type IN ('contact','deal')),
  payload          JSONB       NOT NULL DEFAULT '{}',
  local_id         UUID,
  attempts         INTEGER     NOT NULL DEFAULT 0,
  max_attempts     INTEGER     NOT NULL DEFAULT 3,
  next_attempt_at  TIMESTAMPTZ,
  last_error       TEXT,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Queue polling: pending rows with no/past next_attempt_at, FIFO
CREATE INDEX IF NOT EXISTS idx_ebq_status_next
  ON zapp.evolution_bitrix_queue (status, next_attempt_at NULLS FIRST)
  WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_ebq_created_at
  ON zapp.evolution_bitrix_queue (created_at);

ALTER TABLE zapp.evolution_bitrix_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_bitrix_queue'
      AND policyname = 'service_role_full_evolution_bitrix_queue'
  ) THEN
    CREATE POLICY "service_role_full_evolution_bitrix_queue"
      ON zapp.evolution_bitrix_queue
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_bitrix_queue'
      AND policyname = 'auth_read_evolution_bitrix_queue'
  ) THEN
    CREATE POLICY "auth_read_evolution_bitrix_queue"
      ON zapp.evolution_bitrix_queue
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. evolution_chatbot_responses
--    Log of chatbot responses — used for per-JID rate-limit counting
--    (SELECT COUNT ... WHERE remote_jid=? AND created_at>=?) and for audit.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.evolution_chatbot_responses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_jid     TEXT        NOT NULL,
  response_text  TEXT,
  model_used     TEXT        NOT NULL DEFAULT 'fallback',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rate-limit window: remote_jid + recent created_at
CREATE INDEX IF NOT EXISTS idx_ecr_jid_created
  ON zapp.evolution_chatbot_responses (remote_jid, created_at DESC);

ALTER TABLE zapp.evolution_chatbot_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_chatbot_responses'
      AND policyname = 'service_role_full_evolution_chatbot_responses'
  ) THEN
    CREATE POLICY "service_role_full_evolution_chatbot_responses"
      ON zapp.evolution_chatbot_responses
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_chatbot_responses'
      AND policyname = 'auth_read_evolution_chatbot_responses'
  ) THEN
    CREATE POLICY "auth_read_evolution_chatbot_responses"
      ON zapp.evolution_chatbot_responses
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. evolution_deals
--    CRM deals linked to evolution_contacts.
--    SELECTed by chatbot (context enrichment) and followup (template rendering).
--    UPDATEd by bitrix-sync (sets bitrix_id after successful CRM push).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.evolution_deals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT,
  stage       TEXT,
  value       NUMERIC,
  contact_id  UUID,
  bitrix_id   INTEGER,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contact's recent deals (chatbot context, followup deal lookup)
CREATE INDEX IF NOT EXISTS idx_ed_contact_updated
  ON zapp.evolution_deals (contact_id, updated_at DESC)
  WHERE contact_id IS NOT NULL;
-- Bitrix sync id lookup
CREATE INDEX IF NOT EXISTS idx_ed_bitrix_id
  ON zapp.evolution_deals (bitrix_id)
  WHERE bitrix_id IS NOT NULL;

ALTER TABLE zapp.evolution_deals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_deals'
      AND policyname = 'service_role_full_evolution_deals'
  ) THEN
    CREATE POLICY "service_role_full_evolution_deals"
      ON zapp.evolution_deals
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_deals'
      AND policyname = 'auth_read_evolution_deals'
  ) THEN
    CREATE POLICY "auth_read_evolution_deals"
      ON zapp.evolution_deals
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- auto-update updated_at
CREATE OR REPLACE FUNCTION zapp.trg_evolution_deals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_evolution_deals_updated_at'
      AND tgrelid = 'zapp.evolution_deals'::regclass
  ) THEN
    CREATE TRIGGER set_evolution_deals_updated_at
      BEFORE UPDATE ON zapp.evolution_deals
      FOR EACH ROW EXECUTE FUNCTION zapp.trg_evolution_deals_updated_at();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. evolution_followups
--    Scheduled follow-up messages. evolution-followup polls status='pending'
--    with scheduled_at<=now(), claims row atomically, then enqueues to
--    evolution_message_queue.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.evolution_followups (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','processing','queued','cancelled','failed')),
  contact_id      UUID        NOT NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  instance_name   TEXT,
  template_id     UUID,
  custom_message  TEXT,
  deal_id         UUID,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  followup_type   TEXT,
  queued_at       TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Queue polling: pending rows past their scheduled time, FIFO
CREATE INDEX IF NOT EXISTS idx_efu_status_scheduled
  ON zapp.evolution_followups (status, scheduled_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_efu_contact_id
  ON zapp.evolution_followups (contact_id);
CREATE INDEX IF NOT EXISTS idx_efu_deal_id
  ON zapp.evolution_followups (deal_id)
  WHERE deal_id IS NOT NULL;

ALTER TABLE zapp.evolution_followups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_followups'
      AND policyname = 'service_role_full_evolution_followups'
  ) THEN
    CREATE POLICY "service_role_full_evolution_followups"
      ON zapp.evolution_followups
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_followups'
      AND policyname = 'auth_read_evolution_followups'
  ) THEN
    CREATE POLICY "auth_read_evolution_followups"
      ON zapp.evolution_followups
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. evolution_message_queue
--    Central outbound message queue. evolution-sender polls status='pending'
--    rows with priority DESC, created_at ASC, BATCH 10, 600ms delay between
--    sends. Exponential backoff retry up to max_attempts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.evolution_message_queue (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_jid           TEXT        NOT NULL,
  instance_name        TEXT,
  message_type         TEXT        NOT NULL DEFAULT 'text',
  content              TEXT,
  media_url            TEXT,
  media_filename       TEXT,
  template_id          UUID,
  template_vars        JSONB,
  scheduled_at         TIMESTAMPTZ,
  priority             INTEGER     NOT NULL DEFAULT 5,
  attempts             INTEGER     NOT NULL DEFAULT 0,
  max_attempts         INTEGER     NOT NULL DEFAULT 3,
  status               TEXT        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','processing','sent','failed')),
  sent_at              TIMESTAMPTZ,
  error_message        TEXT,
  whatsapp_message_id  TEXT,
  last_http_status     INTEGER,
  source               TEXT,
  metadata             JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary queue polling pattern: pending, optional scheduled_at, priority/fifo
CREATE INDEX IF NOT EXISTS idx_emq_status_priority_created
  ON zapp.evolution_message_queue (status, priority DESC NULLS LAST, created_at ASC)
  WHERE status = 'pending';
-- scheduled_at filter (nullable — NULLs treated as "immediately ready")
CREATE INDEX IF NOT EXISTS idx_emq_scheduled_at
  ON zapp.evolution_message_queue (scheduled_at)
  WHERE scheduled_at IS NOT NULL;
-- Contact history / status lookup by JID
CREATE INDEX IF NOT EXISTS idx_emq_remote_jid_created
  ON zapp.evolution_message_queue (remote_jid, created_at DESC);
-- Template usage tracking
CREATE INDEX IF NOT EXISTS idx_emq_template_id
  ON zapp.evolution_message_queue (template_id)
  WHERE template_id IS NOT NULL;

ALTER TABLE zapp.evolution_message_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_message_queue'
      AND policyname = 'service_role_full_evolution_message_queue'
  ) THEN
    CREATE POLICY "service_role_full_evolution_message_queue"
      ON zapp.evolution_message_queue
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_message_queue'
      AND policyname = 'auth_read_evolution_message_queue'
  ) THEN
    CREATE POLICY "auth_read_evolution_message_queue"
      ON zapp.evolution_message_queue
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. evolution_message_templates
--    Reusable message templates with variable substitution ({{nome}}, etc.).
--    Listed by evolution-templates (GET), resolved by evolution-sender and
--    evolution-followup. fn_use_template RPC increments usage_count.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.evolution_message_templates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  content          TEXT,
  header_type      TEXT,
  header_content   TEXT,
  footer_text      TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  approval_status  TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (approval_status IN ('pending','approved','rejected')),
  category         TEXT,
  usage_count      INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_evolution_message_templates_name UNIQUE (name)
);

-- List active templates ordered by popularity
CREATE INDEX IF NOT EXISTS idx_emt_active_usage
  ON zapp.evolution_message_templates (is_active, usage_count DESC);
-- Category filter
CREATE INDEX IF NOT EXISTS idx_emt_category
  ON zapp.evolution_message_templates (category)
  WHERE category IS NOT NULL;
-- Name lookup (covered by unique constraint but explicit for readability)
CREATE INDEX IF NOT EXISTS idx_emt_name
  ON zapp.evolution_message_templates (name);

ALTER TABLE zapp.evolution_message_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_message_templates'
      AND policyname = 'service_role_full_evolution_message_templates'
  ) THEN
    CREATE POLICY "service_role_full_evolution_message_templates"
      ON zapp.evolution_message_templates
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_message_templates'
      AND policyname = 'auth_read_evolution_message_templates'
  ) THEN
    CREATE POLICY "auth_read_evolution_message_templates"
      ON zapp.evolution_message_templates
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- auto-update updated_at
CREATE OR REPLACE FUNCTION zapp.trg_evolution_message_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_evolution_message_templates_updated_at'
      AND tgrelid = 'zapp.evolution_message_templates'::regclass
  ) THEN
    CREATE TRIGGER set_evolution_message_templates_updated_at
      BEFORE UPDATE ON zapp.evolution_message_templates
      FOR EACH ROW EXECUTE FUNCTION zapp.trg_evolution_message_templates_updated_at();
  END IF;
END $$;

-- fn_use_template: increments usage_count and optionally logs the usage.
-- Called by evolution-templates after a successful message send.
CREATE OR REPLACE FUNCTION zapp.fn_use_template(
  p_template_id UUID,
  p_remote_jid  TEXT,
  p_variables   JSONB DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp AS $$
BEGIN
  UPDATE zapp.evolution_message_templates
     SET usage_count = usage_count + 1,
         updated_at  = now()
   WHERE id = p_template_id;
END $$;

REVOKE EXECUTE ON FUNCTION zapp.fn_use_template(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_use_template(UUID, TEXT, JSONB) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. evolution_performance_metrics
--    Daily operational metrics inserted by evolution-bitrix-sync,
--    evolution-followup and evolution-sender (fire-and-forget, no retry).
--    One row per cron run; metric_type disambiguates the source.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.evolution_performance_metrics (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date   DATE        NOT NULL,
  metric_type   TEXT        NOT NULL,
  metric_value  INTEGER     NOT NULL DEFAULT 0,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reporting: all metrics for a type in date range
CREATE INDEX IF NOT EXISTS idx_epm_type_date
  ON zapp.evolution_performance_metrics (metric_type, metric_date DESC);
-- Date-based reporting
CREATE INDEX IF NOT EXISTS idx_epm_date
  ON zapp.evolution_performance_metrics (metric_date DESC);

ALTER TABLE zapp.evolution_performance_metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_performance_metrics'
      AND policyname = 'service_role_full_evolution_performance_metrics'
  ) THEN
    CREATE POLICY "service_role_full_evolution_performance_metrics"
      ON zapp.evolution_performance_metrics
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_performance_metrics'
      AND policyname = 'auth_read_evolution_performance_metrics'
  ) THEN
    CREATE POLICY "auth_read_evolution_performance_metrics"
      ON zapp.evolution_performance_metrics
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. evolution_tags
--    Contact/conversation tags. Read-only from edge functions (automation-
--    suggest-reply SELECT id,name,color,description LIMIT 60). Tags are
--    likely managed via the admin UI or migrations.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.evolution_tags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  color       TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_etags_name
  ON zapp.evolution_tags (name);

ALTER TABLE zapp.evolution_tags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_tags'
      AND policyname = 'service_role_full_evolution_tags'
  ) THEN
    CREATE POLICY "service_role_full_evolution_tags"
      ON zapp.evolution_tags
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_tags'
      AND policyname = 'auth_read_evolution_tags'
  ) THEN
    CREATE POLICY "auth_read_evolution_tags"
      ON zapp.evolution_tags
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification: confirm all 8 tables now exist as physical tables.
-- Raises an exception if any table is still missing after the block above,
-- preventing a silent partial-apply from being committed.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  missing  TEXT[] := ARRAY[]::TEXT[];
  t        TEXT;
  tables   TEXT[] := ARRAY[
    'evolution_bitrix_queue',
    'evolution_chatbot_responses',
    'evolution_deals',
    'evolution_followups',
    'evolution_message_queue',
    'evolution_message_templates',
    'evolution_performance_metrics',
    'evolution_tags'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'zapp' AND c.relname = t AND c.relkind IN ('r','p')
    ) THEN
      missing := missing || t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: zapp tables still missing after migration: %',
      array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'OK: all 8 evolution_* tables verified in zapp schema';
END $$;
