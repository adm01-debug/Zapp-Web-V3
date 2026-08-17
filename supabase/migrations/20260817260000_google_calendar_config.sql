-- 20260817260000 — Contrato Google Calendar REAL desligado (config singleton)
-- =============================================================================
-- Contexto (2026-08-17, G1): a UI de integração Google Calendar exibia estado
-- falso ("Conectado"/toast de sucesso) sem backend real. Este contrato torna o
-- estado HONESTO: a integração só fica ativa quando existir linha de config
-- nesta tabela com enabled=true.
--
-- Contrato da edge zapp-google-calendar-sync (SEMPRE 200, nunca 500):
--   sem linha de config        → { synced: false, reason: 'not_configured' }
--   config com enabled=false   → { synced: false, reason: 'disabled' }
--   config com enabled=true    → { synced: false, reason: 'not_implemented' }
--   falha interna              → { synced: false, reason: 'error' }
--
-- Singleton (id = 1): uma única configuração de integração por ambiente.
-- credentials_json guarda o service account (secret) — nunca exposto via RLS;
-- leitura admin/supervisor, escrita apenas service_role (bypassa RLS).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_google_calendar_config_touch ON zapp.google_calendar_config;
--   DROP TABLE IF EXISTS zapp.google_calendar_config;

BEGIN;

CREATE TABLE IF NOT EXISTS zapp.google_calendar_config (
  id               smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled          boolean NOT NULL DEFAULT false,
  calendar_id      text,
  credentials_json jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE zapp.google_calendar_config IS
  'Configuração da integração Google Calendar (singleton id=1). Sem linha = integração desligada (contrato G1).';

-- ── RLS: leitura admin/supervisor; escrita só service_role ──────────────────
ALTER TABLE zapp.google_calendar_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS google_calendar_config_admin_select ON zapp.google_calendar_config;
CREATE POLICY google_calendar_config_admin_select ON zapp.google_calendar_config
  FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- ── Grants (lição incidente PR #668: policy sem GRANT = 403) ────────────────
GRANT SELECT ON zapp.google_calendar_config TO authenticated;
GRANT ALL ON zapp.google_calendar_config TO service_role;
GRANT EXECUTE ON FUNCTION zapp.is_admin_or_supervisor(uuid) TO authenticated;

-- ── updated_at (função compartilhada zapp.set_updated_at) ───────────────────
DROP TRIGGER IF EXISTS trg_google_calendar_config_touch ON zapp.google_calendar_config;
CREATE TRIGGER trg_google_calendar_config_touch
  BEFORE UPDATE ON zapp.google_calendar_config
  FOR EACH ROW EXECUTE FUNCTION zapp.set_updated_at();

COMMIT;
