-- ==========================================================================
-- MELHORIA #4: Triggers updated_at faltando em 4 tabelas zapp
-- ==========================================================================
-- Problema: as tabelas abaixo possuem coluna updated_at mas nao tinham
-- trigger BEFORE UPDATE para auto-atualizar o valor. Isso causava
-- desincronizacao entre a hora real de modificacao e o valor armazenado,
-- tornando queries de sincronizacao (updated_at > ?) inconfiaveis.
--
-- Fix: criar triggers usando public.handle_updated_at() (Supabase padrao).
-- ==========================================================================

CREATE TRIGGER trg_zapp_agent_presence_updated_at
  BEFORE UPDATE ON zapp.agent_presence
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_zapp_inbox_custom_scopes_updated_at
  BEFORE UPDATE ON zapp.inbox_custom_scopes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_zapp_sla_delivery_rules_updated_at
  BEFORE UPDATE ON zapp.sla_delivery_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_zapp_whisper_files_updated_at
  BEFORE UPDATE ON zapp.whisper_files
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Verificacao pos-apply:
-- SELECT trigger_name, event_object_table FROM information_schema.triggers
-- WHERE trigger_schema = 'zapp'
-- AND event_object_table IN ('agent_presence','inbox_custom_scopes','sla_delivery_rules','whisper_files')
-- ORDER BY event_object_table;
-- Esperado: 4 linhas (uma por tabela)
