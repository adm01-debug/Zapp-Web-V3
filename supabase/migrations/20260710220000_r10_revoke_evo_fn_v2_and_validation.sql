-- Migration 20260710210000 (R10)
-- Rodada de validação 10 (2026-07-10)

-- ════════════════════════════════════════════════════════════════
-- VALIDAÇÕES R10 (todos passaram):
--
-- R9-02 pipeline fix: WHEN v_hours_silent<=1 THEN 15 ativo, sem v_pending_wh=0
-- R9-03 null safety: COALESCE + EXCEPTION handler para v2_mirror_pipeline ativos
-- R9 REVOKE fn_score_v2_pipeline: anon BLOQUEADO
-- R10-04: evolution_instances_public e 5 outras views públ. TEM security_invoker=ON
-- R10-09: job 152 DELETE usa Bitmap Index Scan em processed_at_idx
--
-- FIX R10-03: evo.fn_v2_mirror_health() exposta ao anon
--   Funcão expunha fix_command com nomes de filas RabbitMQ (infra interna)
--   REVOKE EXECUTE FROM anon, PUBLIC executado
--
-- DISCOVERIES R10:
--   Todas as 6 views public.* com anon grant já têm security_invoker=ON (correto)
--   Nenhuma table pura com anon grant em public (eram views, não tables)
--   observability: information_schema.views = 0ms (sem necessidade de otimização)
--   Job 152 ainda não executou (agendado 04:30 UTC) mas EXPLAIN confirma uso de índice
--
-- DEAD CODE IDENTIFICADO (inofensivo):
--   WHEN v_hours_silent<=6 AND v_audit_events_1h>0 THEN 12
--   Esta condição é logicamente inalcançável:
--   Se audit_1h>0 => eventos na última hora => MAX(created_at)<=1h => h<=1
--   => já capturado pela primeira condição 'h<=1 THEN 15'
--   Sem impacto no score; pode ser removida em futura refatoração.
-- ════════════════════════════════════════════════════════════════

-- R10-03: Revogar acesso anônimo a fn_v2_mirror_health (schema evo)
DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION evo.fn_v2_mirror_health() FROM anon';
EXCEPTION WHEN undefined_function OR insufficient_privilege THEN
  NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION evo.fn_v2_mirror_health() FROM PUBLIC';
EXCEPTION WHEN undefined_function OR insufficient_privilege THEN
  NULL;
END $$;

-- Verificar estado final
SELECT
  NOT has_function_privilege('anon','evo.fn_v2_mirror_health()','EXECUTE') AS v2_health_blocked,
  NOT has_function_privilege('anon','public.fn_score_v2_pipeline()','EXECUTE') AS v2_pipeline_blocked,
  NOT has_function_privilege('anon','public.fn_score_security_acl()','EXECUTE') AS sec_acl_blocked,
  NOT has_function_privilege('anon','public.fn_system_health_score()','EXECUTE') AS health_score_blocked,
  (fn_system_health_score()->>'score')::numeric AS final_score,
  fn_system_health_score()->>'grade' AS grade
;
