-- ============================================================================
-- ag_ex19: Popular cron_inventory com todos os jobs ativos (v2)
-- ============================================================================
-- Tipo: dados de inventário
--
-- CONTEXTO:
--   Popula zapp.cron_inventory com os cron jobs criados neste episódio de
--   auditoria e os jobs pré-existentes relevantes. Permite rastreamento de
--   propósito, SLA e responsabilidade de cada job agendado.
--
--   ON CONFLICT DO UPDATE permite re-rodar o migration sem duplicatas.
-- ============================================================================

INSERT INTO zapp.cron_inventory
  (jobid, jobname, owner, purpose, sla, status, nota)
SELECT
  j.jobid,
  j.jobname,
  'time-plataforma',
  v.purpose,
  v.sla,
  'mantido',
  v.nota
FROM cron.job j
JOIN (VALUES
  ('vacuum-bootstrap-log-daily',
   'VACUUM ANALYZE diário de evo.evolution_bootstrap_log',
   'diário 02:16',
   NULL),
  ('disk-actions-cleanup',
   'Limpeza de ops.disk_actions_queue (registros executados > 7 dias)',
   'diário 04:09',
   NULL),
  ('disk-tables-vacuum-weekly',
   'VACUUM semanal de todas as tabelas ops.*',
   'semanal domingo 02:00',
   NULL),
  ('refresh-health-score-cache',
   'Refresh cache de health score a cada 30 min',
   'a cada 30 min',
   NULL),
  ('purge-health-score-history',
   'Purge de fn_health_score_history > 7 dias',
   'diário 05:00',
   NULL),
  ('system-health-score',
   'Recompute horário do health score (minuto 5)',
   'a cada hora',
   NULL),
  ('health_score_alert_hourly',
   'Alerta se health score < 70 (minuto 45)',
   'a cada hora',
   NULL),
  ('mirror-warroom-criticals',
   'Espelha alertas críticos do warroom para ops schema',
   'a cada 5 min',
   NULL),
  ('evo-wpp2-uptime-kpi',
   'Calcula KPI de uptime da instância wpp2',
   'a cada 15 min',
   NULL),
  ('host-disk-collector-guard',
   'Verifica se o coletor de disco está ativo',
   'a cada 15 min',
   NULL),
  ('disk-baseline-snapshot-daily',
   'Snapshot diário de tamanho de tabelas por schema',
   'diário 01:00',
   NULL),
  ('disk-baseline-prune-weekly',
   'Prune semanal da série histórica de disk_baseline',
   'semanal domingo 03:30',
   NULL),
  ('logflare-cloudflare-cleanup',
   'Retenção de logs: 7d cloudflare/deno, 30d demais',
   'diário 03:09',
   NULL),
  ('evo-instance-health-check',
   'Verificação de saúde das instâncias Evolution API',
   'a cada 15 min',
   NULL),
  ('evo-default-partition-guard',
   'Alerta se partição default de webhooks acumular eventos',
   'a cada 30 min',
   NULL),
  ('disk-actions-cleanup',
   'Limpeza de ops.disk_actions_queue',
   'diário',
   NULL)
) AS v(jobname, purpose, sla, nota) ON (j.jobname = v.jobname)
ON CONFLICT (jobid) DO UPDATE
  SET purpose      = EXCLUDED.purpose,
      sla          = EXCLUDED.sla,
      nota         = EXCLUDED.nota,
      atualizado_em = now();
