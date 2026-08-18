-- ============================================================================
-- Etapa 66-CSAT — Captura de respostas CSAT (SIM-CSAT E3)
-- 2026-08-17 | DB-as-source: aplicado via MCP (supabase_apply_migration /
-- role postgres); este arquivo é o espelho versionado. Idempotente
-- (CREATE OR REPLACE FUNCTION).
--
-- zapp.fn_capture_csat_replies(p_limit int DEFAULT 50):
--   Lê zapp.evolution_messages (view de contrato, direção zapp → evo
--   permitida), filtra inbound com conteúdo "1".."5" (regex ^\s*[1-5]\s*$)
--   na janela de 72h; casa com o survey aberto do contato
--   (status='sent', rating IS NULL, responded_at IS NULL, mais recente,
--   janela 72h do send_at, conversation_id compatível quando ambos existem);
--   UPDATE rating/responded_at/response_time_seconds no survey + INSERT em
--   csat_responses na MESMA transação (idempotente: sentinel message_id via
--   UNIQUE parcial + guard responded_at IS NULL — F10/F11).
--
-- Por que cron e não hook no evolution-webhook (E3): hot path de alta taxa,
-- 429/retry — não tocar; captura desacoplada não adiciona latência ao webhook.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS zapp.fn_capture_csat_replies(integer);
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_capture_csat_replies(p_limit integer DEFAULT 50)
RETURNS TABLE (captured integer)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = zapp, public
AS $$
DECLARE
  v_limit   integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_captured integer := 0;
  v_msg     record;
  v_survey  record;
  v_rating  integer;
  v_rt_secs integer;
BEGIN
  FOR v_msg IN
    SELECT m.message_id, m.remote_jid, m.content, m.created_at,
           m.contact_id, m.conversation_id, m.instance_name
      FROM zapp.evolution_messages m
     WHERE m.from_me = false
       AND m.content ~ '^[[:space:]]*[1-5][[:space:]]*$'
       AND m.created_at >= now() - interval '72 hours'
       AND NOT EXISTS (
         SELECT 1 FROM zapp.csat_responses r
          WHERE r.message_id = m.message_id
       )
     ORDER BY m.created_at DESC
     LIMIT v_limit
  LOOP
    -- Survey aberto do contato: enviado, sem resposta, dentro da janela 72h
    -- do send_at, conversa compatível (soft — quando ambos os ids existem).
    SELECT s.id, s.agent_id, s.conversation_id, s.send_at
      INTO v_survey
      FROM zapp.csat_surveys s
     WHERE s.contact_id = v_msg.contact_id
       AND s.status = 'sent'
       AND s.rating IS NULL
       AND s.responded_at IS NULL
       AND v_msg.created_at BETWEEN s.send_at AND s.send_at + interval '72 hours'
       AND (s.conversation_id IS NULL OR v_msg.conversation_id IS NULL
            OR s.conversation_id = v_msg.conversation_id)
     ORDER BY s.send_at DESC
     LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_rating  := btrim(v_msg.content)::integer;
    v_rt_secs := GREATEST(0, EXTRACT(EPOCH FROM (v_msg.created_at - v_survey.send_at))::integer);

    -- 1) Marca o survey (só se ainda estiver aberto — corrida entre ticks
    --    perde aqui: responded_at/rating NULL é o guard de idempotência)
    UPDATE zapp.csat_surveys s
       SET rating              = v_rating,
           responded_at        = v_msg.created_at,
           updated_at          = now()
     WHERE s.id = v_survey.id
       AND s.responded_at IS NULL
       AND s.rating IS NULL;

    IF FOUND THEN
      -- 2) Registra a resposta na MESMA transação (sentinel message_id)
      INSERT INTO zapp.csat_responses
        (contact_id, conversation_id, agent_id, instance_name,
         rating, comment, response_time_seconds, message_id, created_at)
      VALUES
        (v_msg.contact_id, v_survey.conversation_id, v_survey.agent_id,
         v_msg.instance_name, v_rating, NULL, v_rt_secs, v_msg.message_id,
         v_msg.created_at)
      ON CONFLICT DO NOTHING; -- uq_csat_responses_message_id: nunca duplica

      v_captured := v_captured + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_captured;
END;
$$;

COMMENT ON FUNCTION zapp.fn_capture_csat_replies(integer) IS
  'Captura respostas CSAT "1"-"5" de zapp.evolution_messages e preenche '
  'csat_surveys.rating/responded_at + csat_responses (cron 2min, SIM-CSAT E3).';

-- Execução: cron pg_cron (postgres) + service_role (manual/edge). Nada p/ authenticated.
GRANT EXECUTE ON FUNCTION zapp.fn_capture_csat_replies(integer) TO service_role;
