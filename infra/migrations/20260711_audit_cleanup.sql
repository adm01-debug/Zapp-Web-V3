-- Migration: 20260711_audit_cleanup
-- Autor: Claude (auditoria 2026-07-11)
-- Descricao: Cleanup pos-auditoria exaustiva Evolution API

-- ============================================================
-- ITEM 1: Resolver alertas fantasmas wpp_pink_test
-- ============================================================
-- public.warroom_alerts (Supabase): 435 alertas orphaos resolvidos
UPDATE public.warroom_alerts
SET
  resolved_at     = NOW(),
  resolved_reason = 'cleanup-20260711: instancia wpp_pink_test removida via LOGOUT em 09/07/2026 — alertas orfaos resolvidos automaticamente pelo cleanup de auditoria'
WHERE (title ILIKE '%pink%' OR entity ILIKE '%pink%')
  AND resolved_at IS NULL;
-- Resultado: 435 registros (434 info + 1 warn)

-- Evolution PG14 public.warroom_alerts: 2 alertas criticos orfaos resolvidos
-- (executado via portainer_exec_container no container d57ea852943c)
-- UPDATE public.warroom_alerts SET resolved_at=NOW()
-- WHERE (title ILIKE '%pink%' OR entity ILIKE '%pink%') AND resolved_at IS NULL;
-- Resultado: 2 registros (critical: WhatsApp instance unhealthy: wpp_pink_test)

-- ============================================================
-- ITEM 2: fn_system_health_score R18 canonical
-- ============================================================
-- Reescrita canonica completa executada via supabase_db_query
-- Baseline anterior R17: 15031 bytes
-- Baseline R18 (20260711): 15277 bytes
-- Drift +244 bytes R17→R18: comentarios anti-masking na dimensao 8 (cron_health)
-- Regra: qualquer modificacao futura = CREATE OR REPLACE completo do zero
-- Nao usar surgical REPLACE sobre esta funcao
-- Validacao: 5 execucoes consecutivas, score=100.0, variance=0.0, grade=A+

-- ============================================================
-- ITEM 3: VACUUM ANALYZE tabelas com dead tuples elevados
-- ============================================================
-- Executado via portainer_exec_container no container supabase_db (1f867fd4c8b6)
-- VACUUM nao pode rodar dentro de transacao (pg_cron wrap) — executado diretamente via psql
VACUUM ANALYZE evo.evolution_instance_credentials;  -- 96%→0% (1 live, 25 dead, autovacuum null)
VACUUM ANALYZE evo.evolution_burnin_tracker;        -- 88%→0% (1 live, 7 dead, autovacuum null)
VACUUM ANALYZE evo.evolution_pipeline_health_log;   -- 19%→0% (205 live, 49 dead, autovacuum null)

-- Adicionar crons de vacuum para essas tabelas (item 10 do plano)
-- Ver: infra/migrations/20260711_vacuum_crons.sql

-- ============================================================
-- ITEM 4: Stack file sincronizado (ver infra/evolution/docker-compose.evolution.yml)
-- ============================================================
-- Stack file do Portainer (ID 25) estava desatualizado vs service spec atual.
-- Mudancas documentadas e commitadas em infra/evolution/docker-compose.evolution.yml:
--   T3: adicionado ||e.message.includes("makeBucket") — suprime S3 init errors no Sentry
--   T5a: adicionado CACHE log removal — reduz noise de logs
-- NOTA: aplicar via Portainer na proxima janela de manutencao planejada:
--   docker stack deploy -c docker-compose.evolution.yml evolution
--   Verificar: container nao deve reiniciar se command for identico ao spec atual
