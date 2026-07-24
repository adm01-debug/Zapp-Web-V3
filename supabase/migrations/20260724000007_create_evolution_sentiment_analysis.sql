-- Creates zapp.evolution_sentiment_analysis if it does not already exist.
--
-- Context: The evolution-sentiment Edge Function has been writing to this table
-- since v2.0, but the CREATE TABLE migration was never committed (likely lost
-- during the Lovable Cloud → self-hosted migration). As a result every call
-- to saveAnalysis() was failing at the INSERT and throwing before reaching the
-- sentiment_alerts INSERT — meaning NO analysis records or alerts were ever
-- persisted in the self-hosted environment.
--
-- This migration is idempotent (CREATE TABLE IF NOT EXISTS) and safe to apply
-- against a database where the table already exists.

CREATE TABLE IF NOT EXISTS zapp.evolution_sentiment_analysis (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       UUID,
  conversation_id  UUID,
  contact_id       UUID,
  remote_jid       TEXT        NOT NULL,
  message_text     TEXT,
  sentiment        TEXT        NOT NULL DEFAULT 'neutral'
                               CHECK (sentiment IN ('positive','negative','neutral','mixed')),
  sentiment_score  NUMERIC     NOT NULL DEFAULT 0
                               CHECK (sentiment_score BETWEEN -1 AND 1),
  emotions         JSONB       NOT NULL DEFAULT '{}',
  intent           TEXT        NOT NULL DEFAULT 'geral',
  urgency          TEXT        NOT NULL DEFAULT 'low'
                               CHECK (urgency IN ('low','medium','high','critical')),
  keywords         TEXT[]      NOT NULL DEFAULT '{}',
  requires_attention BOOLEAN   NOT NULL DEFAULT false,
  model_used       TEXT        NOT NULL DEFAULT 'rule_based',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for the most common query patterns
CREATE INDEX IF NOT EXISTS idx_esa_remote_jid
  ON zapp.evolution_sentiment_analysis (remote_jid);
CREATE INDEX IF NOT EXISTS idx_esa_contact_id
  ON zapp.evolution_sentiment_analysis (contact_id)
  WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_esa_created_at
  ON zapp.evolution_sentiment_analysis (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esa_sentiment_urgency
  ON zapp.evolution_sentiment_analysis (sentiment, urgency)
  WHERE requires_attention = true;

-- RLS
ALTER TABLE zapp.evolution_sentiment_analysis ENABLE ROW LEVEL SECURITY;

-- Service role (edge functions) — unrestricted
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_sentiment_analysis'
      AND policyname = 'service_role_full_evolution_sentiment_analysis'
  ) THEN
    CREATE POLICY "service_role_full_evolution_sentiment_analysis"
      ON zapp.evolution_sentiment_analysis
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Authenticated users — read-only access to all records
-- (analysis data is workspace-internal; scoping by workspace_id is deferred
--  until the table accumulates a workspace_id FK in a follow-up migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp' AND tablename = 'evolution_sentiment_analysis'
      AND policyname = 'auth_read_evolution_sentiment_analysis'
  ) THEN
    CREATE POLICY "auth_read_evolution_sentiment_analysis"
      ON zapp.evolution_sentiment_analysis
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Add to supabase_realtime only if it is a physical table (relkind 'r' or 'p')
-- and not already in the publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename  = 'evolution_sentiment_analysis'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'evolution_sentiment_analysis'
      AND c.relkind IN ('r', 'p')
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.evolution_sentiment_analysis;
    RAISE NOTICE 'ADDED zapp.evolution_sentiment_analysis to supabase_realtime';
  END IF;
END $$;
