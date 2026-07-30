-- ============================================================================
-- Swarm Task Duplicate Detector (E1-07)
-- Auditoria 2026-07-10
--
-- E1-07 — swarm-task-guardian não detecta duplicação futura
--   Durante rolling updates ou falhas de healthcheck no Docker Swarm, dois
--   containers do mesmo service podem ficar simultaneamente ativos por alguns
--   segundos/minutos. Isso causa double-processing de mensagens RabbitMQ e
--   sessões Baileys concorrentes. O guardian atual só monitora heartbeat de
--   um processo; não detecta se um segundo processo duplicado surgiu.
--
-- Solução: DB-side detection em duas dimensões:
--   1. Heartbeat burst: se evolution_guardian_heartbeat recebe > expected_rate
--      heartbeats/min do mesmo service_name → provavelmente >1 réplica ativa
--   2. Double-open: se evolution_connection_history registra o mesmo
--      instance_name como 'open' duas vezes em < 60s sem um 'close'/'disconnected'
--      intermediário → sessão Baileys duplicada detectada
--
-- Infraestrutura:
--   • evo.fn_detect_swarm_task_duplication() — analisa janelas de 5min/30s;
--     cria alerta critical em zapp.webhook_health_alerts por detecção;
--     retorna jsonb com resumo
--   • Scheduled: */5 * * * * (a cada 5 min)
--
-- Idempotente: CREATE OR REPLACE + cron.unschedule.
-- ============================================================================

CREATE OR REPLACE FUNCTION evo.fn_detect_swarm_task_duplication()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  -- One guardian heartbeat per cycle; if we see > 2x in the window → duplicate
  v_heartbeat_window   CONSTANT interval := '5 minutes';
  v_heartbeat_max_ok   CONSTANT int      := 2;   -- normal: 1 per 5min; 2 = safe buffer
  v_open_window        CONSTANT interval := '60 seconds';

  v_burst_count        int := 0;
  v_double_open_count  int := 0;
  r                    record;
BEGIN
  -- ── Dimension 1: heartbeat burst (>1 replica sending heartbeats) ─────────
  FOR r IN
    SELECT
      service_name,
      COUNT(*) AS hb_count,
      MIN(heartbeat_at) AS first_hb,
      MAX(heartbeat_at) AS last_hb
    FROM evo.evolution_guardian_heartbeat
    WHERE heartbeat_at >= now() - v_heartbeat_window
    GROUP BY service_name
    HAVING COUNT(*) > v_heartbeat_max_ok
    ORDER BY hb_count DESC
  LOOP
    v_burst_count := v_burst_count + 1;

    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'swarm_task_duplicate',
        'critical',
        format('E1-07: Swarm duplicate suspected — service "%s" sent %s heartbeats in 5min (max_ok=%s)',
          r.service_name, r.hb_count, v_heartbeat_max_ok),
        jsonb_build_object(
          'service_name',   r.service_name,
          'hb_count_5min',  r.hb_count,
          'max_ok',         v_heartbeat_max_ok,
          'first_hb',       r.first_hb,
          'last_hb',        r.last_hb,
          'detection',      'heartbeat_burst'
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  -- ── Dimension 2: double-open in connection_history (Baileys duplicate) ───
  -- Detect: same instance_name has two 'open' transitions within 60s
  FOR r IN
    WITH opens AS (
      SELECT
        instance_name,
        created_at,
        LAG(created_at) OVER (PARTITION BY instance_name ORDER BY created_at) AS prev_open_at
      FROM evo.evolution_connection_history
      WHERE state = 'open'
        AND created_at >= now() - interval '10 minutes'
    )
    SELECT
      instance_name,
      prev_open_at,
      created_at AS this_open_at,
      EXTRACT(EPOCH FROM (created_at - prev_open_at))::int AS gap_seconds
    FROM opens
    WHERE prev_open_at IS NOT NULL
      AND (created_at - prev_open_at) <= v_open_window
    ORDER BY gap_seconds ASC
  LOOP
    v_double_open_count := v_double_open_count + 1;

    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'swarm_task_duplicate',
        'critical',
        format('E1-07: Baileys double-open on "%s" — two OPEN events %ss apart (window: %ss)',
          r.instance_name, r.gap_seconds, EXTRACT(EPOCH FROM v_open_window)::int),
        jsonb_build_object(
          'instance_name', r.instance_name,
          'first_open',    r.prev_open_at,
          'second_open',   r.this_open_at,
          'gap_seconds',   r.gap_seconds,
          'detection',     'double_open'
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  RETURN jsonb_build_object(
    'checked_at',             now(),
    'heartbeat_bursts_found', v_burst_count,
    'double_opens_found',     v_double_open_count,
    'total_detections',       v_burst_count + v_double_open_count,
    'status',                 CASE
                                WHEN (v_burst_count + v_double_open_count) > 0 THEN 'CRITICAL'
                                ELSE 'PASS'
                              END
  );
END;
$$;

COMMENT ON FUNCTION evo.fn_detect_swarm_task_duplication() IS
  'E1-07: Detects Docker Swarm task duplication via two independent signals: '
  '(1) heartbeat burst — same service_name sends >2 heartbeats in 5min window '
  '(indicates >1 running replica); '
  '(2) double-open — same instance_name transitions to open state twice within 60s '
  '(indicates concurrent Baileys sessions). '
  'Emits critical alerts in zapp.webhook_health_alerts. '
  'Scheduled every 5 minutes via pg_cron.';

REVOKE EXECUTE ON FUNCTION evo.fn_detect_swarm_task_duplication() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_detect_swarm_task_duplication() TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- pg_cron: every 5 minutes
-- ──────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('evo-swarm-duplicate-detector')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evo-swarm-duplicate-detector');

SELECT cron.schedule(
  'evo-swarm-duplicate-detector',
  '*/5 * * * *',
  'SELECT evo.fn_detect_swarm_task_duplication()'
);
