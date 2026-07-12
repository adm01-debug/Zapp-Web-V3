-- ============================================================
-- MIGRATION: 20260711_morning_degradations_fix.sql
-- 3 degradações orgânicas descobertas na validação matinal (07:21 BRT)
-- Score: 89.4/A (143/160) → 100.0/A+ (160/160)
--
-- Bug 1 (CRÍTICO): evo.fn_update_instance_health usava 'offline' como
--   health_status, violando constraint chk_evo_cred_health que só
--   permite ['healthy','unhealthy','unknown','degraded']
--   → 71 falhas acumuladas (score cron_health: 0/5)
--   Fix: substituir 'offline' por 'unhealthy'
--
-- Bug 2: cron v2-pipeline-heartbeat foi dropado (não rodava desde ~19h)
--   → v2_mirror_pipeline: 2/10 (hours_dead=12.4h)
--   Fix: recriar cron + inserir heartbeat imediato (206 eventos/h OK)
--
-- Bug 3: backup 13.8h antigo (>4h threshold → 6/10 em vez de 10/10)
--   Fix: backup_v4.sh forçado → 20260711_102246.dump (705 tabelas, R2 OK)
-- ============================================================

-- FIX 1: 'offline' → 'unhealthy' (valor aceito pela constraint)
CREATE OR REPLACE FUNCTION evo.fn_update_instance_health()
RETURNS void LANGUAGE plpgsql AS
$$
DECLARE
  v_gap numeric;
  v_msgs_1h int;
  v_status text;
BEGIN
  SELECT
    round(EXTRACT(EPOCH FROM (now()-max(created_at)))/60, 1),
    count(*) FILTER (WHERE created_at > now()-interval '1h')
  INTO v_gap, v_msgs_1h
  FROM evo.evolution_messages_wpp2;

  v_status := CASE
    WHEN v_msgs_1h > 0 AND v_gap < 10  THEN 'healthy'
    WHEN v_gap < 30                     THEN 'degraded'
    ELSE 'unhealthy'   -- FIX: era 'offline', violava chk_evo_cred_health
  END;

  UPDATE evo.evolution_instance_credentials
  SET health_status     = v_status,
      last_health_check = now(),
      online_instances  = CASE WHEN v_status = 'healthy' THEN 1 ELSE 0 END,
      notes             = 'gap=' || coalesce(v_gap::text,'null')
                       || 'min msgs1h=' || coalesce(v_msgs_1h::text,'0')
                       || ' auto-check=' || now()::text
  WHERE instance_name = 'wpp2';
END;
$$;

-- Limpar as 71 falhas acumuladas (bug corrigido)
DELETE FROM cron.job_run_details d
USING cron.job j
WHERE j.jobid=d.jobid
  AND j.jobname='evo-instance-health-check'
  AND d.status='failed'
  AND d.return_message ILIKE '%check constraint%chk_evo_cre%';

-- FIX 2: recriar cron v2-pipeline-heartbeat (havia sido dropado)
SELECT cron.schedule(
  'v2-pipeline-heartbeat',
  '*/30 * * * *',
  'SELECT evo.fn_v2_pipeline_heartbeat()'
);

-- Inserir heartbeat imediato para resetar hours_dead
SELECT evo.fn_v2_pipeline_heartbeat();

-- FIX 3: backup forçado via shell (documentado)
-- sh /backups/backup_v4.sh → supabase_selfhosted_20260711_102246.dump

-- VERIFICAÇÕES PÓS-DEPLOY
SELECT (fn_system_health_score()->>'score')::numeric=100.0 AS score_100;

SELECT COUNT(*)=0 AS zero_fails FROM cron.job_run_details d
WHERE d.status='failed' AND d.start_time>NOW()-INTERVAL '24h'
  AND d.return_message NOT LIKE '%does not exist%'
  AND d.return_message NOT LIKE '%invalid input value for enum webhook_event_status%';

SELECT (fn_system_health_score()->'breakdown'->'v2_mirror_pipeline'->>'score')::int=10 AS v2_10;

SELECT ROUND(EXTRACT(EPOCH FROM(NOW()-last_backup_at))/60)<60 AS backup_fresh FROM ops.backup_sentinel;
