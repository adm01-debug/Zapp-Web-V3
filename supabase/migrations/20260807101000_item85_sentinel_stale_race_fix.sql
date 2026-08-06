-- ============================================================================
-- AG-EX-17 wave 2 observabilidade | sentinel — falso positivo backup_sentinel_stale
-- 20260807101000_item85_sentinel_stale_race_fix.sql
--
-- Causa raiz (evidência): job 127 daily-backup-sentinel-check roda 12:00Z, mas o
-- container supabase-backup executa o ciclo às ~15:18Z (loop com sleep 86400 desde
-- o deploy R25 em 01/08 15:15Z). Na checagem das 12:00Z o sentinel está SEMPRE com
-- last_backup_at = dia anterior 15:18Z → stale_hours = 20,7 ≥ 20 → alerta
-- backup_sentinel_stale TODOS os dias (7 abertos, todos com stale_hours=20.7),
-- apesar de backups + R2 OK diários (logs).
--
-- Fix:
--  1. Job 127 → 16:30Z (75min após o backup das ~15:20Z; sentinel fresco ~1,2h →
--     skipped; se o backup falhar, no dia seguinte 16:30Z a idade é ~25h → alerta).
--  2. Resolve os 7 falsos positivos abertos (todos com stale_hours≈20.7, corrida
--     sistemática; os backups reais rodaram e o R2 confirmou upload diário).
-- ============================================================================

UPDATE cron.job
SET schedule = '30 16 * * *'
WHERE jobid = 127;

UPDATE zapp.webhook_health_alerts
SET resolved_at = now()
WHERE alert_type = 'backup_sentinel_stale'
  AND resolved_at IS NULL
  AND details->>'stale_hours' IS NOT NULL
  AND round((details->>'stale_hours')::numeric, 1) = 20.7;
