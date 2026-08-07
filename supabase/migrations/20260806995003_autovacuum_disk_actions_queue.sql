-- =====================================================================
-- (incluído do merge com main — idempotente)
-- CREATE TABLE ops.disk_actions_queue + índices + cron cleanup
-- ============================================================================
-- Tipo: DDL + pg_cron
--
-- CONTEXTO:
--   Fila de ações de disco agendadas pelo sistema de monitoramento automático.
--   Quando o collector detecta uso acima de threshold, enfileira ações como
--   docker prune, remoção de volumes órfãos, etc. O worker (Edge Function ou
--   cron) consome a fila, executa a ação e marca executed_at + result.
--
--   A constraint única uq_disk_actions_pending garante que a mesma ação sobre
--   o mesmo target não seja enfileirada duplicadamente enquanto pendente.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Criar tabela
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops.disk_actions_queue (
  id          serial       NOT NULL,
  ts          timestamptz  NOT NULL DEFAULT now(),
  action      text         NOT NULL,
  target      text,
  reason      text,
  executed_at timestamptz,
  result      jsonb,

  CONSTRAINT disk_actions_queue_pkey PRIMARY KEY (id)
);

-- Index para buscar ações pendentes eficientemente
CREATE INDEX IF NOT EXISTS idx_daq_pending
  ON ops.disk_actions_queue (ts DESC)
  WHERE executed_at IS NULL;

-- Garante que a mesma ação+target não seja enfileirada duas vezes enquanto pendente
CREATE UNIQUE INDEX IF NOT EXISTS uq_disk_actions_pending
  ON ops.disk_actions_queue (action, COALESCE(target, '__null__'))
  WHERE executed_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Permissões
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON TABLE ops.disk_actions_queue FROM PUBLIC, anon;
GRANT SELECT ON TABLE ops.disk_actions_queue TO authenticated;
GRANT ALL ON TABLE ops.disk_actions_queue TO service_role, postgres;
GRANT USAGE, SELECT ON SEQUENCE ops.disk_actions_queue_id_seq TO service_role, postgres;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Cron job — limpeza de registros executados com mais de 7 dias
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('disk-actions-cleanup')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'disk-actions-cleanup');

SELECT cron.schedule(
  'disk-actions-cleanup',
  '9 4 * * *',
  $$DELETE FROM ops.disk_actions_queue WHERE executed_at < now() - interval '7 days'$$
);
-- =======
-- Item 65 da auditoria infra (AG-EX-01): autovacuum per-table (substitui cron disk-tables-vacuum-weekly job 231)
ALTER TABLE ops.disk_actions_queue SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_vacuum_threshold=100, autovacuum_analyze_scale_factor=0.02);
