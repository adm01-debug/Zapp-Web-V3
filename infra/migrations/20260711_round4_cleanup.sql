-- Migration: 20260711_round4_validation_cleanup
-- Autor: Claude (quarta rodada de validacao exaustiva 2026-07-11)
-- Descricao: Limpeza de logs orphaos do pg_cron e documentacao de achados

-- ============================================================
-- 1. Cleanup: 583 orphan logs do cron.job_run_details
-- ============================================================
-- Logs de jobs removidos acumularam-se desde 2026-07-09 (jobs que
-- existiam e depois foram deletados). Sao inofensivos mas causam
-- ruido e espaco desperdicado.
-- Deletados: 583 rows (jobs de 2026-07-09 a 2026-07-11 sem jobid ativo)
DELETE FROM cron.job_run_details
WHERE jobid NOT IN (SELECT jobid FROM cron.job);
-- Resultado: cron.job_run_details passou de 21328 para 20745 rows

-- ============================================================
-- 2. Verificacao final pos-limpeza
-- ============================================================
-- SELECT COUNT(*) AS orphan_remaining
-- FROM cron.job_run_details WHERE jobid NOT IN (SELECT jobid FROM cron.job);
-- Resultado esperado: 0

-- ============================================================
-- 3. ACHADOS DOCUMENTADOS (ver infra/migrations/SECURITY_LEGADOS_ROUND4.md)
-- ============================================================
-- DEFAULT PRIVILEGES inseguros nos schemas legados:
--   financeiro: anon=arwd em tabelas (full access!)
--   artes: anon=X em funcoes
--   vendas: anon=r em tabelas (SELECT)
-- ACAO: Requer aprovacao de Joaquim para modificar (schemas legados)
--
-- gap de monitoramento em fn_score_security_acl:
--   Funcao verifica apenas schema 'public'
--   Schemas evo/zapp secdef+anon nao sao monitorados
--   Estado atual: 0 funcoes anon+secdef em evo/zapp (apos REVOKEs)
--   ACAO: Adicionar vetor v_evo_zapp_anon_secdef ao fn_score_security_acl
