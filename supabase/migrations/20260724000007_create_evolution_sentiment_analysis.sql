-- Creates the physical evolution_sentiment_analysis table in the correct schema.
--
-- Context: The evolution-sentiment Edge Function writes to this table since v2.0,
-- but the CREATE TABLE migration was never committed (likely lost during the
-- Lovable Cloud → self-hosted migration). As a result every call to saveAnalysis()
-- fails at the INSERT and throws before reaching the sentiment_alerts INSERT —
-- meaning NO analysis records or alerts were ever persisted in the self-hosted env.
--
-- Schema detection:
--   On the self-hosted production instance, zapp.evolution_sentiment_analysis
--   already exists as an auto-updatable VIEW proxy for the physical table that
--   belongs in the evo schema (consistent with all other evolution_* tables).
--   On a fresh install without the view the physical table is created directly
--   in zapp.
--
--   Runtime detection (relkind 'v' = view → evo schema; anything else → zapp):
--     - If VIEW exists: physical table created in evo; the proxy view works automatically
--     - If no relation:  physical table created in zapp (view never needed)
--     - If TABLE exists: CREATE TABLE IF NOT EXISTS is a no-op; indexes are guarded
--
-- This migration is idempotent and safe to apply against any state.

DO $$
DECLARE
  v_schema  TEXT;
  v_relkind CHAR;
BEGIN
  -- Detect existing relation kind for zapp.evolution_sentiment_analysis
  SELECT c.relkind INTO v_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relname = 'evolution_sentiment_analysis';

  IF v_relkind = 'v' THEN
    -- VIEW proxy already exists in zapp → physical table belongs in evo schema
    v_schema := 'evo';
    RAISE NOTICE 'zapp.evolution_sentiment_analysis is a VIEW proxy — creating physical table in evo schema';
  ELSE
    -- No relation or already a physical table: use zapp
    v_schema := 'zapp';
  END IF;

  -- ── Physical table ────────────────────────────────────────────────────────
  EXECUTE format(
    $sql$
    CREATE TABLE IF NOT EXISTS %I.evolution_sentiment_analysis (
      id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id         UUID,
      conversation_id    UUID,
      contact_id         UUID,
      remote_jid         TEXT        NOT NULL,
      instance_name      TEXT        NOT NULL DEFAULT '',
      message_text       TEXT,
      sentiment          TEXT        NOT NULL DEFAULT 'neutral'
                                     CHECK (sentiment IN ('positive','negative','neutral','mixed')),
      sentiment_score    NUMERIC     NOT NULL DEFAULT 0
                                     CHECK (sentiment_score BETWEEN -1 AND 1),
      emotions           JSONB       NOT NULL DEFAULT '{}'::JSONB,
      intent             TEXT        NOT NULL DEFAULT 'geral',
      urgency            TEXT        NOT NULL DEFAULT 'low'
                                     CHECK (urgency IN ('low','medium','high','critical')),
      keywords           TEXT[]      NOT NULL DEFAULT '{}'::TEXT[],
      requires_attention BOOLEAN     NOT NULL DEFAULT false,
      model_used         TEXT        NOT NULL DEFAULT 'rule_based',
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    $sql$,
    v_schema
  );

  -- ── Indexes (guarded by IF NOT EXISTS in PG 9.5+) ────────────────────────
  -- remote_jid is the primary filter in every query from the edge function
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_esa_remote_jid ON %I.evolution_sentiment_analysis (remote_jid)',
    v_schema
  );
  -- contact_id is nullable; partial index avoids index bloat from NULLs
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_esa_contact_id ON %I.evolution_sentiment_analysis (contact_id) WHERE contact_id IS NOT NULL',
    v_schema
  );
  -- Recency queries (metrics endpoint: created_at >= since)
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_esa_created_at ON %I.evolution_sentiment_analysis (created_at DESC)',
    v_schema
  );
  -- Alert candidates: negative + high/critical urgency
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_esa_sentiment_urgency ON %I.evolution_sentiment_analysis (sentiment, urgency) WHERE requires_attention = true',
    v_schema
  );
  -- Tenant scoping: instance_name for workspace-isolated queries
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_esa_instance_name ON %I.evolution_sentiment_analysis (instance_name)',
    v_schema
  );

  -- ── Table privileges ─────────────────────────────────────────────────────
  -- SQL-level GRANTs are required in addition to RLS policies.
  -- Without them, even USING(true) policies result in "permission denied"
  -- at the privilege check before RLS runs (especially true in evo schema).
  EXECUTE format('GRANT ALL ON TABLE %I.evolution_sentiment_analysis TO service_role', v_schema);
  EXECUTE format('GRANT SELECT ON TABLE %I.evolution_sentiment_analysis TO authenticated', v_schema);

  -- ── RLS ──────────────────────────────────────────────────────────────────
  EXECUTE format(
    'ALTER TABLE %I.evolution_sentiment_analysis ENABLE ROW LEVEL SECURITY',
    v_schema
  );

  -- Service role (edge functions) — unrestricted
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_sentiment_analysis'
      AND policyname = 'service_role_full_evolution_sentiment_analysis'
  ) THEN
    EXECUTE format(
      $p$
      CREATE POLICY "service_role_full_evolution_sentiment_analysis"
        ON %I.evolution_sentiment_analysis
        FOR ALL TO service_role USING (true) WITH CHECK (true)
      $p$,
      v_schema
    );
  END IF;

  -- Authenticated users — read only rows they own (via workspace → instance_name)
  -- Drop stale blanket policy if it exists from a prior apply
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = v_schema AND tablename = 'evolution_sentiment_analysis'
      AND policyname = 'auth_read_evolution_sentiment_analysis'
  ) THEN
    EXECUTE format(
      'DROP POLICY "auth_read_evolution_sentiment_analysis" ON %I.evolution_sentiment_analysis',
      v_schema
    );
  END IF;
  EXECUTE format(
    $pol$
    CREATE POLICY "auth_read_evolution_sentiment_analysis"
      ON %I.evolution_sentiment_analysis
      FOR SELECT TO authenticated
      USING (
        instance_name IN (
          SELECT wc.instance_name
          FROM zapp.whatsapp_connections wc
          INNER JOIN zapp.workspace_members wm ON wm.workspace_id = wc.workspace_id
          WHERE wm.user_id = auth.uid()
        )
      )
    $pol$,
    v_schema
  );

  RAISE NOTICE 'evolution_sentiment_analysis created/verified in % schema', v_schema;
END $$;

-- ── supabase_realtime ─────────────────────────────────────────────────────────
-- Add to the publication only if the physical table exists and is not already
-- subscribed. Works for both zapp and evo physical placements.
DO $$
DECLARE
  v_schema TEXT;
BEGIN
  -- Locate the physical table (relkind 'r' or 'p')
  SELECT n.nspname INTO v_schema
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'evolution_sentiment_analysis'
    AND c.relkind IN ('r','p')
    AND n.nspname IN ('zapp','evo')
  LIMIT 1;

  IF v_schema IS NULL THEN
    RAISE NOTICE 'SKIP realtime — evolution_sentiment_analysis physical table not found';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = v_schema
      AND tablename  = 'evolution_sentiment_analysis'
  ) THEN
    RAISE NOTICE 'SKIP realtime — %.evolution_sentiment_analysis already in supabase_realtime', v_schema;
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER PUBLICATION supabase_realtime ADD TABLE %I.evolution_sentiment_analysis',
    v_schema
  );
  RAISE NOTICE 'ADDED %.evolution_sentiment_analysis to supabase_realtime', v_schema;
END $$;
