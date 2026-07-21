-- Fix: zapp.rpc_insert_message tinha p_instance DEFAULT 'wpp_pink_test' (instância de TESTE).
-- Os callers de automação (useAutomationManagement.ts, useAutomations.ts) NÃO passam p_instance,
-- então mensagens auto-enviadas iriam para a partição de teste, com contact_id nulo (misrouting).
-- (Auditoria: 0 mensagens afetadas até agora — path latente; correção preventiva.)
--
-- Correção (PhD): remove o default de teste. Se p_instance vier NULL, DERIVA a instância
-- correta a partir do contato mais recente daquele remote_jid. Se não der para derivar,
-- FALHA ALTO (RAISE) em vez de gravar silenciosamente na instância errada.
--
-- Reversível: recriar com DEFAULT 'wpp_pink_test' (não recomendado).

CREATE OR REPLACE FUNCTION zapp.rpc_insert_message(
  p_remote_jid text,
  p_content text,
  p_message_type text DEFAULT 'text'::text,
  p_message_id text DEFAULT NULL::text,
  p_from_me boolean DEFAULT true,
  p_direction text DEFAULT 'outbound'::text,
  p_instance text DEFAULT NULL::text
)
 RETURNS evo.evolution_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo', 'zapp', 'monitoring'
AS $function$
DECLARE v_contact_id uuid; v_row evo.evolution_messages;
BEGIN
  -- Deriva a instância do contato mais recente quando não informada explicitamente.
  IF p_instance IS NULL OR p_instance = '' THEN
    SELECT instance_name INTO p_instance
    FROM evo.evolution_contacts
    WHERE remote_jid = p_remote_jid
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF p_instance IS NULL THEN
    RAISE EXCEPTION 'rpc_insert_message: instância não informada e não pôde ser derivada para remote_jid=%', p_remote_jid
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_contact_id
  FROM evo.evolution_contacts
  WHERE remote_jid=p_remote_jid AND instance_name=p_instance LIMIT 1;

  INSERT INTO evo.evolution_messages(
    message_id, remote_jid, from_me, direction, message_type, content,
    instance_name, contact_id, status, created_at
  ) VALUES (
    p_message_id, p_remote_jid, p_from_me, p_direction, p_message_type,
    p_content, p_instance, v_contact_id,
    CASE WHEN p_from_me THEN 'sent' ELSE 'received' END, now()
  ) RETURNING * INTO v_row;

  UPDATE evo.evolution_contacts
  SET last_message_at=now(), total_messages=COALESCE(total_messages,0)+1
  WHERE id=v_contact_id;

  RETURN v_row;
END;
$function$;
