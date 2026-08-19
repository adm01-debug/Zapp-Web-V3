-- =============================================================================
-- Migration: rpc_e2e_cleanup v3 — guarda-corpo de triggers de snapshot
--
-- Contexto (2026-08-07, validação exaustiva VAL2-04): o cleanup voltou a
-- falhar 100% (42883 "function increment_snapshot_version(unknown) does not
-- exist") ao DELETAR de evo.evolution_contacts: os triggers AFTER DELETE
-- (trg_snapshot_contacts_delete + trigger_snapshot_version_delete, criados
-- pela sessão paralela sem migration) chamam increment_snapshot_version()
-- SEM qualificação; a resolução de função sem qualificação está QUEBRADA
-- dentro de SECURITY DEFINER neste ambiente (mesmo sintoma do pgcrypto —
-- provado com 4 probes: nenhuma ordem de search_path resolve; a chamada
-- qualificada funciona).
--
-- Fix v3: DISABLE TRIGGER USER em evo.evolution_contacts durante a
-- operação (DDL transacional — rollback reverte) + ENABLE garantido no
-- EXCEPTION. O seed/INSERT não é afetado (triggers de INSERT funcionam —
-- a sessão paralela qualificou nesses).
--
-- Recomendação ao dono (sessão paralela): qualificar
-- evo.increment_snapshot_version() nas trigger functions de DELETE/UPDATE
-- (zapp.trigger_snapshot_on_contacts_*) — o fix definitivo.
--
-- Rollback: reaplicar o corpo da 20260807160000 (v2).
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
  -- Guarda-corpo VAL2-04 (42883 nos triggers de snapshot): desliga os
  -- triggers user da tabela durante a limpeza; re-enable garantido abaixo.
  ALTER TABLE evo.evolution_contacts DISABLE TRIGGER USER;

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

    ALTER TABLE evo.evolution_contacts ENABLE TRIGGER USER;
    RETURN v_result;
  EXCEPTION WHEN others THEN
    ALTER TABLE evo.evolution_contacts ENABLE TRIGGER USER;
    RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_e2e_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_e2e_cleanup() TO service_role, authenticated;
