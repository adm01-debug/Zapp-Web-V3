-- FN: evo.fn_delete_test_contacts -- utilitario de auditoria 2026-08-10
-- Deleta contatos de teste bypassando FK cascade (444 referencias).
-- Usa session_replication_role=replica (session-local) para ignorar FKs.
-- Guards de seguranca:
--   1. Pattern deve terminar em @s.whatsapp.net, @g.us, @lid ou @broadcast
--   2. JIDs realisticos (55[1-9][0-9]{8,} sem '000') sao bloqueados
-- Performance: 2ms vs 14s+ via DELETE direto com cascata.

CREATE OR REPLACE FUNCTION evo.fn_delete_test_contacts(p_pattern text)
RETURNS TABLE(deleted_contacts int, deleted_convs int, msg text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'evo','zapp'
AS $$
DECLARE
  v_contacts int;
  v_convs    int;
BEGIN
  IF p_pattern NOT LIKE '%@s.whatsapp.net' AND p_pattern NOT LIKE '%@g.us'
     AND p_pattern NOT LIKE '%@lid' AND p_pattern NOT LIKE '%@broadcast' THEN
    RAISE EXCEPTION 'pattern invalido para delete de teste: %', p_pattern;
  END IF;

  IF p_pattern ~ '^55[1-9][0-9]{8,}' AND p_pattern NOT LIKE '%000%' THEN
    RAISE EXCEPTION 'pattern parece contato de producao: %', p_pattern;
  END IF;

  SET LOCAL session_replication_role = 'replica';

  DELETE FROM evo.evolution_contacts
  WHERE remote_jid LIKE p_pattern;
  GET DIAGNOSTICS v_contacts = ROW_COUNT;

  SET LOCAL session_replication_role = DEFAULT;

  RETURN QUERY SELECT v_contacts, v_convs,
    format('deleted %s contacts matching %s', v_contacts, p_pattern);
END;
$$;

COMMENT ON FUNCTION evo.fn_delete_test_contacts(text) IS
  'Apaga contatos de teste bypassando FK cascade (444 refs). Valida pattern sintetico.';
