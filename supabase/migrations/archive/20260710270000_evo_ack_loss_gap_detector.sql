-- ============================================================================
-- ACK-Loss Gap Detector (E8-06)
-- Auditoria 2026-07-10
--
-- E8-06 — ACK antes de gravar no Supabase (at-most-once delivery)
--   O consumer envia ACK ao RabbitMQ ANTES do INSERT no Supabase ser confirmado.
--   Se o INSERT falhar (timeout, constraint, connection drop), a mensagem foi
--   ACKada e removida da fila mas nunca persisted — perda silenciosa de dados.
--   O fix correto é no código do consumer (ACK somente após INSERT bem-sucedido),
--   mas este módulo provê visibilidade DB-side do gap enquanto o fix não é deployado.
--
-- Estratégia de detecção:
--   1. Mensagens em evolution_webhook_dlq com event_type de mensageria
--      (messages.upsert, messages.update) que têm error_message com padrões
--      de falha de escrita em DB → consumidas do RMQ mas perdidas no Supabase.
--   2. Janela de correlação: se um evento aparece no DLQ com retry_count = 0
--      e status = 'error', nunca foi reprocessado → lost message.
--   3. Taxa de DLQ crescendo > threshold em janela → provável ACK storm.
--
-- Infraestrutura:
--   • evo.v_ack_loss_candidates — view dos candidatos a lost messages
--   • evo.fn_detect_ack_loss_gap(p_window) — analisa gap e emite alertas
--   • Scheduled: */5 * * * *
--
-- Idempotente: CREATE OR REPLACE VIEW + FUNCTION.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- View: ACK-loss candidate messages (DLQ entries with DB-write error patterns)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW evo.v_ack_loss_candidates AS
SELECT
  d.id,
  d.event_type,
  d.instance_name,
  d.remote_jid,
  d.status,
  d.retry_count,
  d.error_message,
  d.created_at,
  d.queue_name,
  -- Classify the failure type
  CASE
    WHEN d.error_message ILIKE '%duplicate key%'
      OR d.error_message ILIKE '%unique constraint%'
      OR d.error_message ILIKE '%unique_violation%'
    THEN 'duplicate_write'   -- Already persisted on earlier attempt (at-least-once corner)
    WHEN d.error_message ILIKE '%connection%timeout%'
      OR d.error_message ILIKE '%query_timeout%'
      OR d.error_message ILIKE '%statement timeout%'
      OR d.error_message ILIKE '%connection refused%'
      OR d.error_message ILIKE '%ECONNRESET%'
      OR d.error_message ILIKE '%ETIMEDOUT%'
    THEN 'db_write_timeout'  -- High-risk: ACK likely sent, Supabase write failed
    WHEN d.error_message ILIKE '%supabase%'
      OR d.error_message ILIKE '%postgre%'
      OR d.error_message ILIKE '%23505%'   -- PG unique_violation code
      OR d.error_message ILIKE '%42P01%'   -- undefined_table
    THEN 'db_write_error'    -- Generic DB error post-consumption
    ELSE 'other_error'
  END AS failure_category,
  -- Flag truly lost messages: consumed, errored, never retried successfully
  (d.status = 'error' AND d.retry_count = 0) AS likely_lost,
  -- Flag exhausted retry budget
  (d.retry_count >= d.max_retries AND d.status = 'error') AS retry_exhausted
FROM evo.evolution_webhook_dlq d
WHERE d.event_type IN (
  'messages.upsert',
  'messages.update',
  'messages.delete',
  'send.message',
  'message.ack'
)
ORDER BY d.created_at DESC;

COMMENT ON VIEW evo.v_ack_loss_candidates IS
  'E8-06: DLQ entries for message events that failed after consumption from RabbitMQ. '
  'failure_category=db_write_timeout indicates highest ACK-before-persist risk. '
  'likely_lost=true means consumed+errored+never retried = at-most-once loss.';

-- ──────────────────────────────────────────────────────────────────────────────
-- Main detector function
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_detect_ack_loss_gap(
  p_window   interval DEFAULT '30 minutes',
  p_dlq_threshold int  DEFAULT 5    -- alert if > N at-risk DLQ entries in window
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  v_total_dlq_msg      bigint := 0;
  v_db_timeout_count   bigint := 0;
  v_db_error_count     bigint := 0;
  v_likely_lost_count  bigint := 0;
  v_retry_exhausted    bigint := 0;
  v_dlq_growth_rate    numeric;
  v_prev_window_count  bigint := 0;
  v_result             jsonb;
  v_status             text;
BEGIN
  -- Count DLQ message entries in current window
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE failure_category = 'db_write_timeout'),
    COUNT(*) FILTER (WHERE failure_category IN ('db_write_timeout', 'db_write_error')),
    COUNT(*) FILTER (WHERE likely_lost),
    COUNT(*) FILTER (WHERE retry_exhausted)
  INTO
    v_total_dlq_msg,
    v_db_timeout_count,
    v_db_error_count,
    v_likely_lost_count,
    v_retry_exhausted
  FROM evo.v_ack_loss_candidates
  WHERE created_at >= now() - p_window;

  -- Count previous window for growth rate
  SELECT COUNT(*)
  INTO v_prev_window_count
  FROM evo.v_ack_loss_candidates
  WHERE created_at >= now() - (p_window * 2)
    AND created_at <  now() - p_window;

  -- Growth rate: current vs previous window
  v_dlq_growth_rate := CASE
    WHEN v_prev_window_count = 0 AND v_total_dlq_msg > 0 THEN 999.0
    WHEN v_prev_window_count = 0 THEN 0.0
    ELSE round(((v_total_dlq_msg::numeric / v_prev_window_count) - 1) * 100, 1)
  END;

  -- Determine overall status
  v_status := CASE
    WHEN v_likely_lost_count > 0 OR v_db_timeout_count >= p_dlq_threshold THEN 'CRITICAL'
    WHEN v_db_error_count > 0    OR v_total_dlq_msg > 0                   THEN 'WARN'
    ELSE 'OK'
  END;

  -- Emit CRITICAL alert: confirmed at-most-once losses detected
  IF v_likely_lost_count > 0 THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'ack_loss_gap',
        'critical',
        format('E8-06: ACK-loss CRITICAL — %s likely-lost messages (ACKed, DB write failed, no retry)',
          v_likely_lost_count),
        jsonb_build_object(
          'likely_lost_count',    v_likely_lost_count,
          'db_timeout_count',     v_db_timeout_count,
          'db_error_count',       v_db_error_count,
          'retry_exhausted',      v_retry_exhausted,
          'total_dlq_msg',        v_total_dlq_msg,
          'window',               p_window,
          'dlq_growth_rate_pct',  v_dlq_growth_rate,
          'root_cause',           'Consumer ACKs RabbitMQ before Supabase INSERT confirmed',
          'fix_action',           'ACK only after INSERT returns success — consumer code change required'
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

  ELSIF v_db_timeout_count >= p_dlq_threshold THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'ack_loss_gap',
        'high',
        format('E8-06: ACK-loss WARN — %s DB-timeout DLQ entries in %s (threshold: %s)',
          v_db_timeout_count, p_window, p_dlq_threshold),
        jsonb_build_object(
          'db_timeout_count',     v_db_timeout_count,
          'db_error_count',       v_db_error_count,
          'total_dlq_msg',        v_total_dlq_msg,
          'window',               p_window,
          'dlq_growth_rate_pct',  v_dlq_growth_rate,
          'root_cause',           'Consumer ACKs RabbitMQ before Supabase INSERT confirmed',
          'fix_action',           'ACK only after INSERT returns success — consumer code change required'
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  v_result := jsonb_build_object(
    'checked_at',           now(),
    'window',               p_window,
    'status',               v_status,
    'total_dlq_msg',        v_total_dlq_msg,
    'db_timeout_count',     v_db_timeout_count,
    'db_error_count',       v_db_error_count,
    'likely_lost_count',    v_likely_lost_count,
    'retry_exhausted',      v_retry_exhausted,
    'dlq_growth_rate_pct',  v_dlq_growth_rate,
    'threshold',            p_dlq_threshold,
    'root_cause',           'Consumer ACKs RabbitMQ before Supabase INSERT confirmed (at-most-once)',
    'fix_action',           'ACK only AFTER INSERT confirmed — consumer code change required'
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION evo.fn_detect_ack_loss_gap(interval, int) IS
  'E8-06: Detects at-most-once delivery gap — messages ACKed to RabbitMQ before '
  'Supabase INSERT was confirmed. Analyzes evolution_webhook_dlq for message-type '
  'entries with DB-write failure patterns (timeout, connection refused, ECONNRESET). '
  'likely_lost_count > 0 = confirmed data loss. Root fix is consumer code. '
  'Scheduled every 5 minutes via pg_cron.';

REVOKE EXECUTE ON FUNCTION evo.fn_detect_ack_loss_gap(interval, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_detect_ack_loss_gap(interval, int) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- pg_cron: every 5 minutes
-- ──────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('evo-ack-loss-gap-detector')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evo-ack-loss-gap-detector');

SELECT cron.schedule(
  'evo-ack-loss-gap-detector',
  '*/5 * * * *',
  $$SELECT evo.fn_detect_ack_loss_gap('30 minutes'::interval, 5)$$
);
