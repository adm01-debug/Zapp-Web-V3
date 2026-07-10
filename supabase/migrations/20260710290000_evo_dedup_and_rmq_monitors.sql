-- ============================================================================
-- Dedup Cap Monitor + RabbitMQ Durability Audit (E8-01 + E8-04)
-- Auditoria 2026-07-10
--
-- E8-01 — Bug dedup sem cap ainda presente no consumer v2
--   O consumer v2 usa um JavaScript Set para deduplicar message_id antes de
--   gravar no Supabase. O Set nunca é purgado (sem TTL, sem max-size), então
--   sob carga de 500+ msgs cresce indefinidamente até OOM — ou pior, um restart
--   limpa o Set e todo o histórico vira duplicata no próximo processamento.
--
--   DB-side fix: monitorar evolution_messages para duplicatas por message_id
--   (prova de que o dedup falhou) e alertar quando detectadas.
--
-- E8-04 — Filas RabbitMQ não-durable (perda em crash/restart)
--   Se as filas RabbitMQ forem declaradas sem durable=true e deliveryMode=2
--   (persistent), uma reinicialização do broker perde todas as mensagens em fila.
--
--   DB-side fix: expor o estado de saúde das filas via DLQ metrics — se a DLQ
--   receber uma explosão de msgs após um restart suspeito (health log gap),
--   é sinal de que as filas não eram durable. Também registrar o risco como
--   função de auditoria consultável.
--
-- Idempotente: CREATE OR REPLACE VIEW + FUNCTION.
-- ============================================================================

-- ============================================================================
-- E8-01: Dedup Cap Monitor
-- ============================================================================

CREATE OR REPLACE VIEW evo.v_dedup_failures AS
SELECT
  message_id,
  COUNT(*)           AS duplicate_count,
  MIN(created_at)    AS first_seen,
  MAX(created_at)    AS last_seen,
  MAX(created_at) - MIN(created_at) AS time_spread,
  array_agg(DISTINCT instance_name) AS instances,
  array_agg(DISTINCT remote_jid)    AS jids
FROM evo.evolution_messages
WHERE message_id IS NOT NULL
  AND created_at >= now() - interval '24 hours'
GROUP BY message_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, last_seen DESC;

COMMENT ON VIEW evo.v_dedup_failures IS
  'E8-01: Duplicate message_id entries in evolution_messages (last 24h). '
  'Any row here means the consumer dedup Set missed this message_id — '
  'either due to Set growth/eviction or post-restart state loss. '
  'Source for fn_detect_dedup_cap_failures.';

CREATE OR REPLACE FUNCTION evo.fn_detect_dedup_cap_failures(
  p_window interval DEFAULT '1 hour'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  v_dedup_threshold  CONSTANT int := 3;  -- alert if > 3 duplicate message_ids in window
  v_total_dupes      bigint := 0;
  v_total_dup_rows   bigint := 0;
  v_worst_offenders  jsonb;
  v_result           jsonb;
  v_status           text;
BEGIN
  SELECT
    COUNT(DISTINCT message_id),
    SUM(cnt) - COUNT(DISTINCT message_id)  -- extra rows beyond first
  INTO v_total_dupes, v_total_dup_rows
  FROM (
    SELECT message_id, COUNT(*) AS cnt
    FROM evo.evolution_messages
    WHERE message_id IS NOT NULL
      AND created_at >= now() - p_window
    GROUP BY message_id
    HAVING COUNT(*) > 1
  ) t;

  -- Top duplicate offenders
  SELECT jsonb_agg(jsonb_build_object(
    'message_id',       message_id,
    'count',            cnt,
    'first_seen',       first_seen,
    'last_seen',        last_seen
  ) ORDER BY cnt DESC)
  INTO v_worst_offenders
  FROM (
    SELECT
      message_id,
      COUNT(*)         AS cnt,
      MIN(created_at)  AS first_seen,
      MAX(created_at)  AS last_seen
    FROM evo.evolution_messages
    WHERE message_id IS NOT NULL
      AND created_at >= now() - p_window
    GROUP BY message_id
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 5
  ) t;

  v_status := CASE
    WHEN v_total_dupes >= v_dedup_threshold THEN 'CRITICAL'
    WHEN v_total_dupes > 0                  THEN 'WARN'
    ELSE 'OK'
  END;

  IF v_status IN ('CRITICAL', 'WARN') THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'dedup_cap_failure',
        CASE WHEN v_status = 'CRITICAL' THEN 'critical' ELSE 'high' END,
        format('E8-01: Dedup failure — %s duplicate message_ids (%s extra rows) in %s',
          v_total_dupes, v_total_dup_rows, p_window),
        jsonb_build_object(
          'total_duplicate_ids',   v_total_dupes,
          'total_extra_rows',      v_total_dup_rows,
          'window',                p_window,
          'worst_offenders',       COALESCE(v_worst_offenders, '[]'::jsonb),
          'root_cause',            'Consumer v2 Set has no TTL/max-size; grows until OOM or loses state on restart',
          'fix_action',            'Add LRU cap (max 10k entries) + TTL (5min) to consumer dedup Set; or use DB UNIQUE constraint on message_id'
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN jsonb_build_object(
    'checked_at',           now(),
    'window',               p_window,
    'status',               v_status,
    'total_duplicate_ids',  v_total_dupes,
    'total_extra_rows',     COALESCE(v_total_dup_rows, 0),
    'worst_offenders',      COALESCE(v_worst_offenders, '[]'::jsonb),
    'threshold',            v_dedup_threshold,
    'root_cause',           'Consumer v2 Set has no TTL/max-size cap',
    'fix_action',           'Add LRU cap + TTL to dedup Set, or enforce UNIQUE on evolution_messages.message_id'
  );
END;
$$;

COMMENT ON FUNCTION evo.fn_detect_dedup_cap_failures(interval) IS
  'E8-01: Detects duplicate message_id entries in evolution_messages — proof that '
  'the consumer v2 dedup Set failed (no cap, no TTL, state lost on restart). '
  'WARN on first duplicate, CRITICAL when >= 3 duplicate IDs in window. '
  'Scheduled every 5 minutes via pg_cron.';

REVOKE EXECUTE ON FUNCTION evo.fn_detect_dedup_cap_failures(interval) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_detect_dedup_cap_failures(interval) TO service_role;

SELECT cron.unschedule('evo-dedup-cap-monitor')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evo-dedup-cap-monitor');

SELECT cron.schedule(
  'evo-dedup-cap-monitor',
  '*/5 * * * *',
  $$SELECT evo.fn_detect_dedup_cap_failures('1 hour'::interval)$$
);

-- ============================================================================
-- E8-04: RabbitMQ Durability Audit via DLQ post-restart correlation
-- ============================================================================

CREATE OR REPLACE FUNCTION evo.fn_audit_rmq_durability_risk(
  p_window interval DEFAULT '24 hours'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
DECLARE
  -- A RabbitMQ restart would show as a gap in health logs
  -- followed by a burst of DLQ entries (messages re-delivered in wrong order
  -- or not re-delivered at all if queue was non-durable)
  v_health_gaps       jsonb;
  v_dlq_burst_after   jsonb;
  v_total_dlq_in_win  bigint := 0;
  v_result            jsonb;
BEGIN
  -- Find gaps in health log continuity (possible broker restarts)
  SELECT jsonb_agg(jsonb_build_object(
    'gap_start',      prev_check,
    'gap_end',        this_check,
    'gap_minutes',    gap_minutes
  ) ORDER BY gap_minutes DESC)
  INTO v_health_gaps
  FROM (
    SELECT
      LAG(created_at) OVER (ORDER BY created_at) AS prev_check,
      created_at                                   AS this_check,
      EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at))) / 60 AS gap_minutes
    FROM evo.evolution_health_logs
    WHERE created_at >= now() - p_window
  ) t
  WHERE gap_minutes > 10  -- gaps > 10 min are suspicious (normal check is every ~5min)
  LIMIT 5;

  -- Count DLQ entries
  SELECT COUNT(*) INTO v_total_dlq_in_win
  FROM evo.evolution_webhook_dlq
  WHERE created_at >= now() - p_window;

  RETURN jsonb_build_object(
    'audited_at',              now(),
    'window',                  p_window,
    'health_log_gaps_found',   COALESCE(jsonb_array_length(v_health_gaps), 0),
    'health_log_gaps',         COALESCE(v_health_gaps, '[]'::jsonb),
    'dlq_entries_in_window',   v_total_dlq_in_win,
    'durability_risk',         CASE
                                 WHEN jsonb_array_length(COALESCE(v_health_gaps,'[]'::jsonb)) > 0
                                   AND v_total_dlq_in_win > 10
                                 THEN 'HIGH — health gap + DLQ spike suggests non-durable queue loss'
                                 WHEN jsonb_array_length(COALESCE(v_health_gaps,'[]'::jsonb)) > 0
                                 THEN 'MEDIUM — health gap detected; verify queue durable=true'
                                 ELSE 'LOW — no health gaps in window'
                               END,
    'fix_action',              'Set durable=true and deliveryMode=2 (persistent) on all RabbitMQ queues; '
                               || 'verify with: rabbitmqctl list_queues name durable',
    'verification_query',      'SELECT * FROM evo.fn_audit_rmq_durability_risk(''24 hours''::interval)'
  );
END;
$$;

COMMENT ON FUNCTION evo.fn_audit_rmq_durability_risk(interval) IS
  'E8-04: Audits RabbitMQ durability risk by correlating health log gaps '
  '(possible broker restarts) with DLQ spikes (messages lost in non-durable queues). '
  'Does not access RabbitMQ directly — infers risk from DB-side signals. '
  'Root fix: set durable=true + deliveryMode=2 on all queues.';

REVOKE EXECUTE ON FUNCTION evo.fn_audit_rmq_durability_risk(interval) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_audit_rmq_durability_risk(interval) TO service_role;
