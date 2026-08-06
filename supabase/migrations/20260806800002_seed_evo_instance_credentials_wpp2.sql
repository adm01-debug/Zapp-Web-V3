-- Seed idempotente: evo.evolution_instance_credentials para instância 'wpp2'
-- ============================================================================
-- Contexto (FASE 2 auditoria, 2026-08-06):
--   A tabela estava vazia → fn_update_instance_health() executava UPDATE com
--   WHERE instance_name='wpp2' que afetava 0 rows — sem erro, sem log, sem efeito.
--   O pg_cron job 172 (evo-instance-health-check, */10min) ficava em no-op silencioso.
--
-- Solução: garantir que o registro de 'wpp2' exista antes do primeiro cron tick.
--
-- Credenciais:
--   api_url  → URL pública da Evolution API (não é segredo).
--   api_key  → Injetada via secrets management pós-deploy.
--              NUNCA armazenar o valor real neste repositório.
--              Preencher com o secret EVO_WPP2_API_KEY após deploy:
--
--   UPDATE evo.evolution_instance_credentials
--      SET api_key = '<EVO_WPP2_API_KEY>'
--    WHERE instance_name = 'wpp2' AND api_key = '';
--
--   Alternativa: bootstrap script no Portainer ou via pg_cron bootstrap job.
--
-- Idempotente: ON CONFLICT (instance_name) DO NOTHING — seguro para restore
-- e fresh-deploy. Em ambiente já configurado, o registro existente não é tocado.
-- ============================================================================

INSERT INTO evo.evolution_instance_credentials
  (instance_name, api_url, api_key, health_status, display_name, is_active)
VALUES
  (
    'wpp2',
    'https://evolution.atomicabr.com.br',
    '',          -- PREENCHER pós-deploy: UPDATE ... SET api_key = '<EVO_WPP2_API_KEY>' WHERE instance_name = 'wpp2' AND api_key = ''
    'unknown',
    'wpp2 (WhatsApp Principal)',
    true
  )
ON CONFLICT (instance_name) DO NOTHING;

COMMENT ON TABLE evo.evolution_instance_credentials IS
  'Credenciais e estado de saúde por instância Evolution. Preenchida via seed idempotente (20260806800000). api_key deve ser injetada pós-deploy via secrets management.';
