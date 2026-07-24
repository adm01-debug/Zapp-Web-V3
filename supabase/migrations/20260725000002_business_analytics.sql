-- Tabela de Analytics de Negócio
-- Migration: 20260725000002_business_analytics.sql
--
-- Armazena eventos de tracking de negócio:
-- - Mensagens (sent/received)
-- - Tempos de resposta (response_time)
-- - Engagement de contatos (engagement)
-- - Conversões de campanhas (conversion)
-- - Performance de agents (agent_performance)

CREATE TABLE IF NOT EXISTS zapp.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN (
    'message', 'contact', 'campaign', 'agent_performance',
    'engagement', 'conversion', 'response_time'
  )),
  action text NOT NULL,
  label text,
  value numeric,
  metadata jsonb DEFAULT '{}',
  user_id uuid REFERENCES zapp.profiles(user_id),
  workspace_id uuid REFERENCES zapp.workspaces(id),
  timestamp timestamptz DEFAULT NOW() NOT NULL,
  created_at timestamptz DEFAULT NOW() NOT NULL
);

-- Índices otimizados para queries de analytics
CREATE INDEX IF NOT EXISTS idx_analytics_events_category
  ON zapp.analytics_events (category, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_action
  ON zapp.analytics_events (action, timestamp DESC)
  WHERE timestamp > NOW() - INTERVAL '90 days';

CREATE INDEX IF NOT EXISTS idx_analytics_events_workspace
  ON zapp.analytics_events (workspace_id, timestamp DESC)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_user
  ON zapp.analytics_events (user_id, timestamp DESC)
  WHERE user_id IS NOT NULL;

-- Índice GIN para metadata search
CREATE INDEX IF NOT EXISTS idx_analytics_events_metadata_gin
  ON zapp.analytics_events USING gin (metadata);

-- RLS
ALTER TABLE zapp.analytics_events ENABLE ROW LEVEL SECURITY;

-- Service role pode inserir (batch)
CREATE POLICY "Service role can insert analytics"
  ON zapp.analytics_events FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role pode ler tudo (aggregator)
CREATE POLICY "Service role can read all analytics"
  ON zapp.analytics_events FOR SELECT
  TO service_role
  USING (true);

-- Authenticated users podem ler apenas seu workspace
CREATE POLICY "Users can read workspace analytics"
  ON zapp.analytics_events FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM zapp.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Authenticated users podem ler apenas seus próprios eventos
CREATE POLICY "Users can read own analytics"
  ON zapp.analytics_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Grants
GRANT SELECT ON zapp.analytics_events TO authenticated;
GRANT INSERT ON zapp.analytics_events TO service_role;

-- Function helper para agregar analytics
CREATE OR REPLACE FUNCTION zapp.get_analytics_summary(
  p_workspace_id uuid,
  p_from_timestamp timestamptz DEFAULT NOW() - INTERVAL '30 days',
  p_to_timestamp timestamptz DEFAULT NOW()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
STABLE
AS $$
DECLARE
  v_summary jsonb;
  v_total_events bigint;
  v_by_category jsonb;
BEGIN
  -- Total events
  SELECT COUNT(*) INTO v_total_events
  FROM zapp.analytics_events
  WHERE workspace_id = p_workspace_id
  AND timestamp BETWEEN p_from_timestamp AND p_to_timestamp;

  -- Events by category
  SELECT jsonb_object_agg(category, count) INTO v_by_category
  FROM (
    SELECT category, COUNT(*) as count
    FROM zapp.analytics_events
    WHERE workspace_id = p_workspace_id
    AND timestamp BETWEEN p_from_timestamp AND p_to_timestamp
    GROUP BY category
  ) sub;

  -- Build summary
  v_summary := jsonb_build_object(
    'workspace_id', p_workspace_id,
    'period', jsonb_build_object(
      'from', p_from_timestamp,
      'to', p_to_timestamp
    ),
    'total_events', v_total_events,
    'by_category', COALESCE(v_by_category, '{}'::jsonb)
  );

  RETURN v_summary;
END;
$$;

-- Analyze
ANALYZE zapp.analytics_events;
