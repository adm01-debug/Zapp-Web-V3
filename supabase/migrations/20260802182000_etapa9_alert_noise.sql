-- =============================================================================
-- Etapa 9: Silenciar o ruído e recuperar alertas reais
-- Achados: F9-07, F9-08, F6-08, F6-22, F6-23, F7-14, F8-16
-- =============================================================================
-- ROLLBACK: DELETE from evo._backup_evolution_alerts_20260802 pode ser reinserido
--   INSERT INTO evo.evolution_alerts SELECT * FROM evo._backup_evolution_alerts_20260802;
--
-- VERIFICAÇÃO PRÉ-APLICAÇÃO (2026-08-02):
--   - 1.280 alerts (999 resolved, 281 unresolved)
--   - 0 alertas '401_burst' (fn_detect_401_bursts fix já aplicado)
--   - Pipeline de VPS→DB inativo (evolution_ip_watch = 0 rows)
-- =============================================================================

-- Passo 1: Backup e purge de alertas resolvidos >7 dias (998 rows)
-- Backup já criado: evo._backup_evolution_alerts_20260802 (998 rows)
DELETE FROM evo.evolution_alerts
WHERE resolved = true AND created_at < NOW() - INTERVAL '7 days';

-- Passo 2: Cron de retenção — limpa alertas resolvidos diariamente
-- Mantém 30 dias de histórico, remove o resto
SELECT cron.schedule(
  'alert-retention-daily',
  '0 4 * * *',
  $$DELETE FROM evo.evolution_alerts WHERE resolved = true AND created_at < NOW() - INTERVAL '30 days'$$
);

-- NOTAS:
-- F9-07: fn_detect_401_bursts — 0 alertas burst no sistema (fix já aplicado ou nunca quebrou)
-- F9-08: Purge de histórico redundante — aplicado (998 → 282)
-- F6-08/F6-22/F6-23: webhook_health_alerts — auditoria movida para Etapa 10 (dblink)
-- F7-14/F8-16: warroom_alerts — auditoria movida para Etapa 11 (DLQ)
