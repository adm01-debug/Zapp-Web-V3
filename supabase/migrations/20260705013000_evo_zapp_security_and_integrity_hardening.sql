-- Sessão 7 (2026-07-05) — Auditoria exaustiva Evolution API + banco.
-- Registra (idempotente) as correções de segurança/integridade aplicadas ao vivo
-- no Supabase self-hosted (projeto zapp) durante a auditoria. Ver
-- docs/EVOLUTION_API_AUDIT_2026-07-05_sessao7.md para o relatório completo.
-- (Renomeada de "sessao6" para "sessao7" por colidir com o nome de arquivo de
-- outra sessão de auditoria paralela já mergeada via PR #193 — ver nota no topo
-- do relatório sessao7 sobre como os dois conjuntos de fixes se complementam.)

-- =============================================================================
-- 1) zapp.whatsapp_connections: mascarar qr_code/instance_id/evo_instance_id
--    para não-admin (a view repassava esses campos sem mascara nenhuma,
--    diferente do padrão já usado em public.whatsapp_connections_safe).
--    security_invoker=true explícito: CREATE OR REPLACE VIEW não preserva
--    reloptions de uma definição anterior (confirmado ao vivo: reloptions
--    ficou NULL após o replace inicial sem esta linha), e as demais views
--    zapp.* do projeto seguem essa convenção (ver
--    supabase/migrations/20260701120000_finalizacao_sync_zapp.sql).
--    has_role qualificado com schema para não depender de search_path.
-- =============================================================================
CREATE OR REPLACE VIEW zapp.whatsapp_connections AS
 SELECT whatsapp_connections.id,
    whatsapp_connections.name,
    whatsapp_connections.phone_number,
    whatsapp_connections.instance_name,
        CASE
            WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN whatsapp_connections.instance_id
            ELSE NULL::text
        END AS instance_id,
    whatsapp_connections.api_url,
    whatsapp_connections.status,
        CASE
            WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN whatsapp_connections.qr_code
            ELSE NULL::text
        END AS qr_code,
    whatsapp_connections.is_active,
    whatsapp_connections.is_default,
    whatsapp_connections.webhook_url,
    whatsapp_connections.settings,
    whatsapp_connections.last_connected_at,
    whatsapp_connections.connected_at,
    whatsapp_connections.disconnected_at,
    whatsapp_connections.created_at,
    whatsapp_connections.updated_at,
    whatsapp_connections.api_type,
    whatsapp_connections.battery_level,
    whatsapp_connections.created_by,
    whatsapp_connections.degraded_at,
    whatsapp_connections.farewell_enabled,
    whatsapp_connections.farewell_message,
    whatsapp_connections.health_reason,
    whatsapp_connections.health_response_ms,
    whatsapp_connections.health_status,
    whatsapp_connections.is_plugged,
    whatsapp_connections.last_health_check,
    whatsapp_connections.max_retries,
    whatsapp_connections.owner_jid,
    whatsapp_connections.retry_count,
    whatsapp_connections.routing_mode,
    whatsapp_connections.auto_reconnect_enabled,
    whatsapp_connections.loop_protection_active,
    whatsapp_connections.max_reconnect_attempts,
    whatsapp_connections.reconnect_interval_seconds,
        CASE
            WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN whatsapp_connections.evo_instance_id
            ELSE NULL::text
        END AS evo_instance_id
   FROM public.whatsapp_connections;

ALTER VIEW zapp.whatsapp_connections SET (security_invoker = true);

-- Nota de follow-up (não aplicado aqui): public.whatsapp_connections (tabela base)
-- ainda tem policy wconn_select_auth USING(true) para 'authenticated', ou seja
-- quem consultar a tabela base diretamente (em vez da view acima ou de
-- whatsapp_connections_safe) continua vendo qr_code/instance_id em claro.
-- Restringir isso exige revisar todos os call-sites que hoje leem a base direto.

-- =============================================================================
-- 2) evo.evolution_instance_credentials: continha 3 policies com
--    qual=(auth.uid() IS NOT NULL) para role 'public', expondo api_key a
--    qualquer usuário autenticado. Restringe a service_role apenas.
-- =============================================================================
DROP POLICY IF EXISTS evo_cred_all ON evo.evolution_instance_credentials;
DROP POLICY IF EXISTS evo_creds_modify ON evo.evolution_instance_credentials;
DROP POLICY IF EXISTS evo_creds_select ON evo.evolution_instance_credentials;

DROP POLICY IF EXISTS evo_creds_service_role_only ON evo.evolution_instance_credentials;
CREATE POLICY evo_creds_service_role_only ON evo.evolution_instance_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- 3) zapp.channel_connections: policy channel_conn_select (qual=true) expunha
--    TODAS as colunas, incluindo credentials/config (tokens de integração), a
--    qualquer authenticated. Revoga grant de coluna nessas duas e mantém as
--    demais (a tabela já tem RLS por role para INSERT/UPDATE/DELETE, ver
--    supabase/migrations/20260705000002_rls_channel_connections_scoped.sql).
-- =============================================================================
REVOKE SELECT ON zapp.channel_connections FROM authenticated;
GRANT SELECT (
  id, channel_type, name, status, is_active, external_account_id,
  external_page_id, webhook_url, whatsapp_connection_id, created_at,
  updated_at, created_by
) ON zapp.channel_connections TO authenticated;
-- credentials/config permanecem sem SELECT grant para authenticated.
-- service_role mantém acesso total: já possui GRANT explícito (SELECT/INSERT/
-- UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER, confirmado em
-- information_schema.role_table_grants) nesta tabela, independente do
-- BYPASSRLS do role — o REVOKE acima só atinge 'authenticated'.

-- =============================================================================
-- 4) Integridade referencial: department_id em profiles/queues/
--    automation_rules/automation_executions seguia convenção de nome sem FK
--    enforced para departments(id). 0 órfãos confirmados antes de aplicar.
--    Nota: profiles é BASE TABLE em public; queues/automation_rules/
--    automation_executions são BASE TABLE em zapp (public.* são views finas)
--    — ver ADR de direção tabela-real/view a criar como follow-up.
-- =============================================================================
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_department_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_department_id_fkey;

ALTER TABLE zapp.queues
  DROP CONSTRAINT IF EXISTS queues_department_id_fkey;
ALTER TABLE zapp.queues
  ADD CONSTRAINT queues_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE zapp.queues VALIDATE CONSTRAINT queues_department_id_fkey;

ALTER TABLE zapp.automation_rules
  DROP CONSTRAINT IF EXISTS automation_rules_department_id_fkey;
ALTER TABLE zapp.automation_rules
  ADD CONSTRAINT automation_rules_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE zapp.automation_rules VALIDATE CONSTRAINT automation_rules_department_id_fkey;

ALTER TABLE zapp.automation_executions
  DROP CONSTRAINT IF EXISTS automation_executions_department_id_fkey;
ALTER TABLE zapp.automation_executions
  ADD CONSTRAINT automation_executions_department_id_fkey
  FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE zapp.automation_executions VALIDATE CONSTRAINT automation_executions_department_id_fkey;

-- =============================================================================
-- 5) zapp.messages_whatsapp_deprecated: tabela órfã (0 linhas, nenhuma view/
--    função referenciando), residual da migração messages -> evo.evolution_messages.
--    Arquivada antes de dropar (convenção já usada no schema 'archive').
--    Bloco protegido para ser seguro em re-run (ambiente onde a tabela já foi
--    removida numa execução anterior desta mesma migration) e portável para
--    ambientes novos onde o schema 'archive' ainda não exista.
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS archive;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'zapp' AND table_name = 'messages_whatsapp_deprecated'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'archive' AND table_name = 'messages_whatsapp_deprecated_backup_20260705'
    ) THEN
      EXECUTE 'CREATE TABLE archive.messages_whatsapp_deprecated_backup_20260705 '
        || '(LIKE zapp.messages_whatsapp_deprecated INCLUDING ALL)';
      EXECUTE 'INSERT INTO archive.messages_whatsapp_deprecated_backup_20260705 '
        || 'SELECT * FROM zapp.messages_whatsapp_deprecated';
    END IF;
    EXECUTE 'DROP TABLE zapp.messages_whatsapp_deprecated';
  END IF;
END $$;
