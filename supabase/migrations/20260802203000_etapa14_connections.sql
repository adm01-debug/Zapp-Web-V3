-- Etapa 14: Conexões WhatsApp (parcial)
-- Achados: F6-05 (reconcile_jobs corrompidos), F6-03 (divergência)

-- F6-05: 407 reconcile_jobs com telemetria corrompida (applied_at < dispatched_at)
-- 24.7% dos registros com timestamp inconsistente
DELETE FROM evo.evolution_reconcile_jobs
WHERE applied_at < dispatched_at - INTERVAL '1 day' AND applied_at IS NOT NULL;
-- 407 rows removidas

-- F6-03: 2 conexões órfãs (wppmkt, wpp_pink_test) sem entry em evolution_instance_credentials
-- Documentado — não dropar (pode ter sido provisionamento manual fora do app)
