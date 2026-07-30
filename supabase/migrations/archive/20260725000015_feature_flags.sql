-- Tabela de Feature Flags no DB
-- Migration: 20260725000003_feature_flags.sql

CREATE TABLE IF NOT EXISTS zapp.feature_flags (
  key text PRIMARY KEY,
  enabled boolean DEFAULT false,
  rollout_percentage integer DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  allowed_roles text[] DEFAULT '{}',
  allowed_user_ids uuid[] DEFAULT '{}',
  blocked_user_ids uuid[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

-- RLS
ALTER TABLE zapp.feature_flags ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read flags
CREATE POLICY "Authenticated can read flags"
  ON zapp.feature_flags FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can write
CREATE POLICY "Admins can manage flags"
  ON zapp.feature_flags FOR ALL
  TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

-- Realtime (para atualizações instantâneas)
ALTER PUBLICATION supabase_realtime ADD TABLE zapp.feature_flags;

-- Função para verificar se flag está habilitada para um user
CREATE OR REPLACE FUNCTION zapp.is_feature_enabled(
  p_flag_key text,
  p_user_id uuid DEFAULT NULL,
  p_user_role text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp, public
AS $$
DECLARE
  v_flag zapp.feature_flags%ROWTYPE;
  v_hash bigint;
BEGIN
  SELECT * INTO v_flag FROM zapp.feature_flags WHERE key = p_flag_key;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Master switch
  IF NOT v_flag.enabled THEN
    RETURN false;
  END IF;

  -- Expiry check
  IF v_flag.expires_at IS NOT NULL AND v_flag.expires_at < now() THEN
    RETURN false;
  END IF;

  -- Block list check
  IF p_user_id IS NOT NULL AND p_user_id = ANY(v_flag.blocked_user_ids) THEN
    RETURN false;
  END IF;

  -- User allowlist check
  IF p_user_id IS NOT NULL AND p_user_id = ANY(v_flag.allowed_user_ids) THEN
    RETURN true;
  END IF;

  -- Role check
  IF p_user_role IS NOT NULL AND p_user_role = ANY(v_flag.allowed_roles) THEN
    RETURN true;
  END IF;

  -- Rollout percentage check
  IF v_flag.rollout_percentage > 0 AND v_flag.rollout_percentage < 100 AND p_user_id IS NOT NULL THEN
    -- Hash user_id to bucket 0-99
    v_hash := abs(hashtext(p_user_id::text)) % 100;
    IF v_hash < v_flag.rollout_percentage THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  -- If rollout is 100%, enable for everyone
  IF v_flag.rollout_percentage = 100 THEN
    RETURN true;
  END IF;

  -- Default: disabled if no rules matched
  RETURN false;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION zapp.is_feature_enabled TO authenticated;

-- Seed initial flags
INSERT INTO zapp.feature_flags (key, enabled, rollout_percentage, allowed_roles, metadata) VALUES
  ('new_inbox', true, 25, ARRAY['admin', 'supervisor'], '{"description": "Novo layout de inbox"}'::jsonb),
  ('ai_suggestions_v2', true, 50, ARRAY['agent', 'supervisor', 'admin'], '{"description": "Sugestões de IA v2"}'::jsonb),
  ('campaigns_bulk', true, 100, ARRAY['admin', 'supervisor'], '{"description": "Campanhas em massa"}'::jsonb),
  ('realtime_metrics', true, 100, ARRAY[]::text[], '{"description": "Métricas em tempo real"}'::jsonb),
  ('voice_transcription', true, 80, ARRAY[]::text[], '{"description": "Transcrição de áudio com IA"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION zapp.update_feature_flag_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS feature_flags_updated_at ON zapp.feature_flags;
CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON zapp.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION zapp.update_feature_flag_timestamp();
