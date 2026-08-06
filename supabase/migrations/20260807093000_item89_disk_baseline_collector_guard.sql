-- ============================================================================
-- AG-EX-17 wave 2 observabilidade | item 89 — Disco consolidado
-- 20260807093000_item89_disk_baseline_collector_guard.sql
--
-- (a) Job 234 (disk-baseline-snapshot-daily): remove o HARDCODE total_bytes
--     (207870402560 = 193,6GB fixo) → passa a derivar o total real do df
--     (coluna ops.host_disk_log.total_h, ex.: '193.6G'). Fonte única = coletor.
-- (b) ops.fn_host_disk_collector_guard(): fecha a lacuna apontada no AG-EX-09 —
--     ops.check_host_disk existe mas NINGUÉM chama (coletor parado >20min passa
--     despercebido). Wrapper grava warroom (crítico, dedupe por alerta aberto) e
--     o espelho do item 84 entrega. Agendado 15min.
--
-- Nenhum coletor/actioner removido: verificado 1 coletor base (host-disk-guard,
-- stack 167, 5min → ops.host_disk_log), 1 coletor hires (disk-metrics-collector,
-- stack 201, 30s em incidente → ops.host_disk_hires_log) e 1 actioner
-- (disk-actioner, stack 207) — complementares, sem duplicatas (AG-EX-09 §89).
-- ============================================================================

UPDATE cron.job
SET command = $cmd$
    WITH disk_info AS (
      SELECT
        used_pct,
        CASE
          WHEN total_h ~ 'T$' THEN (replace(total_h, 'T', '')::numeric * 1099511627776)::bigint
          WHEN total_h ~ 'G$' THEN (replace(total_h, 'G', '')::numeric * 1073741824)::bigint
          WHEN total_h ~ 'M$' THEN (replace(total_h, 'M', '')::numeric * 1048576)::bigint
          ELSE 207870402560
        END AS total_bytes  -- FIX AG-EX-17: total derivado do df (total_h), sem hardcode
      FROM ops.host_disk_log
      WHERE host='swarm-manager'
      ORDER BY id DESC LIMIT 1
    )
    INSERT INTO ops.disk_baseline(metric, value_bytes, meta)
    SELECT
      'host_disk_used' AS metric,
      ROUND((used_pct / 100.0) * total_bytes)::bigint AS value_bytes,
      jsonb_build_object(
        'host', 'swarm-manager',
        'used_pct', used_pct,
        'total_bytes', total_bytes,
        'ts', now()
      ) AS meta
    FROM disk_info;
  $cmd$
WHERE jobid = 234;

CREATE OR REPLACE FUNCTION ops.fn_host_disk_collector_guard()
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_latest  ops.host_disk_log%ROWTYPE;
  v_age_min numeric;
  v_open    boolean;
BEGIN
  SELECT * INTO v_latest FROM ops.host_disk_log ORDER BY checked_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nenhuma leitura em ops.host_disk_log');
  END IF;

  v_age_min := EXTRACT(EPOCH FROM (now() - v_latest.checked_at)) / 60;

  IF v_age_min <= 20 THEN
    RETURN jsonb_build_object('ok', true, 'age_min', round(v_age_min::numeric, 1),
                              'used_pct', v_latest.used_pct, 'checked_at', v_latest.checked_at);
  END IF;

  -- Coletor parado >20min: alerta crítico no warroom (dedupe: 1 aberto por vez)
  SELECT EXISTS(
    SELECT 1 FROM zapp.warroom_alerts
    WHERE source = 'fn_host_disk_collector_guard' AND resolved_at IS NULL
  ) INTO v_open;

  IF NOT v_open THEN
    INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, entity, severity)
    VALUES (
      'critical',
      format('Coletor de disco parado há %s min', round(v_age_min::numeric)),
      format('Última leitura de ops.host_disk_log em %s (%s%% usado, status %s). Verificar host-disk-guard (stack 167).',
             v_latest.checked_at, v_latest.used_pct, v_latest.status),
      'fn_host_disk_collector_guard',
      'swarm-manager',
      'critical'
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'age_min', round(v_age_min::numeric, 1),
                            'alerted', NOT v_open, 'used_pct', v_latest.used_pct);
END;
$function$;

SELECT cron.schedule(
  'host-disk-collector-guard',
  '7,22,37,52 * * * *',
  'SELECT ops.fn_host_disk_collector_guard()'
);
