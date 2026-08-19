-- =============================================================================
-- Migration: zapp.rpc_e2e_cleanup() — contrato de limpeza dos dados E2E
--
-- Contexto (E2E-06, auditoria workflows 2026-08-06): scripts/cleanup-e2e-data.sh
-- e e2e/utils/supabase.ts chamam zapp.rpc_e2e_cleanup, mas a função NUNCA
-- existiu (0 definições no banco e no repo) → cleanup era no-op silencioso e
-- os dados E2E acumulam em produção (contatos 55119999999*, wpp2-test).
--
-- Convenção (seed-e2e-contacts.sql):
--   * name começa com 'E2E '
--   * email termina em '@zappweb.test'
--   * phone = 55119999999 + sufixo
--   * remote_jid = <phone>@s.whatsapp.net
--
-- Escopo da limpeza (idempotente, transacional):
--   1. zapp.messages / zapp.conversations por contact_id dos contatos E2E
--      (e por remote_jid da convenção, para linhas sem FK)
--   2. evo.evolution_messages por remote_jid da convenção + janela de 90 dias
--      (created_at no predicate → partition pruning; nunca varre produção toda)
--   3. zapp.contacts pela convenção
--
-- Segurança: SECURITY DEFINER com search_path fixo; sem EXECUTE para anon
-- (REVOKE de PUBLIC; GRANT a service_role e authenticated — o cleanup roda
-- via psql com service role e via REST com a chave do serviço).
--
-- Rollback: DROP FUNCTION zapp.rpc_e2e_cleanup();
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.rpc_e2e_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, evo, public
AS $$
DECLARE
  v_contacts      int := 0;
  v_conversations int := 0;
  v_messages      int := 0;
  v_evo_messages  int := 0;
  v_result        jsonb;
BEGIN
  -- Mensagens/Conversas do app (zapp) referenciando contatos E2E
  WITH e2e_contacts AS (
    SELECT id FROM zapp.contacts
     WHERE phone  LIKE '55119999999%'
        OR email  LIKE '%@zappweb.test'
        OR name   LIKE 'E2E %'
  )
  DELETE FROM zapp.messages
   WHERE contact_id IN (SELECT id FROM e2e_contacts)
      OR remote_jid LIKE '55119999999%@s.whatsapp.net';
  GET DIAGNOSTICS v_messages = ROW_COUNT;

  WITH e2e_contacts AS (
    SELECT id FROM zapp.contacts
     WHERE phone  LIKE '55119999999%'
        OR email  LIKE '%@zappweb.test'
        OR name   LIKE 'E2E %'
  )
  DELETE FROM zapp.conversations
   WHERE contact_id IN (SELECT id FROM e2e_contacts)
      OR remote_jid LIKE '55119999999%@s.whatsapp.net';
  GET DIAGNOSTICS v_conversations = ROW_COUNT;

  -- Mensagens da Evolution (particionada): janela 90 dias p/ partition pruning
  DELETE FROM evo.evolution_messages
   WHERE remote_jid LIKE '55119999999%@s.whatsapp.net'
     AND created_at  >= now() - interval '90 days';
  GET DIAGNOSTICS v_evo_messages = ROW_COUNT;

  -- Contatos da convenção E2E
  DELETE FROM zapp.contacts
   WHERE phone  LIKE '55119999999%'
      OR email  LIKE '%@zappweb.test'
      OR name   LIKE 'E2E %';
  GET DIAGNOSTICS v_contacts = ROW_COUNT;

  v_result := jsonb_build_object(
    'contacts_deleted',      v_contacts,
    'conversations_deleted', v_conversations,
    'messages_deleted',      v_messages,
    'evo_messages_deleted',  v_evo_messages
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_e2e_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_e2e_cleanup() TO service_role, authenticated;
