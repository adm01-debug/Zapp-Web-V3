-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250009), sem arquivo
-- correspondente neste repo. Ver cabecalho completo em 20260815250008_*.sql
-- (mesmo lote/criterio, mesma convencao: CREATE OR REPLACE direto em zapp +
-- DROP do lado evo, convergente ao estado final de producao).
--
-- Fonte: docs/decouple/E59_E60_MOVE_LOG.md, secao "Restante do backlog E59"
-- ("Lote 2 — EXECUTADO 2026-08-15"). Corpos: pg_get_functiondef em producao.
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_monitor_lid_contamination()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_total_conv    bigint;
  v_lid_conv      bigint;
  v_lid_7d        bigint;
  v_fake_msgs     bigint;
  v_canary_fake   bigint;
  v_real_fake     bigint;
  v_pct_lid_conv  numeric;
  v_threshold     numeric := 40.0;
  v_result        jsonb;
BEGIN
  -- Conversas com @lid (preservado pelo normalizer — CORRETO pós LID-FIX-01)
  SELECT
    count(*),
    count(*) FILTER (WHERE remote_jid LIKE '%@lid'),
    count(*) FILTER (WHERE remote_jid LIKE '%@lid' AND updated_at > now()-interval '7 days')
  INTO v_total_conv, v_lid_conv, v_lid_7d
  FROM zapp.evolution_conversations_wpp2;

  -- Fake JIDs históricos em mensagens (evolution_messages_wpp2 ainda em evo)
  SELECT
    count(*),
    count(*) FILTER (WHERE message_id LIKE 'pg-cron-canary-%'),
    count(*) FILTER (WHERE message_id NOT LIKE 'pg-cron-canary-%')
  INTO v_fake_msgs, v_canary_fake, v_real_fake
  FROM zapp.evolution_messages_wpp2
  WHERE remote_jid ~ '^[0-9]{14,}@s\.whatsapp\.net$'
    AND split_part(remote_jid,'@',1) !~ '.*:.*';

  v_pct_lid_conv := round(100.0 * v_lid_conv / nullif(v_total_conv, 0), 1);

  v_result := jsonb_build_object(
    'checked_at',          now(),
    'total_conversations', v_total_conv,
    'lid_conversations',   v_lid_conv,
    'lid_conversations_7d_new', v_lid_7d,
    'pct_lid_conversations', v_pct_lid_conv,
    'fake_jid_msgs_total', v_fake_msgs,
    'fake_jid_canary',     v_canary_fake,
    'fake_jid_real_users', v_real_fake,
    'lid_paradigm',        'PRESERVED',
    'fake_jid_trend',      CASE
                             WHEN v_canary_fake <= 511 THEN 'STABLE (canary fixed)'
                             ELSE 'GROWING (investigate canary cron)'
                           END,
    'threshold_pct',       v_threshold,
    'status',              CASE WHEN v_pct_lid_conv >= v_threshold THEN 'HIGH_LID_RATE' ELSE 'OK' END,
    'note',                'LID-FIX-01 2026-08-11: @lid preservado intencionalmente. fake_jids históricos=43.666 irrecuperáveis sem Evolution >=2.4.x. Canary fixado (lid_safe=true).'
  );

  IF v_pct_lid_conv >= v_threshold THEN
    INSERT INTO zapp.evolution_alerts (severity, alert_type, message, payload)
    SELECT
      'high', 'lid_contamination_high',
      format('%s%% conversas com @lid (threshold %s%%). Baseline 34.3%%. Verificar fn_normalize_remote_jid.', v_pct_lid_conv, v_threshold),
      v_result
    WHERE NOT EXISTS (
      SELECT 1 FROM zapp.evolution_alerts
      WHERE alert_type = 'lid_contamination_high'
        AND resolved_at IS NULL
        AND created_at >= now() - INTERVAL '24 hours'
    );
  END IF;

  RETURN v_result;
END $function$;

DROP FUNCTION IF EXISTS evo.fn_monitor_lid_contamination();

CREATE OR REPLACE FUNCTION zapp.fn_monitor_pino_timeouts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_count  bigint;
  v_status text;
  v_result jsonb;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM zapp.evolution_health_logs
  WHERE created_at >= now() - INTERVAL '2 hours'
    AND (
      error_message ILIKE '%timed out%'
      OR metadata::text ILIKE '%timed out%'
    );

  v_status := CASE
    WHEN v_count = 0  THEN 'PASS'
    WHEN v_count < 5  THEN 'INFO'
    ELSE 'WARN'
  END;

  RETURN jsonb_build_object(
    'checked_at',          now(),
    'status',              v_status,
    'timed_out_count_2h',  v_count,
    'note', CASE
      WHEN v_count < 5 THEN 'Pino timeouts within normal Baileys keepalive range'
      ELSE 'Elevated Pino timeouts — check Baileys connection stability'
    END
  );
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_monitor_pino_timeouts();

CREATE OR REPLACE FUNCTION zapp.fn_update_instance_health()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_gap          numeric;
  v_msgs_1h      int;
  v_status       text;
  v_socket_ok    boolean;
  v_dow          int  := EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo');
  v_is_fds       boolean := v_dow IN (0, 6);
  v_gap_healthy  int := 10;   -- gap < 10min = healthy sempre
  v_gap_degraded int;         -- threshold FDS-adaptativo
BEGIN
  -- Fonte canônica: zapp.evolution_messages (pós-migração self-hosted)
  SELECT
    ROUND(EXTRACT(EPOCH FROM (now() - MAX(created_at))) / 60, 1),
    COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '1h')
  INTO v_gap, v_msgs_1h
  FROM zapp.evolution_messages;

  -- Threshold adaptativo dia da semana
  v_gap_degraded := CASE WHEN v_is_fds THEN 120 ELSE 30 END;

  v_status := CASE
    WHEN v_msgs_1h > 0 AND v_gap < v_gap_healthy THEN 'healthy'
    WHEN v_gap < v_gap_degraded                   THEN 'degraded'
    WHEN v_is_fds AND v_msgs_1h > 0               THEN 'degraded'
    ELSE 'unhealthy'
  END;

  -- GUARD v3: se socket WhatsApp REALMENTE conectado e tabela atualizada < 20min,
  -- nunca reportar 'unhealthy' só por volume baixo de mensagens.
  -- Distingue "conexão técnica OK" de "empresa quieta" (B2B domingo).
  IF v_status = 'unhealthy' THEN
    SELECT (status = 'connected' AND updated_at > now() - INTERVAL '20 minutes')
    INTO v_socket_ok
    FROM zapp.whatsapp_connections
    WHERE instance_name = 'wpp2'
    LIMIT 1;

    IF COALESCE(v_socket_ok, false) THEN
      v_status := 'degraded';  -- socket ok, empresa quieta → degraded (não unhealthy)
    END IF;
  END IF;

  UPDATE zapp.evolution_instance_credentials
  SET health_status      = v_status,
      last_health_check  = NOW(),
      online_instances   = CASE WHEN v_status IN ('healthy', 'degraded') THEN 1 ELSE 0 END,
      notes = FORMAT(
        'gap=%smin msgs1h=%s auto-check=%s src=evolution_messages fds=%s gap_thr=%s socket_guard=%s v3',
        v_gap, v_msgs_1h, NOW()::text, v_is_fds, v_gap_degraded,
        COALESCE(v_socket_ok, false)
      )
  WHERE instance_name = 'wpp2';
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_update_instance_health();

-- Repoint dos 3 crons (comandos exatos, confirmados em cron.job)
SELECT cron.alter_job(147, command => 'SELECT zapp.fn_monitor_pino_timeouts()');
SELECT cron.alter_job(187, command => 'SELECT zapp.fn_monitor_lid_contamination()');
SELECT cron.alter_job(300, command => 'SELECT zapp.fn_update_instance_health()');
