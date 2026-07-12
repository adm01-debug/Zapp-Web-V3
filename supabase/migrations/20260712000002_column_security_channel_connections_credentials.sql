-- ==========================================================================
-- SEGURANÇA: Restringir acesso colunar a credentials e config em
--            public.channel_connections para o role authenticated.
-- ==========================================================================
-- Problema (identificado na auditoria de segurança):
--   A policy "Authenticated users can view channels" concede FOR SELECT USING(true),
--   o que implica SELECT em TODAS as colunas, incluindo:
--     - credentials (jsonb) — tokens OAuth, API keys, segredos de integração
--     - config (jsonb) — parâmetros de configuração sensíveis
--
--   Qualquer agente autenticado pode executar:
--     SELECT credentials, config FROM public.channel_connections;
--   expondo credenciais de integração de todos os canais.
--
-- Solução: column-level privileges.
--   1. REVOKE SELECT em toda a tabela para authenticated
--   2. GRANT SELECT apenas nas colunas seguras (business-only, sem segredos)
--
-- Colunas SEGURAS (concedidas):
--   id, channel_type, name, status, webhook_url, is_active, created_by,
--   created_at, updated_at, whatsapp_connection_id, external_account_id,
--   external_page_id
--
-- Colunas SENSÍVEIS (negadas):
--   credentials — tokens/senhas de integrações externas
--   config      — parâmetros internos de configuração
--
-- Impacto em código existente:
--   - useOmnichannelChannels.ts já seleciona 'id, name, channel_type, status' ✓
--   - Queries sem colunas explícitas (SELECT *) passarão a falhar com
--     "permission denied for column credentials" — isso é intencional.
--   - Edge Functions e service_role NÃO são afetados (têm BYPASSRLS + superuser).
-- ==========================================================================

-- 1. Revogar SELECT irrestrito de authenticated na tabela pública
REVOKE SELECT ON public.channel_connections FROM authenticated;

-- 2. Conceder SELECT coluna a coluna nas colunas seguras
GRANT SELECT (
  id,
  channel_type,
  name,
  status,
  webhook_url,
  is_active,
  created_by,
  created_at,
  updated_at,
  whatsapp_connection_id,
  external_account_id,
  external_page_id
) ON public.channel_connections TO authenticated;

-- Nota: INSERT / UPDATE / DELETE permanecem controlados pela policy
-- "Admins can manage channels" (is_admin_or_supervisor) — sem alteração.

-- Verificação pós-apply:
-- SELECT column_name, privilege_type, grantee
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public' AND table_name = 'channel_connections'
--   AND grantee = 'authenticated'
-- ORDER BY column_name;
-- Esperado: id, channel_type, name, status, webhook_url, is_active, created_by,
--           created_at, updated_at, whatsapp_connection_id, external_account_id,
--           external_page_id — SEM credentials e SEM config.
