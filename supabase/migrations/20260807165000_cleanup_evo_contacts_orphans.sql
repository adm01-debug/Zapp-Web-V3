-- =============================================================================
-- Migration: rpc_e2e_cleanup v2 — varre também evo.evolution_contacts
--
-- Contexto (2026-08-07): o seed de contatos E2E espelha zapp.contacts →
-- evo.evolution_contacts (trigger/mirror). A v1 do rpc_e2e_cleanup
-- (20260807140000) limpava zapp + evo.evolution_messages, mas NÃO
-- evo.evolution_contacts → 5 JIDs órfãos (55119999999XX@s.whatsapp.net)
-- bloqueavam o re-seed com unique violation
-- (evolution_contacts_remote_jid_unique).
--
-- Fix: CREATE OR REPLACE da função (corpo final completo) com a varredura
-- adicional de evo.evolution_contacts na mesma janela de 90 dias
-- (partition pruning por created_at onde aplicável).
--
-- Rollback: reaplicar o corpo da 20260807140000.
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
  v_evo_contacts  int := 0;
  v_result        jsonb;
BEGIN
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

  DELETE FROM evo.evolution_messages
   WHERE remote_jid LIKE '55119999999%@s.whatsapp.net'
     AND created_at  >= now() - interval '90 days';
  GET DIAGNOSTICS v_evo_messages = ROW_COUNT;

  -- v2: mirror evo.evolution_contacts (bloqueava o re-seed — unique constraint)
  DELETE FROM evo.evolution_contacts
   WHERE remote_jid LIKE '55119999999%@s.whatsapp.net'
     AND created_at  >= now() - interval '90 days';
  GET DIAGNOSTICS v_evo_contacts = ROW_COUNT;

  DELETE FROM zapp.contacts
   WHERE phone  LIKE '55119999999%'
      OR email  LIKE '%@zappweb.test'
      OR name   LIKE 'E2E %';
  GET DIAGNOSTICS v_contacts = ROW_COUNT;

  v_result := jsonb_build_object(
    'contacts_deleted',      v_contacts,
    'conversations_deleted', v_conversations,
    'messages_deleted',      v_messages,
    'evo_messages_deleted',  v_evo_messages,
    'evo_contacts_deleted',  v_evo_contacts
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_e2e_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_e2e_cleanup() TO service_role, authenticated;
