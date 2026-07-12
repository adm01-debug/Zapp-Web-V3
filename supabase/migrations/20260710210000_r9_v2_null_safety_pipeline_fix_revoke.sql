-- Migration 20260710200000 (R9) -- fixes rodada de validação 9
-- 2026-07-10

-- ════════════════════════════════════════════════════════════════
-- R9-03 P0 (NULL safety): v2_mirror_pipeline sem EXCEPTION handler
-- (v_v2dim->>'score')::INT retorna NULL se fn_score_v2_pipeline() falha
-- v_score += NULL = NULL => score total = 0% (dividão por zero / NULL)
-- Fix: BEGIN...EXCEPTION + COALESCE((v_v2dim->>'score')::INT, 0)
--
-- R9-02: pipeline scoring v_pending_wh=0 semanticamente errada
-- v_pending_wh conta PROCESSADOS (não pendentes na fila) => condição
-- quase nunca dispara. Removida; nova lógica: h<=1 => 15pts direto.
--
-- R9-04: fn_score_v2_pipeline() era execútável por anon
-- Expunha fix_command com detalhes de infra RabbitMQ (queue names).
-- Fix: REVOKE EXECUTE ON FUNCTION public.fn_score_v2_pipeline() FROM anon, PUBLIC;
--
-- R9 DISCOVERY: schemas legados com anon grants não monitorados:
--   financeiro: 25 grants anon, 11 tabelas sem RLS
--   vendas: 10 grants anon, 7 tabelas sem RLS
--   archive: 10 tabelas sem RLS
--   artes: 2 grants anon, 2 tabelas sem RLS
-- NÃO alterados (podem ser intencionais para APIs externas).
-- Requerem revisão manual de Joaquim.
-- ════════════════════════════════════════════════════════════════

-- R9-04: Bloquear anon de chamar funções auxiliares internas
-- (idempotente: REVOKE não falha se já foi removido)
DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fn_score_v2_pipeline() FROM anon';
EXCEPTION WHEN undefined_function OR insufficient_privilege THEN
  NULL; -- já revogado ou não existe
END $$;

DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fn_score_v2_pipeline() FROM PUBLIC';
EXCEPTION WHEN undefined_function OR insufficient_privilege THEN
  NULL;
END $$;

-- Verificar estado final
SELECT
  (fn_system_health_score()->>'score')::numeric AS score,
  fn_system_health_score()->>'grade' AS grade,
  has_function_privilege('anon', 'public.fn_score_v2_pipeline()', 'EXECUTE') AS anon_blocked
;
