-- Creates 8 missing evolution_* physical tables (lost during Lovable Cloud → self-hosted
-- migration). All 8 are confirmed "view → evo" in the 2026-07-15 schema audit, meaning
-- zapp.X already exists as an auto-updatable VIEW proxy over evo.X.
--
-- CRITICAL: schema-aware DDL required
--   On production, zapp.evolution_X is a VIEW — CREATE TABLE IF NOT EXISTS silently skips
--   it, then CREATE INDEX ON the view FAILS ("cannot create index on view"), rolling back
--   the entire migration. The DO block below detects the relation kind and routes physical
--   DDL to the correct schema via EXECUTE format().
--
-- Schema detection per table:
--   relkind 'v' in zapp → physical table created in evo  (VIEW proxy routes queries)
--   no relation in zapp  → physical table created in zapp (fresh install)
--   relkind 'r'/'p'      → CREATE TABLE IF NOT EXISTS is a no-op; indexes guarded
--
-- All statements are idempotent — safe to apply against any DB state.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. evolution_bitrix_queue
--    Queue for Bitrix24 CRM sync (create/update contact & deal).
--    Polled by evolution-bitrix-sync in batches of 20 with exponential backoff.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_schema  TEXT;
  v_relkind CHAR;
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'evolution_bitrix_queue';

  IF v_relkind = 'v' THEN
    v_schema := 'evo';
    RAISE NOTICE 'zapp.evolution_bitrix_queue is a VIEW — creating physical table in evo';
  ELSE
    v_schema := 'zapp';
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.evolution_bitrix_queue (
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
    )
  $sql$, v_schema);

  EXECUTE format(
    $q$CREATE INDEX IF NOT EXISTS idx_ebq_status_next
         ON %I.evolution_bitrix_queue (status, next_attempt_at NULLS FIRST)
         WHERE status IN ('pending','processing')$q$,
    v_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_ebq_created_at ON %I.evolution_bitrix_queue (created_at)',
    v_schema
  );
  EXECUTE format('ALTER TABLE %I.evolution_bitrix_queue ENABLE ROW LEVEL SECURITY', v_schema);

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_bitrix_queue'
      AND policyname = 'service_role_full_evolution_bitrix_queue'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "service_role_full_evolution_bitrix_queue"
        ON %I.evolution_bitrix_queue
        FOR ALL TO service_role USING (true) WITH CHECK (true)
    $p$, v_schema);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_bitrix_queue'
      AND policyname = 'auth_read_evolution_bitrix_queue'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "auth_read_evolution_bitrix_queue"
        ON %I.evolution_bitrix_queue FOR SELECT TO authenticated USING (true)
    $p$, v_schema);
  END IF;

  RAISE NOTICE 'evolution_bitrix_queue created/verified in % schema', v_schema;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. evolution_chatbot_responses
--    Log of chatbot AI responses. Used for per-JID rate-limit counting
--    (COUNT ... WHERE remote_jid=? AND created_at >= window) and for audit.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_schema  TEXT;
  v_relkind CHAR;
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'evolution_chatbot_responses';

  IF v_relkind = 'v' THEN
    v_schema := 'evo';
    RAISE NOTICE 'zapp.evolution_chatbot_responses is a VIEW — creating physical table in evo';
  ELSE
    v_schema := 'zapp';
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.evolution_chatbot_responses (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      remote_jid     TEXT        NOT NULL,
      response_text  TEXT,
      model_used     TEXT        NOT NULL DEFAULT 'fallback',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  $sql$, v_schema);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_ecr_jid_created ON %I.evolution_chatbot_responses (remote_jid, created_at DESC)',
    v_schema
  );
  EXECUTE format('ALTER TABLE %I.evolution_chatbot_responses ENABLE ROW LEVEL SECURITY', v_schema);

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_chatbot_responses'
      AND policyname = 'service_role_full_evolution_chatbot_responses'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "service_role_full_evolution_chatbot_responses"
        ON %I.evolution_chatbot_responses
        FOR ALL TO service_role USING (true) WITH CHECK (true)
    $p$, v_schema);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_chatbot_responses'
      AND policyname = 'auth_read_evolution_chatbot_responses'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "auth_read_evolution_chatbot_responses"
        ON %I.evolution_chatbot_responses FOR SELECT TO authenticated USING (true)
    $p$, v_schema);
  END IF;

  RAISE NOTICE 'evolution_chatbot_responses created/verified in % schema', v_schema;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. evolution_deals
--    CRM deals linked to evolution_contacts. SELECTed by chatbot (context
--    enrichment) and followup (template rendering). UPDATEd by bitrix-sync
--    (sets bitrix_id after successful CRM push).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_schema  TEXT;
  v_relkind CHAR;
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'evolution_deals';

  IF v_relkind = 'v' THEN
    v_schema := 'evo';
    RAISE NOTICE 'zapp.evolution_deals is a VIEW — creating physical table in evo';
  ELSE
    v_schema := 'zapp';
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.evolution_deals (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      title       TEXT,
      stage       TEXT,
      value       NUMERIC,
      contact_id  UUID,
      bitrix_id   INTEGER,
      notes       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  $sql$, v_schema);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_ed_contact_updated ON %I.evolution_deals (contact_id, updated_at DESC) WHERE contact_id IS NOT NULL',
    v_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_ed_bitrix_id ON %I.evolution_deals (bitrix_id) WHERE bitrix_id IS NOT NULL',
    v_schema
  );
  EXECUTE format('ALTER TABLE %I.evolution_deals ENABLE ROW LEVEL SECURITY', v_schema);

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_deals'
      AND policyname = 'service_role_full_evolution_deals'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "service_role_full_evolution_deals"
        ON %I.evolution_deals
        FOR ALL TO service_role USING (true) WITH CHECK (true)
    $p$, v_schema);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_deals'
      AND policyname = 'auth_read_evolution_deals'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "auth_read_evolution_deals"
        ON %I.evolution_deals FOR SELECT TO authenticated USING (true)
    $p$, v_schema);
  END IF;

  -- updated_at trigger (function body references no table, works across schemas)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'set_evolution_deals_updated_at'
      AND n.nspname = v_schema AND c.relname = 'evolution_deals'
  ) THEN
    EXECUTE format($$
      CREATE TRIGGER set_evolution_deals_updated_at
        BEFORE UPDATE ON %I.evolution_deals
        FOR EACH ROW EXECUTE FUNCTION zapp.trg_evolution_deals_updated_at()
    $$, v_schema);
  END IF;

  RAISE NOTICE 'evolution_deals created/verified in % schema', v_schema;
END $$;

-- Trigger function (idempotent; body is schema-agnostic — no table references)
CREATE OR REPLACE FUNCTION zapp.trg_evolution_deals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. evolution_followups
--    Scheduled follow-up messages. evolution-followup polls status='pending'
--    rows with scheduled_at<=now(), claims atomically, enqueues to
--    evolution_message_queue.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_schema  TEXT;
  v_relkind CHAR;
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'evolution_followups';

  IF v_relkind = 'v' THEN
    v_schema := 'evo';
    RAISE NOTICE 'zapp.evolution_followups is a VIEW — creating physical table in evo';
  ELSE
    v_schema := 'zapp';
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.evolution_followups (
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
    )
  $sql$, v_schema);

  EXECUTE format(
    $q$CREATE INDEX IF NOT EXISTS idx_efu_status_scheduled
         ON %I.evolution_followups (status, scheduled_at) WHERE status = 'pending'$q$,
    v_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_efu_contact_id ON %I.evolution_followups (contact_id)',
    v_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_efu_deal_id ON %I.evolution_followups (deal_id) WHERE deal_id IS NOT NULL',
    v_schema
  );
  EXECUTE format('ALTER TABLE %I.evolution_followups ENABLE ROW LEVEL SECURITY', v_schema);

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_followups'
      AND policyname = 'service_role_full_evolution_followups'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "service_role_full_evolution_followups"
        ON %I.evolution_followups
        FOR ALL TO service_role USING (true) WITH CHECK (true)
    $p$, v_schema);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_followups'
      AND policyname = 'auth_read_evolution_followups'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "auth_read_evolution_followups"
        ON %I.evolution_followups FOR SELECT TO authenticated USING (true)
    $p$, v_schema);
  END IF;

  RAISE NOTICE 'evolution_followups created/verified in % schema', v_schema;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. evolution_message_queue
--    Central outbound message queue. evolution-sender polls status='pending'
--    rows with priority DESC, created_at ASC, batch 10. Exponential backoff
--    retry up to max_attempts.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_schema  TEXT;
  v_relkind CHAR;
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'evolution_message_queue';

  IF v_relkind = 'v' THEN
    v_schema := 'evo';
    RAISE NOTICE 'zapp.evolution_message_queue is a VIEW — creating physical table in evo';
  ELSE
    v_schema := 'zapp';
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.evolution_message_queue (
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
    )
  $sql$, v_schema);

  EXECUTE format(
    $q$CREATE INDEX IF NOT EXISTS idx_emq_status_priority_created
         ON %I.evolution_message_queue (status, priority DESC NULLS LAST, created_at ASC)
         WHERE status = 'pending'$q$,
    v_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_emq_scheduled_at ON %I.evolution_message_queue (scheduled_at) WHERE scheduled_at IS NOT NULL',
    v_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_emq_remote_jid_created ON %I.evolution_message_queue (remote_jid, created_at DESC)',
    v_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_emq_template_id ON %I.evolution_message_queue (template_id) WHERE template_id IS NOT NULL',
    v_schema
  );
  EXECUTE format('ALTER TABLE %I.evolution_message_queue ENABLE ROW LEVEL SECURITY', v_schema);

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_message_queue'
      AND policyname = 'service_role_full_evolution_message_queue'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "service_role_full_evolution_message_queue"
        ON %I.evolution_message_queue
        FOR ALL TO service_role USING (true) WITH CHECK (true)
    $p$, v_schema);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_message_queue'
      AND policyname = 'auth_read_evolution_message_queue'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "auth_read_evolution_message_queue"
        ON %I.evolution_message_queue FOR SELECT TO authenticated USING (true)
    $p$, v_schema);
  END IF;

  RAISE NOTICE 'evolution_message_queue created/verified in % schema', v_schema;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. evolution_message_templates
--    Reusable message templates with variable substitution ({{nome}}, etc.).
--    Listed by evolution-templates (GET), resolved by evolution-sender and
--    evolution-followup. fn_use_template increments usage_count.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_schema  TEXT;
  v_relkind CHAR;
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'evolution_message_templates';

  IF v_relkind = 'v' THEN
    v_schema := 'evo';
    RAISE NOTICE 'zapp.evolution_message_templates is a VIEW — creating physical table in evo';
  ELSE
    v_schema := 'zapp';
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.evolution_message_templates (
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
    )
  $sql$, v_schema);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_emt_active_usage ON %I.evolution_message_templates (is_active, usage_count DESC)',
    v_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_emt_category ON %I.evolution_message_templates (category) WHERE category IS NOT NULL',
    v_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_emt_name ON %I.evolution_message_templates (name)',
    v_schema
  );
  EXECUTE format('ALTER TABLE %I.evolution_message_templates ENABLE ROW LEVEL SECURITY', v_schema);

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_message_templates'
      AND policyname = 'service_role_full_evolution_message_templates'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "service_role_full_evolution_message_templates"
        ON %I.evolution_message_templates
        FOR ALL TO service_role USING (true) WITH CHECK (true)
    $p$, v_schema);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_message_templates'
      AND policyname = 'auth_read_evolution_message_templates'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "auth_read_evolution_message_templates"
        ON %I.evolution_message_templates FOR SELECT TO authenticated USING (true)
    $p$, v_schema);
  END IF;

  -- updated_at trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'set_evolution_message_templates_updated_at'
      AND n.nspname = v_schema AND c.relname = 'evolution_message_templates'
  ) THEN
    EXECUTE format($$
      CREATE TRIGGER set_evolution_message_templates_updated_at
        BEFORE UPDATE ON %I.evolution_message_templates
        FOR EACH ROW EXECUTE FUNCTION zapp.trg_evolution_message_templates_updated_at()
    $$, v_schema);
  END IF;

  RAISE NOTICE 'evolution_message_templates created/verified in % schema', v_schema;
END $$;

-- Trigger function (idempotent; body is schema-agnostic)
CREATE OR REPLACE FUNCTION zapp.trg_evolution_message_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- fn_use_template: increments usage_count. Uses zapp.evolution_message_templates —
-- the VIEW proxy routes the UPDATE to the physical table in evo automatically.
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
--    Daily operational metrics. Inserted fire-and-forget by evolution-bitrix-sync,
--    evolution-followup and evolution-sender. metric_type disambiguates source.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_schema  TEXT;
  v_relkind CHAR;
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'evolution_performance_metrics';

  IF v_relkind = 'v' THEN
    v_schema := 'evo';
    RAISE NOTICE 'zapp.evolution_performance_metrics is a VIEW — creating physical table in evo';
  ELSE
    v_schema := 'zapp';
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.evolution_performance_metrics (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      metric_date   DATE        NOT NULL,
      metric_type   TEXT        NOT NULL,
      metric_value  INTEGER     NOT NULL DEFAULT 0,
      metadata      JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  $sql$, v_schema);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_epm_type_date ON %I.evolution_performance_metrics (metric_type, metric_date DESC)',
    v_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_epm_date ON %I.evolution_performance_metrics (metric_date DESC)',
    v_schema
  );
  EXECUTE format('ALTER TABLE %I.evolution_performance_metrics ENABLE ROW LEVEL SECURITY', v_schema);

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_performance_metrics'
      AND policyname = 'service_role_full_evolution_performance_metrics'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "service_role_full_evolution_performance_metrics"
        ON %I.evolution_performance_metrics
        FOR ALL TO service_role USING (true) WITH CHECK (true)
    $p$, v_schema);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_performance_metrics'
      AND policyname = 'auth_read_evolution_performance_metrics'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "auth_read_evolution_performance_metrics"
        ON %I.evolution_performance_metrics FOR SELECT TO authenticated USING (true)
    $p$, v_schema);
  END IF;

  RAISE NOTICE 'evolution_performance_metrics created/verified in % schema', v_schema;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. evolution_tags
--    Contact/conversation tags. Read-only from edge functions (automation-
--    suggest-reply SELECT id,name,color,description LIMIT 60). Tags managed
--    via admin UI or migrations.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_schema  TEXT;
  v_relkind CHAR;
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'evolution_tags';

  IF v_relkind = 'v' THEN
    v_schema := 'evo';
    RAISE NOTICE 'zapp.evolution_tags is a VIEW — creating physical table in evo';
  ELSE
    v_schema := 'zapp';
  END IF;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS %I.evolution_tags (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT        NOT NULL,
      color       TEXT,
      description TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  $sql$, v_schema);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_etags_name ON %I.evolution_tags (name)',
    v_schema
  );
  EXECUTE format('ALTER TABLE %I.evolution_tags ENABLE ROW LEVEL SECURITY', v_schema);

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_tags'
      AND policyname = 'service_role_full_evolution_tags'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "service_role_full_evolution_tags"
        ON %I.evolution_tags
        FOR ALL TO service_role USING (true) WITH CHECK (true)
    $p$, v_schema);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_tags'
      AND policyname = 'auth_read_evolution_tags'
  ) THEN
    EXECUTE format($p$
      CREATE POLICY "auth_read_evolution_tags"
        ON %I.evolution_tags FOR SELECT TO authenticated USING (true)
    $p$, v_schema);
  END IF;

  RAISE NOTICE 'evolution_tags created/verified in % schema', v_schema;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification: confirm all 8 tables now exist as physical tables in either
-- zapp or evo. Raises exception on partial-apply so the migration never commits
-- in a broken state.
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
      WHERE c.relname = t AND c.relkind IN ('r','p')
        AND n.nspname IN ('zapp','evo')
    ) THEN
      missing := missing || t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: tables still missing after migration: %',
      array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'OK: all 8 evolution_* tables verified in zapp or evo schema';
END $$;
