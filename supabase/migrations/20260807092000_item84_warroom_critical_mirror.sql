-- ============================================================================
-- warroom_alerts table + mirror de criticals para ops + cron (item 84)
-- ============================================================================
-- Tipo: DDL + pg_cron
--
-- CONTEXTO (item 84 do checklist de auditoria):
--   A tabela zapp.warroom_alerts centraliza alertas operacionais do sistema.
--   O enum zapp.warroom_alert_type classifica: info, warning, critical,
--   sla_breach. Alertas críticos são espelhados para o schema ops via
--   a função ops.fn_mirror_warroom_criticals (executada a cada 5 min).
--
--   O espelhamento permite que scripts externos (monitoramento de infraestrutura)
--   consumam alertas críticos sem acesso direto ao schema zapp.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Enum warroom_alert_type (idempotente)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE TYPE zapp.warroom_alert_type AS ENUM (
    'info', 'warning', 'critical', 'sla_breach'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Tabela principal zapp.warroom_alerts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS zapp.warroom_alerts (
  id              uuid                         DEFAULT gen_random_uuid(),
  alert_type      zapp.warroom_alert_type      NOT NULL,
  title           text                         NOT NULL,
  message         text                         NOT NULL,
  source          text,
  entity          text,
  severity        varchar(20)                  DEFAULT 'medium',
  created_at      timestamptz                  DEFAULT now(),
  is_read         boolean                      DEFAULT false,
  dismissed_by    uuid,
  resolved_at     timestamptz,
  resolved_reason text,

  CONSTRAINT warroom_alerts_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_warroom_alerts_unread
  ON zapp.warroom_alerts (created_at DESC)
  WHERE is_read = false AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_warroom_alerts_type_created
  ON zapp.warroom_alerts (alert_type, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Permissões
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE zapp.warroom_alerts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE zapp.warroom_alerts TO authenticated;
GRANT ALL ON TABLE zapp.warroom_alerts TO service_role, postgres;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Cron job — mirror de criticals a cada 5 min
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'mirror-warroom-criticals',
  '5,20,35,50 * * * *',
  'SELECT ops.fn_mirror_warroom_criticals()'
) ON CONFLICT (jobname) DO NOTHING;
