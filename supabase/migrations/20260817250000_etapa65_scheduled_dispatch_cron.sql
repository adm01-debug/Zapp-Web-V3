-- 20260817250000 — Etapa 65 (CAMPANHAS-09): dispatcher de mensagens agendadas
-- =============================================================================
-- Problema verificado (2026-08-04/17): NENHUM edge/cron do repo lia
-- zapp.scheduled_messages (grep em supabase/functions = 0 ocorrências;
-- cron de processamento inexistente nas migrations). Mensagens agendadas
-- NUNCA eram disparadas.
--
-- Solução (padrão do banco: cron → zapp.fn_*, nunca edge HTTP direto):
--   zapp.fn_dispatch_scheduled_messages() SECURITY DEFINER chamada por
--   cron.schedule('scheduled-messages-dispatch', '* * * * *').
-- O envio usa o MESMO contrato HTTP das edge functions
-- (grep evolutionClient/sendText): POST {api_url}/message/sendText/{instance}
-- com header `apikey` e body {number, text} — credenciais por conexão em
-- zapp.whatsapp_connections (api_url/api_key/instance_name), via
-- extensions.http_post (síncrono, mesmo padrão do nps-daily-trigger).
-- Não-texto: sendWhatsAppAudio (audio) / sendMedia (demais) — mapping do
-- talkx-send.getMediaEndpoint.
--
-- Bookkeeping crash-safe: claim atômico com status='sending' + recuperação
-- de claims órfãos (status='sending' com updated_at < now()-15min).
--
-- Rollback: cron.unschedule('scheduled-messages-dispatch');
--           DROP FUNCTION zapp.fn_dispatch_scheduled_messages(integer);
--           restaurar CHECK sem 'sending' (ver comentário abaixo).

BEGIN;

-- ── 1. Estado 'sending' no CHECK (bookkeeping do dispatcher) ──────────────
-- Rollback: ALTER TABLE zapp.scheduled_messages DROP CONSTRAINT
-- scheduled_messages_status_check; ALTER TABLE ... ADD CONSTRAINT ... CHECK
-- (status IN ('pending','sent','failed','cancelled'));
ALTER TABLE zapp.scheduled_messages DROP CONSTRAINT IF EXISTS scheduled_messages_status_check;
ALTER TABLE zapp.scheduled_messages
  ADD CONSTRAINT scheduled_messages_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled'));

-- ── 2. Função dispatcher ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_dispatch_scheduled_messages(p_batch_limit integer DEFAULT 20)
RETURNS TABLE(total_dispatched integer, sent_count integer, failed_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'zapp', 'public'
AS $fn$
DECLARE
  v_row record;
  v_phone text;
  v_instance text;
  v_api_url text;
  v_api_key text;
  v_resp record;
  v_media_endpoint text;
  v_sent integer := 0;
  v_failed integer := 0;
  v_total integer := 0;
BEGIN
  -- Claim atômico: pending vencidas + claims órfãos de runs mortos.
  -- FOR UPDATE SKIP LOCKED evita duplo envio com crons sobrepostos.
  FOR v_row IN
    UPDATE zapp.scheduled_messages sm
    SET status = 'sending', updated_at = now()
    WHERE sm.id IN (
      SELECT id FROM zapp.scheduled_messages
      WHERE (status = 'pending' AND scheduled_at <= now())
         OR (status = 'sending' AND updated_at < now() - interval '15 minutes')
      ORDER BY scheduled_at
      LIMIT GREATEST(1, p_batch_limit)
      FOR UPDATE SKIP LOCKED
    )
    RETURNING sm.*
  LOOP
    v_total := v_total + 1;

    BEGIN
      -- Telefone do contato (mesma limpeza de dígitos do talkx-send).
      SELECT regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g')
        INTO v_phone
        FROM zapp.contacts c
        WHERE c.id = v_row.contact_id;

      IF v_row.contact_id IS NULL OR v_phone IS NULL OR v_phone = '' THEN
        UPDATE zapp.scheduled_messages
          SET status = 'failed', error_message = 'contato sem telefone', updated_at = now()
          WHERE id = v_row.id;
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      -- Conexão: primeiro a explícita (whatsapp_connection_id), senão a
      -- primeira ativa (fallback para agendamentos sem conexão escolhida).
      v_instance := NULL; v_api_url := NULL; v_api_key := NULL;
      IF v_row.whatsapp_connection_id IS NOT NULL THEN
        SELECT wc.instance_name, wc.api_url, wc.api_key
          INTO v_instance, v_api_url, v_api_key
          FROM zapp.whatsapp_connections wc
          WHERE wc.id = v_row.whatsapp_connection_id
          LIMIT 1;
      END IF;

      IF v_instance IS NULL THEN
        SELECT wc.instance_name, wc.api_url, wc.api_key
          INTO v_instance, v_api_url, v_api_key
          FROM zapp.whatsapp_connections wc
          WHERE COALESCE(wc.status, '') NOT IN ('disconnected', 'error', 'paused')
          ORDER BY wc.created_at ASC
          LIMIT 1;
      END IF;

      IF v_instance IS NULL OR v_api_url IS NULL OR v_api_key IS NULL
         OR v_api_url = '' OR v_api_key = '' THEN
        UPDATE zapp.scheduled_messages
          SET status = 'failed', error_message = 'conexão whatsapp indisponível', updated_at = now()
          WHERE id = v_row.id;
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      -- Envio — contrato Evolution real (evolutionFetch/evolutionClient):
      --   POST {api_url}/message/sendText/{instance}  header: apikey
      IF v_row.message_type = 'text' OR v_row.media_url IS NULL THEN
        SELECT extensions.http_post(
          url     := rtrim(v_api_url, '/') || '/message/sendText/' || v_instance,
          body    := jsonb_build_object('number', v_phone, 'text', COALESCE(v_row.content, ''), 'delay', 0),
          headers := jsonb_build_object('apikey', v_api_key, 'Content-Type', 'application/json')
        ) INTO v_resp;
      ELSE
        v_media_endpoint := CASE v_row.message_type
          WHEN 'audio' THEN 'sendWhatsAppAudio'
          ELSE 'sendMedia'
        END;
        SELECT extensions.http_post(
          url     := rtrim(v_api_url, '/') || '/message/' || v_media_endpoint || '/' || v_instance,
          body    := jsonb_build_object(
            'number', v_phone,
            'mediatype', v_row.message_type,
            'media', v_row.media_url,
            'caption', COALESCE(v_row.content, ''),
            'delay', 0
          ),
          headers := jsonb_build_object('apikey', v_api_key, 'Content-Type', 'application/json')
        ) INTO v_resp;
      END IF;

      IF v_resp IS NOT NULL AND v_resp.status >= 200 AND v_resp.status < 300 THEN
        UPDATE zapp.scheduled_messages
          SET status = 'sent', sent_at = now(), error_message = NULL, updated_at = now()
          WHERE id = v_row.id;
        v_sent := v_sent + 1;
      ELSE
        UPDATE zapp.scheduled_messages
          SET status = 'failed',
              error_message = left(
                COALESCE(v_resp.content, 'HTTP ' || COALESCE(v_resp.status::text, 'sem resposta')),
                500),
              updated_at = now()
          WHERE id = v_row.id;
        v_failed := v_failed + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Falha de rede/extensão/contrato NUNCA aborta o batch (padrão
      -- notify_sicoob_on_reply): marca failed e segue.
      UPDATE zapp.scheduled_messages
        SET status = 'failed', error_message = left(SQLERRM, 500), updated_at = now()
        WHERE id = v_row.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_total, v_sent, v_failed;
END;
$fn$;

-- Dispatcher é interno (chamado pelo cron como postgres). Sem grant a
-- authenticated — envio em massa não é ação de usuário comum.
GRANT EXECUTE ON FUNCTION zapp.fn_dispatch_scheduled_messages(integer) TO postgres;

-- ── 3. Cron idempotente (guard) ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '[etapa65] pg_cron não instalado — registrar cron manualmente';
    RETURN;
  END IF;

  PERFORM cron.unschedule('scheduled-messages-dispatch')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-messages-dispatch');

  PERFORM cron.schedule(
    'scheduled-messages-dispatch',
    '* * * * *',
    $cmd$
      SELECT zapp.fn_dispatch_scheduled_messages(20);
    $cmd$
  );

  RAISE NOTICE '[etapa65] cron "scheduled-messages-dispatch" registrado (* * * * * UTC)';
EXCEPTION WHEN OTHERS THEN
  -- AG-EX-13: falha EXPLÍCITA em vez de engolir (job nunca criado com
  -- migration reportando sucesso).
  RAISE EXCEPTION '[etapa65] erro ao registrar cron dispatcher [%]: %', SQLSTATE, SQLERRM;
END $$;

COMMIT;
