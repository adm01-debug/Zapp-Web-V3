-- =============================================================================
-- Decouple I4 — evo.fn_purge_storage_cache → vault supabase_api_url
-- URL hardcoded → vault via ops.fn_get_vault_secret (fallback = literal atual).
-- Idempotente — CREATE OR REPLACE. Data: 2026-08-15.
-- =============================================================================

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
      FROM zapp.evolution_media e
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
      FROM zapp.evolution_media e
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
$function$

