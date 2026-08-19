-- ============================================================================
-- Migration: db01_enqueue_message_dispatch
-- Data:      2026-08-06
-- Bug:       DB-01 — enqueue canônico ausente. zapp.fn_retry_stuck_messages
--            (cron job 5, retry-stuck-messages, 10/10min) chama
--            zapp.fn_enqueue_message_dispatch(r.id, r.instance_name) via
--            PERFORM, guardado por v_has_enq = EXISTS(pg_proc). Sem a função,
--            o guard cai no ELSE e mensagens presas em 'queued'/'failed' nunca
--            são re-enfileiradas — o fix 20260806100000 (queued_status) tornou
--            a função obrigatória para o retry funcionar.
--
-- DESIGN:     validado com 15 testes PGlite (sql/fn_enqueue_message_dispatch.sql),
--            corpo verbatim do design aprovado em peer review.
--
-- EFEITO:     a partir da aplicação, o cron job 5 passa a re-enfileirar
--            mensagens presas (comportamento desejado do fix).
--
-- IDEMPOTENTE: CREATE OR REPLACE + IF NOT EXISTS + REVOKE/GRANT explícitos.
-- ROLLBACK:   DROP FUNCTION zapp.fn_enqueue_message_dispatch(uuid, text);
--             DROP INDEX IF EXISTS idx_outbound_queue_source_message_id;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNÇÃO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_enqueue_message_dispatch(
  p_message_id uuid,
  p_instance   text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_msg      record;
  v_queue_id uuid;
  v_type     text;
  v_meta     jsonb;
BEGIN
  -- ------------------------------------------------------------------
  -- 1) Validação de entrada + existência da mensagem
  --    Retorna NULL (idempotente) quando não há nada a fazer — o caller
  --    (fn_retry_stuck_messages, cron 10/10min) trata NULL como skip.
  -- ------------------------------------------------------------------
  IF p_message_id IS NULL OR p_instance IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT em.id, em.contact_id, em.remote_jid, em.instance_name,
         em.message_type, em.content, em.media_url, em.media_mimetype,
         em.caption, em.payload, em.direction, em.from_me,
         em.audio_meme_id, em.sticker_id
    INTO v_msg
    FROM evo.evolution_messages em
   WHERE em.id = p_message_id;

  IF v_msg.id IS NULL THEN
    RETURN NULL;  -- mensagem inexistente (ou apagada) → nada a re-enfileirar
  END IF;

  -- Guard defensivo: nunca re-enfileirar mensagem inbound
  IF v_msg.direction IS DISTINCT FROM 'outbound' OR v_msg.from_me IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- ------------------------------------------------------------------
  -- 2) Guard anti-duplicata: já existe linha na fila para esta mensagem
  --    em pending/sending → não inserir de novo.
  -- ------------------------------------------------------------------
  IF EXISTS (
    SELECT 1
      FROM zapp.outbound_message_queue
     WHERE metadata ->> 'source_message_id' = p_message_id::text
       AND status IN ('pending', 'sending')
  ) THEN
    RETURN NULL;
  END IF;

  -- ------------------------------------------------------------------
  -- 3) Normalização de message_type para o CHECK da fila
  --    (evo guarda tipos da Evolution como 'extendedTextMessage'/'ptt';
  --     a fila só aceita os 9 tipos do CHECK + o dispatch só sabe enviar
  --     'text' via sendText e 'audio' via sendMedia(mediatype=audio, ptt)).
  -- ------------------------------------------------------------------
  v_type := CASE
    WHEN v_msg.message_type IN ('text', 'conversation', 'extendedTextMessage') THEN 'text'
    WHEN v_msg.message_type IN ('audio', 'ptt')                              THEN 'audio'
    WHEN v_msg.message_type IN ('image','video','document','sticker',
                                'location','contact','template')              THEN v_msg.message_type
    WHEN COALESCE(v_msg.media_url, '') <> ''                                  THEN 'document'
    ELSE 'text'
  END;

  -- ------------------------------------------------------------------
  -- 4) metadata: payload original preservado + marcadores de origem
  --    (fn_outbound_dispatch lê metadata->>'fileName' para mídia).
  --    payload || marcadores: operando da DIREITA vence no jsonb ||,
  --    garantindo que source_message_id/re_enqueued_at nunca sejam
  --    sobrescritos por chaves homônimas do payload.
  -- ------------------------------------------------------------------
  v_meta := CASE WHEN jsonb_typeof(v_msg.payload) = 'object' THEN v_msg.payload ELSE '{}'::jsonb END
         || jsonb_build_object(
              'source_message_id', p_message_id,
              're_enqueued_at',    now()
            );

  -- ------------------------------------------------------------------
  -- 5) INSERT na fila — formato canônico (mesmas colunas/valores de
  --    send_message_v2 e rpc_send_sticker: pending/0/3; sticker_id e
  --    audio_meme_id só se o registro de origem ainda existir — FKs).
  -- ------------------------------------------------------------------
  INSERT INTO zapp.outbound_message_queue (
    contact_id, remote_jid, instance_name, message_type, content,
    media_url, media_mime_type, caption, metadata, status,
    retry_count, max_retries, created_by, ptt,
    audio_meme_id, sticker_id
  ) VALUES (
    v_msg.contact_id,
    v_msg.remote_jid,
    p_instance,
    v_type,
    v_msg.content,
    v_msg.media_url,
    v_msg.media_mimetype,
    v_msg.caption,
    v_meta,
    'pending',
    0, 3,
    NULL,               -- cron context: sem auth.uid(); padrão rpc_send_sticker usa p_created_by
    TRUE,               -- ptt default canônico (dispatch faz coalesce(ptt,true))
    (SELECT id FROM zapp.audio_memes WHERE id = v_msg.audio_meme_id),  -- NULL se órfão (FK)
    (SELECT id FROM zapp.stickers   WHERE id = v_msg.sticker_id)       -- NULL se órfão (FK)
  )
  RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2. GRANTs (padrão do banco: EXECUTE apenas para service_role — igual a
--    send_message_v2, rpc_send_sticker, fn_outbound_dispatch,
--    fn_outbound_dispatch_apply e fn_retry_stuck_messages; owner postgres
--    executa via cadeia SECURITY DEFINER sem grant explícito).
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION zapp.fn_enqueue_message_dispatch(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION zapp.fn_enqueue_message_dispatch(uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. HARDENING: índice único parcial = guard anti-duplicata à prova de corrida
--    (equivale ao EXISTS do corpo, mas atômico no nível do índice).
--    Seguro aplicar: zapp.outbound_message_queue está VAZIA (0 linhas).
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_queue_source_message_id
  ON zapp.outbound_message_queue ((metadata ->> 'source_message_id'))
  WHERE status IN ('pending', 'sending');
