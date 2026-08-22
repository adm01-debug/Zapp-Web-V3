-- 20260821010000 — fix_user_settings_missing_sla_simulation_columns
-- =============================================================================
-- BUG (achado ao investigar log de console de produção 2026-08-21T21:21Z):
-- src/hooks/useUserSettings.ts:saveSettings() sempre envia
-- global_sla_warning_minutes, global_sla_critical_minutes,
-- global_sla_notification_message e simulation_mode_enabled no upsert de
-- zapp.user_settings — mas essas 4 colunas nunca existiram na tabela.
-- PostgREST rejeita o UPSERT inteiro quando o payload referencia coluna
-- ausente do schema cache:
--   "Could not find the 'global_sla_critical_minutes' column of
--    'user_settings' in the schema cache" — 400 em
--   POST .../user_settings?on_conflict=user_id
--
-- IMPACTO REAL: como o upsert é uma única linha/um único payload, a falha é
-- atômica — NENHUMA configuração de usuário salva (voz/velocidade TTS,
-- horário comercial, modo silencioso, sons por categoria, etc.), mesmo
-- quando o campo alterado pelo usuário não tem nada a ver com SLA. O ponto
-- de entrada mais comum em produção é ChatPanel.tsx (troca de voz/velocidade
-- do TTS dispara saveSettings() com debounce de 500ms), o que também gerou
-- uma tempestade de POSTs 400 repetidos (um a cada nova tentativa do
-- usuário) contribuindo para a saturação de fila do cliente Supabase
-- registrada no mesmo incidente.
--
-- Confirmado ao vivo via supabase_db_describe_table(zapp.user_settings) em
-- 2026-08-21: as 4 colunas realmente não existem no banco de produção,
-- embora o contrato do frontend (useUserSettings.ts e
-- useSettingsManagement.ts) dependa delas desde antes desta migration.
--
-- FIX: adicionar as colunas faltantes com os mesmos defaults usados no
-- DEFAULT_SETTINGS do frontend, para que linhas já existentes leiam um
-- valor coerente assim que a coluna aparecer (sem exigir novo save do
-- usuário para "curar" o registro).

ALTER TABLE zapp.user_settings
  ADD COLUMN IF NOT EXISTS simulation_mode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS global_sla_warning_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS global_sla_critical_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS global_sla_notification_message text NOT NULL
    DEFAULT 'Alerta SLA: Tempo limite excedido para resposta.';

COMMENT ON COLUMN zapp.user_settings.simulation_mode_enabled IS
  'Flag booleana "simulation mode enabled" (modo de simulação/demo do app).';
COMMENT ON COLUMN zapp.user_settings.global_sla_warning_minutes IS
  'Limiar em minutos para alerta de SLA em nível "warning" (atraso de resposta).';
COMMENT ON COLUMN zapp.user_settings.global_sla_critical_minutes IS
  'Limiar em minutos para alerta de SLA em nível "critical" (atraso de resposta).';
COMMENT ON COLUMN zapp.user_settings.global_sla_notification_message IS
  'Mensagem automática configurada (texto) exibida na notificação de estouro de SLA.';

-- PostgREST self-hosted: o event trigger padrão do Supabase já recarrega o
-- schema cache em DDL, mas o NOTIFY manual elimina qualquer janela residual
-- de 400 entre o ALTER TABLE e o reload automático.
NOTIFY pgrst, 'reload schema';
