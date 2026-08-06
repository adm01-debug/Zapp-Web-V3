-- ============================================================================
-- FIX DB-02b — zapp.fn_purge_api_key_from_logs: correção do RETURN
-- (descoberta no TESTE RUNTIME REAL do fix DB-02, 2026-08-06)
-- ============================================================================
-- Tipo: FIX (bug pré-existente herdado do baseline — nunca exercitado em
--        produção porque o bloco morto (tabela evo.evolution_webhook_events)
--        abortava a função antes do RETURN).
--
-- BUG (evidenciado no banco durante teste runtime do DB-02):
--   SELECT zapp.fn_purge_api_key_from_logs('ZAPP_TEST_KEY_...') falhava com:
--     'cannot get array length of a non-array'
--   Causa: v_result é um OBJETO jsonb ('{}' inicial, enriquecido com
--   jsonb_build_object por tabela atingida). O RETURN chamava
--   jsonb_array_length(to_json(v_result)::jsonb) — jsonb_array_length exige
--   ARRAY jsonb; com objeto, lança exceção SEMPRE (100% das execuções,
--   inclusive tables_hit=0). A exceção aborta a transação → os UPDATEs dos
--   passos 1-11 são desfeitos → a purga NUNCA persiste (E3-04 permanecia
--   aberta mesmo após o DB-02).
--
-- AÇÃO (mudança mínima, mesma intenção):
--   'tables_hit' agora conta as CHAVES do objeto v_result (número de tabelas
--   atingidas), via subquery jsonb_object_keys:
--     (SELECT count(*)::int FROM jsonb_object_keys(v_result))
--   Com v_result = '{}' → tables_hit = 0 (correto). Com N tabelas atingidas
--   → tables_hit = N (correto). Verificado isoladamente no banco:
--   '{}' → 0, '{"a":1,"b":2}' → 2.
--
-- ROLLBACK:
--   Reaplicar o corpo da migration 20260806121000_db02_purge_api_key_logs.sql
--   (que restaura jsonb_array_length(to_json(v_result)::jsonb) no RETURN).
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_purge_api_key_from_logs(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'archive', 'cron', 'ops'
AS $function$
  -- 7 (removido em 2026-08-06, fix DB-02): UPDATE na tabela de
  --   webhook_events ANTIGA (parent LIST sem sufixo _v2) — tabela inexistente
  --   (to_regclass = NULL); o parent real é a _v2, coberto pelo passo abaixo.
  --   O passo morto abortava a função em runtime antes dos passos 8-12.

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
    WHERE error_message LIKE '%' || p_key || '%'
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
    WHERE payload::text   LIKE '%' || p_key || '%'
       OR raw_payload     LIKE '%' || p_key || '%'
       OR error_message   LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('evo.evolution_webhook_dlq', v_n);
  END IF;

  -- 7. evo.evolution_webhook_events_v2 — RANGE-partitioned (17 partitions covered by parent UPDATE)
  UPDATE evo.evolution_webhook_events_v2
    SET payload = CASE WHEN payload::text LIKE '%' || p_key || '%'
                       THEN replace(payload::text, p_key, v_redacted)::jsonb
                       ELSE payload END,
        error_message = replace(error_message, p_key, v_redacted)
    WHERE payload::text LIKE '%' || p_key || '%'
       OR error_message LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('evo.evolution_webhook_events_v2 (all partitions)', v_n);
  END IF;

  -- 8. ops.ddl_audit — query (text)
  UPDATE ops.ddl_audit
    SET query = replace(query, p_key, v_redacted)
    WHERE query LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('ops.ddl_audit', v_n);
  END IF;

  -- 9. zapp.webhook_audit_log — request_body / response_body (jsonb) + error_message (text)
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

  -- 10. zapp.provider_message_log — request_body / response_body / payload (jsonb) + error_message (text)
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

  -- 11. zapp.system_logs — message (text) + metadata (jsonb)
  UPDATE zapp.system_logs
    SET message  = replace(message, p_key, v_redacted),
        metadata = CASE WHEN metadata::text LIKE '%' || p_key || '%'
                        THEN replace(metadata::text, p_key, v_redacted)::jsonb
                        ELSE metadata END
    WHERE message        LIKE '%' || p_key || '%'
       OR metadata::text LIKE '%' || p_key || '%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_result := v_result || jsonb_build_object('zapp.system_logs', v_n);
  END IF;

  RETURN jsonb_build_object(
    'purged_at',      now(),
    'key_prefix',     left(p_key, 4) || repeat('*', GREATEST(0, length(p_key) - 4)),
    'tables_hit',     (SELECT count(*)::int FROM jsonb_object_keys(v_result)),
    'detail',         v_result
  );
END;
$function$
