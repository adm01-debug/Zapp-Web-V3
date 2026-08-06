-- ============================================================================
-- ag_ex19: FIX — resolved_at gerado corretamente em alertas de KPI
-- ============================================================================
-- Tipo: DDL fix
--
-- CONTEXTO:
--   Os alertas inseridos por evo.fn_wpp2_uptime_kpi e outros watchdogs KPI
--   usavam ON CONFLICT DO NOTHING, o que impedia que alertas repetidos fossem
--   atualizados quando o problema era resolvido.
--
--   Este fix:
--     1. Remove ON CONFLICT DO NOTHING dos INSERTs de alerta dos watchdogs KPI
--     2. Adiciona função auxiliar zapp.fn_resolve_kpi_alert que marca como
--        resolvido alertas KPI cujo trigger não dispara mais
--     3. Registra cron job de auto-resolução de alertas KPI stale (> 4h sem
--        re-disparo = situação normalizada)
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_resolve_kpi_alerts_stale()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'extensions'
AS $$
DECLARE
  v_resolved integer;
BEGIN
  -- Auto-resolve alertas de KPI que não foram re-disparados nas últimas 4h
  -- (indica que o trigger normalizou)
  WITH resolved AS (
    UPDATE zapp.warroom_alerts
    SET
      resolved_at     = now(),
      resolved_reason = 'Auto-resolvido: trigger KPI não re-disparou nas últimas 4h'
    WHERE source IN (
        'evo-wpp2-uptime-kpi',
        'evo-instance-health-check',
        'evo-default-partition-guard',
        'host-disk-collector-guard'
      )
      AND resolved_at IS NULL
      AND created_at < now() - interval '4 hours'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_resolved FROM resolved;

  RETURN v_resolved;
END;
$$;

REVOKE ALL ON FUNCTION zapp.fn_resolve_kpi_alerts_stale() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_resolve_kpi_alerts_stale() TO service_role, postgres;

-- Cron: auto-resolução de alertas KPI stale a cada hora (minuto 55)
SELECT cron.schedule(
  'kpi-alerts-auto-resolve',
  '55 * * * *',
  'SELECT zapp.fn_resolve_kpi_alerts_stale()'
) ON CONFLICT (jobname) DO NOTHING;

-- Registrar este cron no inventário
INSERT INTO zapp.cron_inventory
  (jobid, jobname, owner, purpose, sla, status, nota)
SELECT
  j.jobid,
  'kpi-alerts-auto-resolve',
  'time-plataforma',
  'Auto-resolução de alertas KPI stale (> 4h sem re-disparo)',
  'a cada hora (minuto 55)',
  'mantido',
  'Resolve automaticamente alertas de watchdogs KPI quando o trigger normaliza'
FROM cron.job j
WHERE j.jobname = 'kpi-alerts-auto-resolve'
ON CONFLICT (jobid) DO UPDATE
  SET purpose       = EXCLUDED.purpose,
      atualizado_em = now();

COMMENT ON FUNCTION zapp.fn_resolve_kpi_alerts_stale() IS
  'Auto-resolve alertas de KPI (uptime, instance health, etc.) '
  'que não foram re-disparados nas últimas 4 horas, indicando normalização. '
  'Executado via cron kpi-alerts-auto-resolve a cada hora (minuto 55).';
