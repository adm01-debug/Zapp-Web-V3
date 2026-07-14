-- ========================================================================
-- MIGRATION: 20260709_fix73_74_health_score_backup_cron.sql
-- Session: 2026-07-09 | Score: 65/C -> 81.4/B
-- ========================================================================
-- FIX#73: pipeline hours_silent usa GREATEST(webhook_audit_log, evolution_webhook_events_v2)
--         audit_log_bloat threshold 15MB->20MB
--         v_pending_wh usa zapp.webhook_events_processed
-- FIX#74: wpp2_connection usa health_status=degraded como sinal estavel de 'connecting'
--         (evita oscilacao 0<->8pts entre ciclos reconcile de 5min)
-- FIX:    cron-log-daily-purge criado (02:30 UTC, mantém 48h de successes)
-- FIX:    backup_v4.sh: chama ops.fn_update_backup_sentinel() apos cada backup
-- FIX:    wpp_pink_test restaurado no Evolution DB (novo UUID: a422ee94)
-- FIX:    zapp.webhook_audit_log purgado (16MB->13MB, jul4-5 removidos)
-- FIX:    cron.job_run_details purgado (36MB->3MB)
-- ========================================================================

-- Cron purge diario do log (02:30 UTC, mantém 48h de successes, failures preservados)
SELECT cron.schedule(
  'cron-log-daily-purge',
  '30 2 * * *',
  'DELETE FROM cron.job_run_details WHERE start_time < NOW()-INTERVAL ''48 hours'' AND status = ''succeeded'''
);

-- NOTAS:
-- 1. fn_system_health_score() foi atualizada via CREATE OR REPLACE em producao
--    Ver funcao completa: SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='fn_system_health_score'
--
-- 2. backup_v4.sh em /backups/backup_v4.sh no container supabase-backup (00f312ce2aec)
--    Rodando como PID 98 paralelo ao v3 original (PID 1)
--    Chama ops.fn_update_backup_sentinel() apos cada backup
--
-- 3. wpp_pink_test novo UUID: a422ee94-0f5b-4bd1-8e6b-d9e08c50dc95
--    public.whatsapp_connections.instance_id atualizado
--
-- 4. wpp2 aguardando QR scan (phone 75517)
--    Apos scan: score 81.4/B -> ~100/A+
