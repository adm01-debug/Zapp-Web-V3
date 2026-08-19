-- ============================================================================
-- Alinha autovacuum de zapp.app_notifications (reconciliacao repo x DB, 19/08)
-- ============================================================================
-- Os parametros abaixo foram aplicados AD-HOC em producao via
-- zapp.fn_force_autovacuum('zapp','app_notifications') durante diagnostico de
-- fila de notificacoes (19/08) e nunca foram versionados — o
-- zapp-schema-drift-gate acusava drift I7. Esta migration registra a
-- configuracao REAL em execucao (SET e idempotente; no-op em prod).
-- Rollback: ALTER TABLE zapp.app_notifications RESET (autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold, autovacuum_vacuum_cost_delay);
-- ============================================================================

ALTER TABLE zapp.app_notifications
  SET (
    autovacuum_vacuum_scale_factor = 0.0001,
    autovacuum_vacuum_threshold = 0,
    autovacuum_vacuum_cost_delay = 2
  );
