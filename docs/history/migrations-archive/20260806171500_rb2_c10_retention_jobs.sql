-- Runbook-2 (05/08/2026): Jobs de retenção ajustados/criados (item C-10)
-- ===========================================================================
-- Sync repo x DB: alterações de retenção aplicadas diretamente no banco pelos
-- agentes do runbook-2 em 05/08/2026 SEM cobertura versionada. Estado real
-- verificado em cron.job (2026-08-06):
--   job 209 'purge-webhook-audit-log-90d'  — command ajustado para 30 dias
--     DELETE FROM zapp.webhook_audit_log WHERE created_at < now() - interval '30 days';
--     (schedule preservado '46 3 * * *')
--   job 152 'purge_webhook_events_processed' — command ajustado para 30 dias
--     DELETE FROM zapp.webhook_events_processed WHERE processed_at < now() - interval '30 days';
--     (schedule preservado '30 4 * * *')
--   job 248 'purge-ddl-audit-90d' — CRIADO
--     DELETE FROM ops.ddl_audit WHERE "at" < now() - interval '90 days'; ('12 4 * * *')
--   índice ops.idx_ddl_audit_at (btree(at)) — CRIADO
--
-- Padrão idempotente: cron.schedule(jobname, ...) faz upsert por nome (se o
-- job já existir com o mesmo schedule/command, nada muda; o jobid é
-- preservado) e CREATE INDEX IF NOT EXISTS cobre o índice.
-- ===========================================================================

SELECT cron.schedule('purge-webhook-audit-log-90d', '46 3 * * *', $$DELETE FROM zapp.webhook_audit_log WHERE created_at < now() - interval '30 days';$$);
SELECT cron.schedule('purge_webhook_events_processed', '30 4 * * *', $$DELETE FROM zapp.webhook_events_processed WHERE processed_at < now() - interval '30 days';$$);
SELECT cron.schedule('purge-ddl-audit-90d', '12 4 * * *', $$DELETE FROM ops.ddl_audit WHERE "at" < now() - interval '90 days';$$);

CREATE INDEX IF NOT EXISTS idx_ddl_audit_at ON ops.ddl_audit USING btree (at);
