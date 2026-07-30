-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: AI Agents table
--
-- Stores AI agent definitions managed via useAgents.ts.
-- Distinct from human agents (profiles); these are autonomous AI workers.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Status enum ───────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.agent_lifecycle_status AS ENUM (
    'draft', 'configured', 'testing', 'staging', 'review',
    'production', 'monitoring', 'deprecated', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agents (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  workspace_id      UUID,
  name              TEXT        NOT NULL,
  mission           TEXT,
  persona           TEXT,
  avatar_emoji      TEXT        NOT NULL DEFAULT '🤖',
  avatar_url        TEXT,
  model             TEXT,
  status            TEXT        NOT NULL DEFAULT 'draft'
                    CONSTRAINT agents_status_check
                    CHECK (status IN (
                      'draft','configured','testing','staging','review',
                      'production','monitoring','deprecated','archived'
                    )),
  version           INTEGER     NOT NULL DEFAULT 1,
  config            JSONB       NOT NULL DEFAULT '{}',
  tags              TEXT[]      NOT NULL DEFAULT '{}',
  is_template       BOOLEAN     NOT NULL DEFAULT false,
  template_category TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_agents_workspace_id ON public.agents (workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_status       ON public.agents (status);
CREATE INDEX IF NOT EXISTS idx_agents_user_id      ON public.agents (user_id);
CREATE INDEX IF NOT EXISTS idx_agents_is_template  ON public.agents (is_template) WHERE is_template = true;

-- ── Auto-update updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agents_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.agents_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read agents (templates are public; own/workspace agents are visible)
CREATE POLICY "Authenticated users can read agents"
  ON public.agents FOR SELECT TO authenticated
  USING (
    is_template = true
    OR user_id = auth.uid()
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- Admins/supervisors can insert/update/delete any agent
CREATE POLICY "Admins can manage all agents"
  ON public.agents FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- Owners can manage their own agents
CREATE POLICY "Owners can manage own agents"
  ON public.agents FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role full access
GRANT ALL ON public.agents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
