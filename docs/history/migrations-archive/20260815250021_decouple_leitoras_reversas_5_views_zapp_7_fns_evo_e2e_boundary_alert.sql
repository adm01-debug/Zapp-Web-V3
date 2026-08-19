-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250021), sem arquivo
-- correspondente neste repo. Ver convencao completa em 20260815250008_*.sql.
--
-- Fonte: docs/decouple/LOTE6_7_8_LOG.md, secao "Adendo — leitoras reversas
-- (migration DB 20260815250021)".
--
-- Objetivo: 7 fns de dominio evo que liam zapp direto foram repontadas para
-- 5 views reversas novas public.zapp_* (padrao inverso do public.evo_* usado
-- em 20260815250020_*.sql: aqui e evo lendo zapp, nao zapp lendo evo).
-- As fns FICAM em evo — so o corpo muda (nenhum ALTER FUNCTION SET SCHEMA
-- neste lote). Definicoes: pg_get_viewdef / pg_get_functiondef em producao
-- 2026-08-15/16 (fonte de verdade), obtidas via MCP SUPABASE SELF HOSTED.
--
-- Sem grants explicitos nas 5 views: o invocador efetivo em todos os
-- caminhos de chamada e sempre "postgres" — 4 das 7 fns sao SECURITY DEFINER
-- com owner postgres (fn_reconcile_media_fk_orphans, fn_detect_instance_recreate,
-- fn_sync_messages_to_v2, fn_e2e_media_probe) e as 3 restantes, embora nao
-- SECURITY DEFINER, sao chamadas exclusivamente por pg_cron agendado como
-- postgres (fn_purge_storage_cache, fn_enqueue_orphan_media,
-- fn_watchdog_media_links). Como nenhum caminho de chamada roda como
-- authenticated/service_role, GRANT explicito e desnecessario — os
-- privilegios de schema public padrao (authenticated/dyad_reader/
-- metabase_reader/om_reader/service_role, ja presentes em toda view
-- public.* deste banco) sao irrelevantes para o funcionamento destas fns e
-- nao foram alterados por este lote (mesmo padrao de nao-hardening ja
-- registrado em 20260815250020_*.sql).
--
-- zapp_instance_credentials expõe apenas id, instance_name, is_active —
-- NAO expoe api keys (view minima por desenho, nao superficie residual).
--
-- Guard anti-residuo (E42, CI plugado em .github/workflows/evo-ddl-gate.yml):
-- nenhum corpo abaixo contem "zapp." fora de "zapp.rpc_boundary_*" —
-- fn_e2e_media_probe converteu o INSERT+dedup manual de alerta para
-- zapp.rpc_boundary_raise_alert(..., interval '6 hours') (semantica de
-- dedup identica); as demais leem zapp exclusivamente via as views
-- public.zapp_* abaixo (schema-qualificadas como public.*, nao zapp.*).
--
-- Smokes reais (LOTE6_7_8_LOG.md): reconcile OK, watchdog OK,
-- fn_e2e_media_probe() -> resultado=PASS, sync executou sem excecao.
-- Placar: I1 25 -> 18 (I2=0, demais estaveis).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 5 views reversas novas public.zapp_* (leitura evo -> zapp para as 7 fns
-- abaixo; security_invoker=on)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.zapp_evolution_media
WITH (security_invoker = on) AS
SELECT
  evolution_media.id,
  evolution_media.message_id,
  evolution_media.remote_jid,
  evolution_media.media_type,
  evolution_media.mime_type,
  evolution_media.file_name,
  evolution_media.file_size,
  evolution_media.file_sha256,
  evolution_media.storage_path,
  evolution_media.storage_url,
  evolution_media.base64_data,
  evolution_media.caption,
  evolution_media.duration_seconds,
  evolution_media.width,
  evolution_media.height,
  evolution_media.is_animated,
  evolution_media.thumbnail_base64,
  evolution_media.created_at,
  evolution_media.storage_bucket,
  evolution_media.storage_path_clean,
  evolution_media.media_status,
  evolution_media.instance_name
FROM zapp.evolution_media;

CREATE OR REPLACE VIEW public.zapp_evolution_messages
WITH (security_invoker = on) AS
SELECT
  evolution_messages.id,
  evolution_messages.message_id,
  evolution_messages.remote_jid,
  evolution_messages.from_me,
  evolution_messages.message_type,
  evolution_messages.content,
  evolution_messages.media_url,
  evolution_messages.media_mimetype,
  evolution_messages.quoted_message_id,
  evolution_messages.is_starred,
  evolution_messages.is_important,
  evolution_messages.category,
  evolution_messages.sentiment,
  evolution_messages.tags,
  evolution_messages.notes,
  evolution_messages.follow_up_at,
  evolution_messages.follow_up_done,
  evolution_messages.payload,
  evolution_messages.created_at,
  evolution_messages.contact_id,
  evolution_messages.conversation_id,
  evolution_messages.direction,
  evolution_messages.status,
  evolution_messages.status_at,
  evolution_messages.caption,
  evolution_messages.media_filename,
  evolution_messages.media_size,
  evolution_messages.sent_by_bot,
  evolution_messages.template_name,
  evolution_messages.instance_name,
  evolution_messages.push_name,
  evolution_messages.media_type,
  evolution_messages.raw_data,
  evolution_messages.deleted_at,
  evolution_messages.edited_at,
  evolution_messages.updated_at,
  evolution_messages.media_meta,
  evolution_messages.audio_meme_id,
  evolution_messages.sticker_id,
  evolution_messages.link_preview,
  evolution_messages.is_read,
  evolution_messages.reply_to_id,
  evolution_messages.media_bucket,
  evolution_messages.media_path,
  evolution_messages.media_sha256,
  evolution_messages.media_status,
  evolution_messages.transcription_status,
  evolution_messages.transcription,
  evolution_messages.error_code,
  evolution_messages.error_reason,
  evolution_messages.retry_attempt,
  evolution_messages.retry_total,
  evolution_messages.ingest_meta,
  evolution_messages.remote_jid_original
FROM zapp.evolution_messages;

CREATE OR REPLACE VIEW public.zapp_evolution_messages_wpp2
WITH (security_invoker = on) AS
SELECT
  evolution_messages_wpp2.id,
  evolution_messages_wpp2.message_id,
  evolution_messages_wpp2.remote_jid,
  evolution_messages_wpp2.from_me,
  evolution_messages_wpp2.message_type,
  evolution_messages_wpp2.content,
  evolution_messages_wpp2.media_url,
  evolution_messages_wpp2.media_mimetype,
  evolution_messages_wpp2.quoted_message_id,
  evolution_messages_wpp2.is_starred,
  evolution_messages_wpp2.is_important,
  evolution_messages_wpp2.category,
  evolution_messages_wpp2.sentiment,
  evolution_messages_wpp2.tags,
  evolution_messages_wpp2.notes,
  evolution_messages_wpp2.follow_up_at,
  evolution_messages_wpp2.follow_up_done,
  evolution_messages_wpp2.payload,
  evolution_messages_wpp2.created_at,
  evolution_messages_wpp2.contact_id,
  evolution_messages_wpp2.conversation_id,
  evolution_messages_wpp2.direction,
  evolution_messages_wpp2.status,
  evolution_messages_wpp2.status_at,
  evolution_messages_wpp2.caption,
  evolution_messages_wpp2.media_filename,
  evolution_messages_wpp2.media_size,
  evolution_messages_wpp2.sent_by_bot,
  evolution_messages_wpp2.template_name,
  evolution_messages_wpp2.instance_name,
  evolution_messages_wpp2.push_name,
  evolution_messages_wpp2.media_type,
  evolution_messages_wpp2.raw_data,
  evolution_messages_wpp2.deleted_at,
  evolution_messages_wpp2.edited_at,
  evolution_messages_wpp2.updated_at,
  evolution_messages_wpp2.media_meta,
  evolution_messages_wpp2.audio_meme_id,
  evolution_messages_wpp2.sticker_id,
  evolution_messages_wpp2.link_preview,
  evolution_messages_wpp2.is_read,
  evolution_messages_wpp2.reply_to_id,
  evolution_messages_wpp2.media_bucket,
  evolution_messages_wpp2.media_path,
  evolution_messages_wpp2.media_sha256,
  evolution_messages_wpp2.media_status,
  evolution_messages_wpp2.transcription_status,
  evolution_messages_wpp2.transcription,
  evolution_messages_wpp2.error_code,
  evolution_messages_wpp2.error_reason,
  evolution_messages_wpp2.retry_attempt,
  evolution_messages_wpp2.retry_total,
  evolution_messages_wpp2.ingest_meta,
  evolution_messages_wpp2.remote_jid_original
FROM zapp.evolution_messages_wpp2;

CREATE OR REPLACE VIEW public.zapp_whatsapp_connections
WITH (security_invoker = on) AS
SELECT
  whatsapp_connections.id,
  whatsapp_connections.name,
  whatsapp_connections.phone_number,
  whatsapp_connections.instance_name,
  whatsapp_connections.instance_id,
  whatsapp_connections.api_url,
  whatsapp_connections.api_key,
  whatsapp_connections.status,
  whatsapp_connections.qr_code,
  whatsapp_connections.qr_code_base64,
  whatsapp_connections.is_active,
  whatsapp_connections.is_default,
  whatsapp_connections.webhook_url,
  whatsapp_connections.settings,
  whatsapp_connections.last_connected_at,
  whatsapp_connections.connected_at,
  whatsapp_connections.disconnected_at,
  whatsapp_connections.created_at,
  whatsapp_connections.updated_at,
  whatsapp_connections.api_type,
  whatsapp_connections.battery_level,
  whatsapp_connections.created_by,
  whatsapp_connections.degraded_at,
  whatsapp_connections.farewell_enabled,
  whatsapp_connections.farewell_message,
  whatsapp_connections.health_reason,
  whatsapp_connections.health_response_ms,
  whatsapp_connections.health_status,
  whatsapp_connections.is_plugged,
  whatsapp_connections.last_health_check,
  whatsapp_connections.max_retries,
  whatsapp_connections.owner_jid,
  whatsapp_connections.retry_count,
  whatsapp_connections.routing_mode,
  whatsapp_connections.auto_reconnect_enabled,
  whatsapp_connections.loop_protection_active,
  whatsapp_connections.max_reconnect_attempts,
  whatsapp_connections.reconnect_interval_seconds,
  whatsapp_connections.evo_instance_id
FROM zapp.whatsapp_connections;

-- Colunas minimas por desenho — nao expoe api keys (ver justificativa de
-- ausencia de grants no cabecalho).
CREATE OR REPLACE VIEW public.zapp_instance_credentials
WITH (security_invoker = on) AS
SELECT
  evolution_instance_credentials.id,
  evolution_instance_credentials.instance_name,
  evolution_instance_credentials.is_active
FROM zapp.evolution_instance_credentials;

-- ---------------------------------------------------------------------------
-- 7 fns de dominio evo repontadas (ficam em evo; so o corpo muda — leitura
-- de zapp agora via as views public.zapp_* acima, nao mais via zapp.*
-- schema-qualificado direto)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION evo.fn_purge_storage_cache(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'evo', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_supabase_url text;
  v_service_key  text;
  v_row          record;
  v_res          net.http_response_result;
  v_http         net.http_response;
  v_req_id       bigint;
  v_log_id       bigint;
  v_categoria    text;
  v_ext          text;
  v_url          text;
  v_path_enc     text;
  v_seg          text;
  v_success      boolean;
  v_wait_ms      int := 0;
  v_scanned      int := 0;
  v_enqueued     int := 0;
  v_deleted      int := 0;
  v_failed       int := 0;
  v_pending      int := 0;
  v_skipped      int := 0;
  v_error        int := 0;
BEGIN
  v_supabase_url := COALESCE(ops.fn_get_vault_secret('supabase_api_url'), 'https://supabase.atomicabr.com.br');
  -- Service role key do vault (mesmo padrao das demais funcoes evo.*)
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  -- ============================================================
  -- FASE A: coleta respostas de DELETEs enfileirados em runs ANTERIORES
  -- (pg_net so processa fila COMMITADA: a resposta so fica disponivel
  --  depois que a transacao do run anterior commitou)
  -- ============================================================

/* BULK-STALE-FAIL-2026-08-12: elimina todos os itens stale em 1 UPDATE antes do loop */
  UPDATE evo.media_cleanup_log SET delete_status='failed', deleted_at=now(),
    delete_error='bulk-stale-fail: >2h sem resposta pg_net'
  WHERE delete_status='planned' AND pg_net_request_id IS NOT NULL
    AND planned_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_skipped = ROW_COUNT;
FOR v_row IN
    SELECT id AS log_id, pg_net_request_id AS req_id, planned_at,
           bucket_id, name
    FROM evo.media_cleanup_log
    WHERE delete_status = 'planned'
      AND pg_net_request_id IS NOT NULL
    ORDER BY id
    LIMIT 4   -- FIX-TIMEOUT: limita Phase A a 4 itens por run (max 80s polling)
  LOOP
    -- FIX-TIMEOUT: fast-fail para items stale (>2h sem resposta)
    IF v_row.planned_at < now() - interval '2 hours' THEN
      UPDATE evo.media_cleanup_log
      SET delete_status = 'failed', deleted_at = now(),
          delete_error = 'fast-fail: >2h sem resposta do pg_net worker'
      WHERE id = v_row.log_id;
      v_failed := v_failed + 1;
      CONTINUE;
    END IF;

    -- GUARD R2 (EX-04): nunca processar DELETE de objeto ainda pendente de
    -- migracao R2 (media 'ready' cujo storage_url NAO aponta p/ zapp-media-proxy).
    -- Sem registro de media correspondente (orfao) => purge permitido.
    PERFORM 1
      FROM public.zapp_evolution_media e
     WHERE e.storage_bucket = v_row.bucket_id
       AND e.storage_path_clean = v_row.name
       AND coalesce(e.storage_url, '') NOT LIKE '%zapp-media-proxy%';
    IF FOUND THEN
      UPDATE evo.media_cleanup_log
         SET delete_status = 'skipped', deleted_at = now(),
             delete_error = 'guard_r2: media ainda referencia storage Supabase (migracao pendente)'
       WHERE id = v_row.log_id;
      v_skipped := v_skipped + 1;
      -- drena a resposta da fila pg_net (best-effort) p/ nao acumular lixo
      PERFORM net._http_collect_response(v_row.req_id, true);
      CONTINUE;
    END IF;

    v_wait_ms := 0;
    v_res := net._http_collect_response(v_row.req_id, true);
    v_http := v_res.response;
    -- wait: polling ate resposta pronta ou erro definitivo (max ~20s)
    WHILE (v_res.status = 'ERROR' OR v_http.status_code IS NULL) AND v_wait_ms < 20000 LOOP
      -- pg_sleep removed: causava statement_timeout (fix R4)
      v_wait_ms := v_wait_ms + 200;
      v_res := net._http_collect_response(v_row.req_id, true);
      v_http := v_res.response;
    END LOOP;

    -- Erro definitivo do worker (timeout/DNS/etc): falha imediata
    IF v_res.status = 'ERROR' AND v_res.message <> 'request matching request_id not found' THEN
      UPDATE evo.media_cleanup_log
      SET delete_status = 'failed', deleted_at = now(), delete_error = left(v_res.message, 300)
      WHERE id = v_row.log_id;
      v_failed := v_failed + 1;
      CONTINUE;
    END IF;

    -- Ainda sem resposta: stale > 1h = falha; recente = fica planned p/ proximo run
    IF v_http.status_code IS NULL THEN
      IF v_row.planned_at < now() - interval '1 hour' THEN
        UPDATE evo.media_cleanup_log
        SET delete_status = 'failed', deleted_at = now(), delete_error = 'pg_net: no response within wait window'
        WHERE id = v_row.log_id;
        v_failed := v_failed + 1;
      ELSE
        v_pending := v_pending + 1;
      END IF;
      CONTINUE;
    END IF;

    -- Sucesso = 2xx, ou 404 (objeto ja inexistente = purge cumprido, idempotente)
    -- Obs.: storage-api devolve HTTP 400 + body {"statusCode":"404","message":"Object not found"} p/ objeto inexistente
    v_success := (v_http.status_code >= 200 AND v_http.status_code < 300)
              OR v_http.status_code = 404
              OR (v_http.body IS NOT NULL
                  AND (v_http.body LIKE '%"statusCode":"404"%' OR v_http.body LIKE '%Object not found%'));

    IF v_success THEN
      UPDATE evo.media_cleanup_log
      SET delete_status = 'deleted', deleted_at = now(), delete_error = NULL
      WHERE id = v_row.log_id;
      v_deleted := v_deleted + 1;
    ELSE
      UPDATE evo.media_cleanup_log
      SET delete_status = 'failed', deleted_at = now(),
          delete_error = 'HTTP ' || coalesce(v_http.status_code::text, '?') || ': ' || left(coalesce(v_http.body, v_res.message, ''), 300)
      WHERE id = v_row.log_id;
      v_failed := v_failed + 1;
    END IF;
  END LOOP;

  -- ============================================================
  -- FASE B: enfileira DELETEs para novos candidatos (fire-and-forget;
  --  respostas serao coletadas no proximo run, fase A)
  -- ============================================================

/* BULK-STALE-FAIL-2026-08-12: elimina todos os itens stale em 1 UPDATE antes do loop */
  UPDATE evo.media_cleanup_log SET delete_status='failed', deleted_at=now(),
    delete_error='bulk-stale-fail: >2h sem resposta pg_net'
  WHERE delete_status='planned' AND pg_net_request_id IS NOT NULL
    AND planned_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_skipped = ROW_COUNT;
FOR v_row IN
    SELECT * FROM evo.fn_list_storage_cache_for_purge(p_days)
  LOOP
    v_scanned := v_scanned + 1;

    -- GUARD R2 (EX-04, defesa em profundidade): nao enfileira DELETE de objeto
    -- ainda pendente de migracao (media apontando p/ storage Supabase)
    PERFORM 1
      FROM public.zapp_evolution_media e
     WHERE e.storage_bucket = v_row.bucket_name
       AND e.storage_path_clean = v_row.storage_path
       AND coalesce(e.storage_url, '') NOT LIKE '%zapp-media-proxy%';
    IF FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Dedupe: objeto ja logado como planned/deleted nao e re-enfileirado
    PERFORM 1 FROM evo.media_cleanup_log l
    WHERE l.bucket_id = v_row.bucket_name AND l.name = v_row.storage_path
      AND l.delete_status IN ('planned', 'deleted', 'failed', 'skipped'); -- fix R4: incluidos failed/skipped para evitar violacao uq
    IF FOUND THEN
      CONTINUE;
    END IF;

    -- Categoria por extensao (padrao da casa: *_antigo)
    v_ext := lower(coalesce(substring(v_row.storage_path from '[.]([A-Za-z0-9]+)$'), ''));
    v_categoria := CASE
      WHEN v_ext IN ('jpg','jpeg','png','gif','webp','heic','heif','bmp','svg','avif','tiff') THEN 'image_antigo'
      WHEN v_ext IN ('mp4','mov','avi','mkv','webm','m4v','3gp','mpeg') THEN 'video_antigo'
      WHEN v_ext IN ('mp3','ogg','opus','wav','aac','m4a','amr','flac') THEN 'audio_antigo'
      WHEN v_ext IN ('pdf','doc','docx','xls','xlsx','ppt','pptx','txt','zip','rar','7z','csv') THEN 'document_antigo'
      ELSE 'other_antigo'
    END;

    -- Registra intencao de purge
    INSERT INTO evo.media_cleanup_log (bucket_id, name, categoria, planned_at, delete_status)
    VALUES (v_row.bucket_name, v_row.storage_path, v_categoria, now(), 'planned')
    RETURNING id INTO v_log_id;

    BEGIN
      -- URL-encode por segmento (preserva '/')
      v_path_enc := '';
      FOR v_seg IN SELECT unnest(string_to_array(v_row.storage_path, '/'))
      LOOP
        v_path_enc := v_path_enc || '/' || net._urlencode_string(v_seg);
      END LOOP;

      v_url := v_supabase_url || '/storage/v1/object/' || net._urlencode_string(v_row.bucket_name) || v_path_enc;

      -- Dispara DELETE assincrono na Storage API (via Kong, service_role)
      SELECT net.http_delete(
        url     := v_url,
        headers := jsonb_build_object('Authorization', 'Bearer ' || coalesce(v_service_key, '')),
        timeout_milliseconds := 15000
      ) INTO v_req_id;

      -- Guarda o request_id p/ coleta da resposta no proximo run
      UPDATE evo.media_cleanup_log
      SET pg_net_request_id = v_req_id
      WHERE id = v_log_id;
      v_enqueued := v_enqueued + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE evo.media_cleanup_log
      SET delete_status = 'error', deleted_at = now(), delete_error = left(SQLERRM, 300)
      WHERE id = v_log_id;
      v_error := v_error + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'scanned', v_scanned,
    'enqueued', v_enqueued,
    'deleted', v_deleted,
    'failed', v_failed,
    'pending', v_pending,
    'skipped', v_skipped,
    'errors', v_error,
    'executed_at', now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION evo.fn_reconcile_media_fk_orphans()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_mdq_deleted int;
  v_mlr_orphans int;
BEGIN
  -- E64: substitui o ON DELETE CASCADE das FKs fisicas mdq -> public.zapp_evolution_messages.
  -- Deleta itens da fila cuja mensagem-mae nao existe mais (erasure/purga).
  DELETE FROM evo.media_download_queue q
  WHERE NOT EXISTS (
    SELECT 1 FROM public.zapp_evolution_messages m
    WHERE m.message_id = q.message_id AND m.instance_name = q.instance_name
  );
  GET DIAGNOSTICS v_mdq_deleted = ROW_COUNT;

  -- media_loss_registry: FK era NO ACTION (nunca deletou em cascata).
  -- Orfaos sao contados para auditoria, nao deletados (registro historico de perda).
  SELECT count(*) INTO v_mlr_orphans
  FROM evo.media_loss_registry r
  WHERE r.message_uuid IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.zapp_evolution_messages m
      WHERE m.id = r.message_uuid AND m.instance_name = r.instance_name
    );

  RETURN jsonb_build_object(
    'ok', true,
    'ran_at', now(),
    'mdq_orphans_deleted', v_mdq_deleted,
    'mlr_orphans_detected', v_mlr_orphans
  );
END;
$function$;

CREATE OR REPLACE FUNCTION evo.fn_enqueue_orphan_media(p_limit integer DEFAULT 500, p_days_back integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'evo', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_enqueued integer;
BEGIN
  INSERT INTO evo.media_download_queue (
    message_id, message_uuid, remote_jid, instance_name,
    media_type, media_key, direct_path, mimetype, priority, status
  )
  SELECT
    m.message_id,
    m.id,
    m.remote_jid,
    m.instance_name,
    m.message_type::text,
    COALESCE(m.media_meta->>'mediaKey',  m.ingest_meta->>'mediaKey'),
    COALESCE(m.media_meta->>'directPath', m.ingest_meta->>'directPath'),
    COALESCE(m.media_meta->>'mimetype',   m.ingest_meta->>'mimetype'),
    10,       -- sempre priority 10 (só entram mensagens com chave agora)
    'pending'
  FROM public.zapp_evolution_messages_wpp2 m
  WHERE m.message_type::text IN ('image','video','audio','ptt','document','sticker')
    AND (m.media_url IS NULL OR m.media_url = '')
    AND (m.media_status IS NULL OR m.media_status NOT IN ('ready','permanently_lost'))
    AND m.deleted_at IS NULL
    AND m.created_at > now() - make_interval(days := p_days_back)
    AND m.message_id IS NOT NULL
    -- PATCH 2026-08-10: só enfileira se tiver mediaKey — sem chave o worker não consegue baixar
    -- elimina churn de itens keyless que ficam pending eternamente
    AND COALESCE(m.media_meta->>'mediaKey', m.ingest_meta->>'mediaKey') IS NOT NULL
  ORDER BY m.created_at DESC
  LIMIT p_limit
  ON CONFLICT (message_id) DO NOTHING;

  GET DIAGNOSTICS v_enqueued = ROW_COUNT;
  RETURN v_enqueued;
END;
$function$;

CREATE OR REPLACE FUNCTION evo.fn_watchdog_media_links()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ DECLARE v_ready_truncados int; v_r2_total int; v_r2_completo int; v_pct_saudavel numeric; v_novos_1h int; v_alert boolean; v_payload jsonb; v_rate_max int := 10; v_pct_min numeric := 90.0; BEGIN SELECT count(*) INTO v_ready_truncados FROM public.zapp_evolution_media WHERE media_status = 'ready' AND storage_url LIKE '%zapp-media-proxy%' AND split_part(storage_url, '/', 6) = ''; SELECT count(*), count(*) FILTER (WHERE split_part(storage_url, '/', 6) <> '') INTO v_r2_total, v_r2_completo FROM public.zapp_evolution_media WHERE media_status = 'ready' AND storage_url LIKE '%zapp-media-proxy%'; v_pct_saudavel := CASE WHEN v_r2_total = 0 THEN 100.0 ELSE round(100.0 * v_r2_completo / v_r2_total, 2) END; SELECT count(*) INTO v_novos_1h FROM public.zapp_evolution_media WHERE storage_url LIKE '%zapp-media-proxy%' AND split_part(storage_url, '/', 6) = '' AND created_at > now() - interval '1 hour'; v_alert := (v_ready_truncados > 0) OR (v_novos_1h >= v_rate_max) OR (v_pct_saudavel < v_pct_min); v_payload := jsonb_build_object('status', CASE WHEN v_alert THEN 'alerta' ELSE 'ok' END, 'ready_truncados', v_ready_truncados, 'r2_ready_total', v_r2_total, 'r2_ready_completo', v_r2_completo, 'r2_pct_saudavel', v_pct_saudavel, 'novos_truncados_1h', v_novos_1h, 'thresholds', jsonb_build_object('ready_truncados_max', 0, 'novos_1h_max', v_rate_max, 'pct_min', v_pct_min), 'checked_at', now()); INSERT INTO evo._watchdog_media_links_log (checked_at, payload, alert) VALUES (now(), v_payload, v_alert); RETURN v_payload::text; END $function$;

CREATE OR REPLACE FUNCTION evo.fn_detect_instance_recreate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE
  v_instance_id text;
  v_cooldown_ok boolean;
  v_webhook_payload jsonb;
  v_webhook_url text;
BEGIN
  IF NEW.instance_name != 'wpp2' THEN
    RETURN NEW;
  END IF;

  IF NEW.state NOT IN ('closed', 'disconnected', 'logout') THEN
    RETURN NEW;
  END IF;

  -- Cooldown 5min
  SELECT NOT EXISTS(
    SELECT 1 FROM evo.evolution_bootstrap_log
    WHERE instance_name = NEW.instance_name
      AND created_at > now() - interval '5 minutes'
      AND triggered_by = 'auto-connection-trigger'
  ) INTO v_cooldown_ok;

  IF NOT v_cooldown_ok THEN
    RETURN NEW;
  END IF;

  -- Buscar instanceId
  SELECT id::text INTO v_instance_id
  FROM public.zapp_instance_credentials
  WHERE instance_name = NEW.instance_name AND is_active = true
  LIMIT 1;

  -- 1. Registrar diretamente no bootstrap_log (a ação crítica)
  INSERT INTO evo.evolution_bootstrap_log (
    instance_name, instance_id, triggered_by,
    settings_applied, rabbitmq_events_count, status, notes
  ) VALUES (
    NEW.instance_name,
    COALESCE(v_instance_id, 'unknown'),
    'auto-connection-trigger',
    NULL, NULL,
    'registered',
    format('Estado %s→%s detectado em %s. Verificar se instância foi recriada.',
           COALESCE(NEW.previous_state, 'unknown'), NEW.state, NEW.created_at)
  );

  -- 2. Chamar n8n webhook via pg_net para notificação externa
  v_webhook_url := COALESCE(ops.fn_get_vault_secret('n8n_bootstrap_alert_webhook'), 'https://webhook.atomicabr.com.br/webhook/evolution-bootstrap-alert');
  v_webhook_payload := jsonb_build_object(
    'event', 'LOGOUT_INSTANCE',
    'instance', NEW.instance_name,
    'instanceId', COALESCE(v_instance_id, 'unknown'),
    'state', NEW.state,
    'previous_state', NEW.previous_state,
    'detected_at', NEW.created_at
  );

  PERFORM net.http_post(
    url := v_webhook_url,
    body := v_webhook_payload,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RAISE WARNING 'Bootstrap Alert: wpp2 state→%. Bootstrap registered + n8n notified.', NEW.state;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Não falhar o INSERT principal por erro no webhook
  RAISE WARNING 'Bootstrap trigger error (non-fatal): %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION evo.fn_sync_messages_to_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE
  v_last_synced   timestamptz;
  v_inserted      int := 0;
  v_window_start  timestamptz;
BEGIN
  SELECT max(created_at)
  INTO v_last_synced
  FROM evo.evolution_webhook_events_v2
  WHERE instance_name = 'wpp2'
    AND payload->>'heartbeat' IS NULL
    AND payload->>'backfill_source' IS NULL;
  v_window_start := COALESCE(v_last_synced, now() - interval '2 hours');
  INSERT INTO evo.evolution_webhook_events_v2 (
    id, event_type, instance_name, remote_jid, from_me,
    message_type, push_name, payload, processed, processed_at,
    status, retry_count, created_at
  )
  SELECT
    gen_random_uuid(),
    'messages.upsert',
    m.instance_name,
    m.remote_jid,
    m.from_me,
    m.message_type,
    NULL,
    jsonb_build_object(
      'messageId', m.message_id,
      'remoteJid', m.remote_jid,
      'fromMe', m.from_me,
      'messageType', m.message_type,
      'content', m.content,
      'sync_source', 'fn_sync_messages_to_v2',
      'sync_ts', now()
    ),
    true,
    now(),
    'processed',
    0,
    m.created_at
  FROM public.zapp_evolution_messages m
  WHERE m.instance_name = 'wpp2'
    AND m.created_at > v_window_start
    AND NOT EXISTS (
      SELECT 1 FROM evo.evolution_webhook_events_v2 ev
      WHERE ev.instance_name = 'wpp2'
        AND ev.created_at = m.created_at
        AND ev.payload->>'messageId' = m.message_id
    )
  ORDER BY m.created_at ASC
  LIMIT 500;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'window_start', v_window_start,
    'executed_at', now()
  );
END;
$function$;

-- INSERT+dedup manual de alerta convertido para zapp.rpc_boundary_raise_alert
-- (..., interval '6 hours') — semantica de dedup identica (ver cabecalho).
CREATE OR REPLACE FUNCTION evo.fn_e2e_media_probe(p_window_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_since         timestamptz := now() - (p_window_hours || ' hours')::interval;
  v_media_total   integer;
  v_media_com_key integer;
  v_media_sem_key integer;
  v_pct           numeric(5,2);
  v_text_total    integer;
  v_quoted_total  integer;
  v_edited_total  integer;
  v_wal_lag_mb    numeric(8,1);
  v_wpp2_state    text;
  v_resultado     text;
  v_fail_reason   text;
  v_alert         boolean := false;
  v_now_brt       timestamptz;
  v_hour_brt      integer;
  v_is_business   boolean;
  v_probe_id      bigint;
BEGIN
  -- FIX: aceitar AMBOS formatos (com e sem sufixo Message)
  SELECT count(*),
         count(*) FILTER (WHERE ingest_meta->>'mediaKey' IS NOT NULL),
         count(*) FILTER (WHERE ingest_meta->>'mediaKey' IS NULL)
  INTO v_media_total, v_media_com_key, v_media_sem_key
  FROM public.zapp_evolution_messages_wpp2
  WHERE created_at >= v_since
    AND message_type IN ('image','audio','video','document','sticker',
                         'imageMessage','audioMessage','videoMessage',
                         'documentMessage','stickerMessage','ptvMessage','albumMessage');

  -- FIX: aceitar 'conversation' como text
  SELECT count(*) INTO v_text_total
  FROM public.zapp_evolution_messages_wpp2
  WHERE created_at >= v_since
    AND message_type IN ('text','conversation');

  SELECT count(*) INTO v_quoted_total
  FROM public.zapp_evolution_messages_wpp2
  WHERE created_at >= v_since AND quoted_message_id IS NOT NULL;

  SELECT count(*) INTO v_edited_total
  FROM public.zapp_evolution_messages_wpp2
  WHERE created_at >= v_since AND edited_at IS NOT NULL;

  SELECT round(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)/1024.0/1024.0, 1)
  INTO v_wal_lag_mb
  FROM pg_replication_slots WHERE slot_name LIKE 'cainophile%' LIMIT 1;

  SELECT lower(status) INTO v_wpp2_state
  FROM public.zapp_whatsapp_connections WHERE instance_name='wpp2' LIMIT 1;

  v_now_brt    := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hour_brt   := EXTRACT(HOUR FROM v_now_brt);
  v_is_business := (EXTRACT(DOW FROM v_now_brt) BETWEEN 1 AND 5)
                   AND (v_hour_brt BETWEEN 8 AND 19);

  IF v_media_total = 0 THEN
    IF v_text_total = 0 AND v_is_business THEN
      v_resultado   := 'DEGRADED';
      v_fail_reason := format('0 mensagens (texto+midia) em %sh durante horario comercial', p_window_hours);
      v_alert       := true;
    ELSIF v_text_total = 0 THEN
      v_resultado := 'NO_DATA';
      v_fail_reason := format('0 mensagens na janela de %sh (fora do horario comercial)', p_window_hours);
    ELSE
      v_resultado := 'NO_DATA';
      v_fail_reason := format('0 midias na janela (%s textos recebidos)', v_text_total);
    END IF;
    v_pct := NULL;
  ELSE
    v_pct := round(100.0 * v_media_com_key / v_media_total, 2);
    IF v_pct >= 95 THEN
      v_resultado := 'PASS';
    ELSIF v_pct >= 70 THEN
      v_resultado   := 'DEGRADED';
      v_fail_reason := format('%s%% das midias com mediaKey (limite: 95%%). %s sem key.', round(v_pct, 1)::text, v_media_sem_key);
      v_alert := true;
    ELSE
      v_resultado   := 'FAIL';
      v_fail_reason := format('CRITICO: %s%% midias com mediaKey. %s sem key.', round(v_pct, 1)::text, v_media_sem_key);
      v_alert := true;
    END IF;
  END IF;

  IF v_wal_lag_mb > 400 THEN
    v_resultado   := CASE WHEN v_resultado = 'PASS' THEN 'DEGRADED' ELSE v_resultado END;
    v_fail_reason := coalesce(v_fail_reason || ' | ', '') || format('WAL lag alto: %s MB', v_wal_lag_mb::text);
    v_alert       := true;
  END IF;

  INSERT INTO evo.e2e_probe_results (
    window_hours, media_total, media_com_key, media_sem_key, pct_com_key,
    text_total, quoted_total, edited_total,
    resultado, fail_reason, wal_lag_mb, wpp2_state, alert_aberto, notes
  ) VALUES (
    p_window_hours, v_media_total, v_media_com_key, v_media_sem_key, v_pct,
    v_text_total, v_quoted_total, v_edited_total,
    v_resultado, v_fail_reason, v_wal_lag_mb, v_wpp2_state, v_alert,
    format('probe-fix-v2|brt=%s|biz=%s|wpp2=%s',
           to_char(v_now_brt,'HH24:MI'), v_is_business::text, coalesce(v_wpp2_state,'?'))
  ) RETURNING id INTO v_probe_id;

  IF v_alert THEN
    PERFORM zapp.rpc_boundary_raise_alert(
      'e2e_media_probe',
      CASE WHEN v_resultado = 'FAIL' THEN 'critical' ELSE 'high' END,
      format('[E2E] Probe de midia: %s', v_resultado),
      coalesce(v_fail_reason, v_resultado),
      jsonb_build_object('probe_id', v_probe_id, 'resultado', v_resultado,
        'pct_com_key', v_pct, 'media_total', v_media_total,
        'media_sem_key', v_media_sem_key, 'wal_lag_mb', v_wal_lag_mb),
      interval '6 hours');
  END IF;

  RETURN jsonb_build_object(
    'probe_id', v_probe_id, 'resultado', v_resultado, 'pct_com_key', v_pct,
    'media_total', v_media_total, 'media_com_key', v_media_com_key,
    'media_sem_key', v_media_sem_key, 'text_total', v_text_total,
    'quoted_total', v_quoted_total, 'edited_total', v_edited_total,
    'wal_lag_mb', v_wal_lag_mb, 'wpp2_state', v_wpp2_state,
    'fail_reason', v_fail_reason, 'window_hours', p_window_hours,
    'is_business', v_is_business
  );
END;
$function$;
