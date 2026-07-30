-- ============================================================================
-- DLQ Poison-message Guard + Pino Timeout Monitor (E8-03 / E1-08)
-- Auditoria 2026-07-10
--
-- E8-03 — Poison message trava consumer em restart loop
--   O consumer não tem limite de reentregas no lado do DB — quando retry_count
--   atinge max_retries a entry fica 'pending' indefinidamente, permitindo que
--   o consumer continue tentando (restart loop).
--   fn_flag_poison_messages() varre a DLQ a cada 5 min e seta
--   status='poison' quando retry_count >= max_retries AND status='pending'.
--   Consumer deve checar status != 'poison' antes de re-enfileirar.
--   Alerta zapp.webhook_health_alerts quando novos poison encontrados.
--
-- E1-08 — Pino timed out messages persistem
--   Mensagens "timed out" no log do Pino são normais do Baileys (keepalive
--   packets que não recebem ACK dentro do prazo). A função
--   fn_monitor_pino_timeouts() conta ocorrências nas últimas 2h em
--   evo.evolution_health_logs e classifica:
--     0 = PASS (silêncio)
--     1-4 = INFO (normal Baileys)
--     >=5 = WARN (investigar)
--
-- Aplicados ao vivo via MCP em 2026-07-10. Verificados.
-- Idempotente: CREATE OR REPLACE FUNCTION + cron.unschedule (IF EXISTS).
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- E8-03: Poison message flag function
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_flag_poison_messages()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  v_flagged    bigint := 0;
  v_total_dlq  bigint;
  v_result     jsonb;
BEGIN
  -- Flag entries where all retries are exhausted
  UPDATE evo.evolution_webhook_dlq
  SET status = 'poison'
  WHERE status = 'pending'
    AND retry_count >= max_retries;

  GET DIAGNOSTICS v_flagged = ROW_COUNT;

  SELECT COUNT(*) INTO v_total_dlq FROM evo.evolution_webhook_dlq;

  v_result := jsonb_build_object(
    'checked_at',      now(),
    'newly_flagged',   v_flagged,
    'total_dlq_rows',  v_total_dlq
  );

  IF v_flagged > 0 THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, message, metadata, created_at)
      VALUES (
        'dlq_poison_messages',
        'high',
        format('E8-03: %s poison message(s) flagged in evolution_webhook_dlq — consumer restart loop prevented', v_flagged),
        v_result,
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION evo.fn_flag_poison_messages() IS
  'E8-03: Sets status=''poison'' on DLQ entries where retry_count >= max_retries '
  'AND status=''pending''. Prevents consumer restart loops. '
  'Consumer should skip rows with status=''poison''. '
  'Raises zapp.webhook_health_alerts (severity=high) when any are flagged. '
  'Scheduled every 5 minutes.';

SELECT cron.unschedule('dlq-poison-guard')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dlq-poison-guard');

SELECT cron.schedule(
  'dlq-poison-guard',
  '*/5 * * * *',
  'SELECT evo.fn_flag_poison_messages()'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- E1-08: Pino timeout monitor (observability only — no action)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_monitor_pino_timeouts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
DECLARE
  v_count  bigint;
  v_status text;
  v_result jsonb;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM evo.evolution_health_logs
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

  v_result := jsonb_build_object(
    'checked_at',          now(),
    'status',              v_status,
    'timed_out_count_2h',  v_count,
    'note',                CASE
      WHEN v_count < 5 THEN 'Pino timeouts within normal Baileys keepalive range'
      ELSE 'Elevated Pino timeouts — check Baileys connection stability'
    END
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION evo.fn_monitor_pino_timeouts() IS
  'E1-08: Counts "timed out" occurrences in evo.evolution_health_logs '
  'over the last 2h. 0 = PASS, 1-4 = INFO (normal Baileys keepalive), '
  '>= 5 = WARN (investigate connection stability). Read-only, no side effects.';

SELECT cron.unschedule('pino-timeout-monitor')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pino-timeout-monitor');

SELECT cron.schedule(
  'pino-timeout-monitor',
  '*/30 * * * *',
  'SELECT evo.fn_monitor_pino_timeouts()'
);
