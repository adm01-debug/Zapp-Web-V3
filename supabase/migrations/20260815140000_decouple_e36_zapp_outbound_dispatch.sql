-- =============================================================================
-- E36 — zapp.fn_outbound_dispatch (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: substituir net.http_post direta por ops.pg_net_post() (invariante I4).
-- Adicional: ops.fn_evo_url() → ops.fn_evo_url_v2();
--            ops.fn_evo_key() → ops.fn_evo_key_v2() (deprecados).
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_outbound_dispatch(p_batch_size integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = zapp, evo, ops, public, pg_catalog
AS $$
DECLARE
  v_api_url  text;
  v_api_key  text;
  v_row      record;
  v_conn     record;
  v_endpoint text;
  v_body     jsonb;
  v_req_id   bigint;
  v_sent     int := 0;
  v_skipped  int := 0;
  v_failed   int := 0;
  v_number   text;
  v_local    text;
BEGIN
  v_api_url := ops.fn_evo_url_v2();
  v_api_key := ops.fn_evo_key_v2();

  IF v_api_url IS NULL OR v_api_key IS NULL THEN
    RAISE EXCEPTION '[fn_outbound_dispatch] vault secrets faltando';
  END IF;

  FOR v_row IN
    SELECT q.*
    FROM zapp.outbound_message_queue q
    WHERE q.status = 'pending'
      AND coalesce(q.retry_count, 0) < coalesce(q.max_retries, 3)
    ORDER BY q.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT status INTO v_conn
    FROM zapp.whatsapp_connections
    WHERE instance_name = v_row.instance_name
    LIMIT 1;

    IF v_conn IS NULL OR v_conn.status <> 'connected' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_local := split_part(v_row.remote_jid, '@', 1);

      -- LID-FIX-01: JIDs com 14+ dígitos são LIDs — precisa mapear para PN real
      IF length(v_local) >= 14 AND v_local ~ '^[0-9]{14,}$' THEN
        BEGIN
          v_number := split_part(
            zapp.fn_normalize_send_jid(v_row.remote_jid, v_row.instance_name),
            '@', 1
          );
        EXCEPTION WHEN OTHERS THEN
          UPDATE zapp.outbound_message_queue
          SET status        = 'failed',
              error_message = 'LID-as-phone sem mapeamento PN real: ' || v_row.remote_jid
                              || '. Aguarda Evolution >=2.4.x. [LID-FIX-01]',
              failed_at     = now(),
              updated_at    = now()
          WHERE id = v_row.id;
          v_failed := v_failed + 1;
          CONTINUE;
        END;
      ELSE
        v_number := v_local;
      END IF;

      IF (v_row.message_type = 'text' OR v_row.message_type IS NULL)
         AND v_row.content IS NULL THEN
        RAISE EXCEPTION 'content nulo para mensagem de texto (id=%)', v_row.id;
      END IF;

      IF v_row.message_type NOT IN ('text')
         AND v_row.message_type IS NOT NULL
         AND v_row.media_url IS NULL THEN
        RAISE EXCEPTION 'media_url nulo para tipo % (id=%)', v_row.message_type, v_row.id;
      END IF;

      IF v_row.message_type = 'text' OR v_row.message_type IS NULL THEN
        v_endpoint := v_api_url || '/message/sendText/' || v_row.instance_name;
        v_body     := jsonb_build_object('number', v_number, 'text', v_row.content);
      ELSIF v_row.message_type = 'audio' THEN
        v_endpoint := v_api_url || '/message/sendMedia/' || v_row.instance_name;
        v_body     := jsonb_build_object(
          'number',    v_number,
          'mediatype', 'audio',
          'mimetype',  coalesce(v_row.media_mime_type, 'audio/ogg; codecs=opus'),
          'media',     v_row.media_url,
          'ptt',       coalesce(v_row.ptt, true)
        );
      ELSE
        v_endpoint := v_api_url || '/message/sendMedia/' || v_row.instance_name;
        v_body     := jsonb_build_object(
          'number',    v_number,
          'mediatype', v_row.message_type,
          'mimetype',  coalesce(v_row.media_mime_type, 'application/octet-stream'),
          'media',     v_row.media_url,
          'caption',   v_row.caption,
          'fileName',  coalesce((v_row.metadata->>'fileName')::text, 'file')
        );
      END IF;

      v_req_id := ops.pg_net_post(
        p_url        := v_endpoint,
        p_body       := v_body,
        p_headers    := jsonb_build_object(
          'apikey',       v_api_key,
          'Content-Type', 'application/json'
        ),
        p_timeout_ms := 10000
      );

      UPDATE zapp.outbound_message_queue
      SET status      = 'sending',
          external_id = v_req_id::text,
          sent_at     = now(),
          updated_at  = now()
      WHERE id = v_row.id;

      v_sent := v_sent + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE zapp.outbound_message_queue
      SET retry_count   = coalesce(retry_count, 0) + 1,
          error_message = left(SQLERRM, 500),
          failed_at     = CASE
            WHEN coalesce(retry_count, 0) + 1 > coalesce(max_retries, 3)
            THEN now() ELSE NULL END,
          status        = CASE
            WHEN coalesce(retry_count, 0) + 1 > coalesce(max_retries, 3)
            THEN 'failed' ELSE 'pending' END,
          updated_at    = now()
      WHERE id = v_row.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'dispatched_at', now(),
    'sent',          v_sent,
    'skipped',       v_skipped,
    'failed',        v_failed,
    'provider',      'evolution'
  );
END;
$$;

COMMENT ON FUNCTION zapp.fn_outbound_dispatch IS
  'Despacha mensagens pendentes para a Evolution API via outbound_message_queue. '
  'E36 (2026-08-15): net.http_post → ops.pg_net_post; fn_evo_url/key → _v2 (invariante I4). '
  'Acesso restrito: search_path=zapp,evo,ops,public,pg_catalog.';
