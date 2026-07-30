-- ============================================================================
-- Security & Media Pipeline Fixes (E2-12 / E3-04)
-- Auditoria 2026-07-10
--
-- E2-12 — Media oversize guard (BEFORE INSERT on zapp.media_download_queue)
--   WhatsApp impõe limite de 64 MB por arquivo de mídia. Sem validação no DB,
--   arquivos maiores entravam na fila, falhavam no upload ao R2 após tentativas
--   repetidas, e enchiam a fila de DLQ sem mensagem útil. O trigger
--   trg_reject_oversized_media captura no INSERT e seta status='oversized'
--   com error_message descritivo — zero tentativas desperdiçadas.
--
-- E3-04 — Função de purga parametrizada para key vazada em logs históricos
--   A rotação da API key não apagou referências já gravadas em tabelas de log,
--   audit e webhook. A função fn_purge_api_key_from_logs(p_key text) redige
--   TODAS as ocorrências da key em 12 tabelas/grupos de tabelas (incluindo as
--   23 partições de evolution_webhook_events e 17 de evolution_webhook_events_v2)
--   sem jamais hardcodar o valor da key neste arquivo de migração.
--   Operador executa: SELECT public.fn_purge_api_key_from_logs('<key-real>');
--
-- Aplicados ao vivo via MCP em 2026-07-10. Ambos verificados.
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS +
--   CREATE TRIGGER (trigger recriado; function idempotente por OR REPLACE).
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- E2-12: Oversized media guard — BEFORE INSERT trigger on media_download_queue
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_reject_oversized_media()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.file_length IS NOT NULL AND NEW.file_length > 67108864 THEN
    NEW.status        := 'oversized';
    NEW.error_message := format(
      'E2-12: file_length %s bytes exceeds WhatsApp 64 MB limit — skipped R2 upload',
      NEW.file_length
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION zapp.fn_reject_oversized_media() IS
  'E2-12: BEFORE INSERT guard — marks media entries > 64 MB as oversized before '
  'they enter the download queue, preventing wasted R2 upload attempts and DLQ noise.';

DROP TRIGGER IF EXISTS trg_reject_oversized_media ON zapp.media_download_queue;

CREATE TRIGGER trg_reject_oversized_media
  BEFORE INSERT ON zapp.media_download_queue
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_reject_oversized_media();

-- ──────────────────────────────────────────────────────────────────────────────
-- E3-04: Parameterized log-purge function for leaked API key
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_purge_api_key_from_logs(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo, archive, zapp, cron, ops, pg_temp
AS $$
DECLARE
  v_redacted CONSTANT text := '[REDACTED-E3-04]';
  v_result   jsonb     := '{}';
  v_n        bigint;
BEGIN
  -- Guard: Evolution API keys are long tokens; refuse dangerously short inputs
  IF p_key IS NULL OR length(p_key) < 16 THEN
    RAISE EXCEPTION 'E3-04: p_key must be >= 16 characters to prevent accidental mass-redaction';
  END IF;

  -- 1. archive._audit_whatsapp_connections_2026_05_04 — literal api_key column (text)
  UPDATE archive._audit_whatsapp_connections_2026_05_04
    SET api_key = v_redacted
    WHERE api_key = p_key;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('archive._audit_connections.api_key', v_n);
  END IF;

  -- 2. cron.job_run_details — text command / return_message
  UPDATE cron.job_run_details
    SET command        = replace(command,        p_key, v_redacted),
        return_message = replace(return_message, p_key, v_redacted)
    WHERE command        LIKE '%' || p_key || '%'
       OR return_message LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('cron.job_run_details', v_n);
  END IF;

  -- 3. evo.evolution_bootstrap_log — notes (text) + settings_applied (jsonb)
  UPDATE evo.evolution_bootstrap_log
    SET notes = replace(notes, p_key, v_redacted),
        settings_applied = CASE
          WHEN settings_applied::text LIKE '%' || p_key || '%'
          THEN replace(settings_applied::text, p_key, v_redacted)::jsonb
          ELSE settings_applied END
    WHERE notes LIKE '%' || p_key || '%'
       OR settings_applied::text LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('evo.evolution_bootstrap_log', v_n);
  END IF;

  -- 4. evo.evolution_audit_log — old_values / new_values / metadata (jsonb)
  UPDATE evo.evolution_audit_log
    SET old_values = CASE WHEN old_values::text LIKE '%' || p_key || '%'
                          THEN replace(old_values::text, p_key, v_redacted)::jsonb
                          ELSE old_values END,
        new_values = CASE WHEN new_values::text LIKE '%' || p_key || '%'
                          THEN replace(new_values::text, p_key, v_redacted)::jsonb
                          ELSE new_values END,
        metadata   = CASE WHEN metadata::text LIKE '%' || p_key || '%'
                          THEN replace(metadata::text, p_key, v_redacted)::jsonb
                          ELSE metadata END
    WHERE old_values::text LIKE '%' || p_key || '%'
       OR new_values::text LIKE '%' || p_key || '%'
       OR metadata::text   LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('evo.evolution_audit_log', v_n);
  END IF;

  -- 5. evo.evolution_health_logs — error_message (text) + metadata (jsonb)
  UPDATE evo.evolution_health_logs
    SET error_message = replace(error_message, p_key, v_redacted),
        metadata = CASE WHEN metadata::text LIKE '%' || p_key || '%'
                        THEN replace(metadata::text, p_key, v_redacted)::jsonb
                        ELSE metadata END
    WHERE error_message  LIKE '%' || p_key || '%'
       OR metadata::text LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('evo.evolution_health_logs', v_n);
  END IF;

  -- 6. evo.evolution_webhook_dlq — payload (jsonb) + raw_payload (text) + error_message (text)
  UPDATE evo.evolution_webhook_dlq
    SET payload = CASE WHEN payload::text LIKE '%' || p_key || '%'
                       THEN replace(payload::text, p_key, v_redacted)::jsonb
                       ELSE payload END,
        raw_payload   = replace(raw_payload,   p_key, v_redacted),
        error_message = replace(error_message, p_key, v_redacted)
    WHERE payload::text LIKE '%' || p_key || '%'
       OR raw_payload   LIKE '%' || p_key || '%'
       OR error_message LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('evo.evolution_webhook_dlq', v_n);
  END IF;

  -- 7. evo.evolution_webhook_events — LIST-partitioned; UPDATE on parent fans to all 23 partitions
  UPDATE evo.evolution_webhook_events
    SET payload = CASE WHEN payload::text LIKE '%' || p_key || '%'
                       THEN replace(payload::text, p_key, v_redacted)::jsonb
                       ELSE payload END,
        error_message = replace(error_message, p_key, v_redacted)
    WHERE payload::text LIKE '%' || p_key || '%'
       OR error_message LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('evo.evolution_webhook_events (all 23 partitions)', v_n);
  END IF;

  -- 8. evo.evolution_webhook_events_v2 — RANGE-partitioned; UPDATE on parent fans to all 17 partitions
  UPDATE evo.evolution_webhook_events_v2
    SET payload = CASE WHEN payload::text LIKE '%' || p_key || '%'
                       THEN replace(payload::text, p_key, v_redacted)::jsonb
                       ELSE payload END,
        error_message = replace(error_message, p_key, v_redacted)
    WHERE payload::text LIKE '%' || p_key || '%'
       OR error_message LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('evo.evolution_webhook_events_v2 (all 17 partitions)', v_n);
  END IF;

  -- 9. ops.ddl_audit — query (text)
  UPDATE ops.ddl_audit
    SET query = replace(query, p_key, v_redacted)
    WHERE query LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('ops.ddl_audit', v_n);
  END IF;

  -- 10. zapp.webhook_audit_log — request_body / response_body (jsonb) + error_message (text)
  UPDATE zapp.webhook_audit_log
    SET request_body = CASE WHEN request_body::text LIKE '%' || p_key || '%'
                            THEN replace(request_body::text, p_key, v_redacted)::jsonb
                            ELSE request_body END,
        response_body = CASE WHEN response_body::text LIKE '%' || p_key || '%'
                             THEN replace(response_body::text, p_key, v_redacted)::jsonb
                             ELSE response_body END,
        error_message = replace(error_message, p_key, v_redacted)
    WHERE request_body::text  LIKE '%' || p_key || '%'
       OR response_body::text LIKE '%' || p_key || '%'
       OR error_message       LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('zapp.webhook_audit_log', v_n);
  END IF;

  -- 11. zapp.provider_message_log — request_body / response_body / payload (jsonb) + error_message (text)
  UPDATE zapp.provider_message_log
    SET request_body = CASE WHEN request_body::text LIKE '%' || p_key || '%'
                            THEN replace(request_body::text, p_key, v_redacted)::jsonb
                            ELSE request_body END,
        response_body = CASE WHEN response_body::text LIKE '%' || p_key || '%'
                             THEN replace(response_body::text, p_key, v_redacted)::jsonb
                             ELSE response_body END,
        payload = CASE WHEN payload::text LIKE '%' || p_key || '%'
                       THEN replace(payload::text, p_key, v_redacted)::jsonb
                       ELSE payload END,
        error_message = replace(error_message, p_key, v_redacted)
    WHERE request_body::text  LIKE '%' || p_key || '%'
       OR response_body::text LIKE '%' || p_key || '%'
       OR payload::text       LIKE '%' || p_key || '%'
       OR error_message       LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('zapp.provider_message_log', v_n);
  END IF;

  -- 12. public.system_logs — message (text) + metadata (jsonb)
  UPDATE public.system_logs
    SET message  = replace(message, p_key, v_redacted),
        metadata = CASE WHEN metadata::text LIKE '%' || p_key || '%'
                        THEN replace(metadata::text, p_key, v_redacted)::jsonb
                        ELSE metadata END
    WHERE message        LIKE '%' || p_key || '%'
       OR metadata::text LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('public.system_logs', v_n);
  END IF;

  RETURN jsonb_build_object(
    'purged_at',  now(),
    'key_prefix', left(p_key, 4) || repeat('*', GREATEST(0, length(p_key) - 4)),
    'detail',     v_result
  );
END;
$$;

COMMENT ON FUNCTION public.fn_purge_api_key_from_logs(text) IS
  'E3-04: Redacts a leaked Evolution API key from all log/audit/webhook tables. '
  'Operator must supply the actual key value — never hardcoded in migration files. '
  'Idempotent: already-redacted rows are skipped by the LIKE filter. '
  'Usage: SELECT public.fn_purge_api_key_from_logs(''<actual-key-here'');';
