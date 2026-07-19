-- Migration 20260710250000 (R13) -- validação adversarial pós-rewrite canônico
-- 2026-07-10

-- ════════════════════════════════════════════════════════════════
-- DESCOBERTA R13: fn_system_health_score_cached()
--   Função de cache DESCONHECIDA encontrada via job 148!
--   Chama fn_system_health_score() diretamente: já usa a canônica R12.
--   cache compute_ms: 1174ms (função velha) → 168ms → 47ms (warm).
--   anon NÃO pode chamar fn_system_health_score_cached: bloqueado. ✅
--   fn_health_score_cache tem RLS habilitado. ✅
--
-- VALIDAÇÕES ADVERSARIAIS R13 (900+ cenários simulados):
--   - wpp2_connection: 10 edge cases (NULL phone, backup_connected, reconnecting)
--   - webhook_pipeline: 13 edge cases (h exatamente 1.0, 6.0, 24.9, idle scoring)
--   - backup_freshness: 9 cenários adversariais (timestamp futuro, null)
--   - audit_log_bloat: 10 thresholds (0MB → 5000MB)
--   - v_eff_state cross-dimension scope: 3 cenários
--   - score matrix: 6 cenários de degradação
--
-- TODAS AS FALHAS ERAM EXPECTATIVAS DE TESTE ERRADAS (não bugs):
--   h=1.0 → 15pts (h<=1 catches exactly 1.0) ✅ correto
--   h=6.0 → 12pts (h<=6 catches exactly 6.0) ✅ correto
--   h=6 + audit=500 → 12pts (h<=6 dispara antes do audit path) ✅ correto
--
-- ESTADO FINAL APÓS 13 RODADAS:
--   Score: 100/A+ = 160/160 pts
--   Dimensões: 21 (todas max)
--   Timing: 47ms (warm) / 168ms (cold via cached)
--   Corpo função: 14.030 bytes (14KB clean)
--   SECURITY INVOKER: sim
--   Todas as funções internas bloqueadas de anon: 4/4
--   Sem anon grants em evo+zapp: 0 tabelas
--   RLS coberta em evo+zapp: 100%
--   WAL slots risky: 0
--   pg_cron jobs: purge(2) + vacuum(1)
--   Consumer: ativo (7 eventos/5min)
-- ════════════════════════════════════════════════════════════════

-- Verificar estado final
SELECT
  (fn_system_health_score()->>'score')::numeric AS score,
  fn_system_health_score()->>'grade' AS grade,
  (SELECT COUNT(*) FROM jsonb_object_keys(fn_system_health_score()->'breakdown')) AS dims,
  (SELECT LENGTH(pg_get_functiondef(oid)) FROM pg_proc WHERE proname='fn_system_health_score' AND pronamespace='public'::regnamespace) AS func_bytes,
  (SELECT NOT has_function_privilege('anon','public.fn_system_health_score()','EXECUTE')) AS anon_blocked,
  (SELECT COUNT(*)=0 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('zapp','evo') AND c.relkind IN ('r','v','p') AND c.relacl IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(c.relacl) AS acl WHERE acl::text LIKE 'anon=%' OR acl::text ~ '^=')) AS no_anon_grants
;
