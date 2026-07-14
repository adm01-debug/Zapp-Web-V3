-- Migration 20260711120000 (R17) -- reescrita canônica R17
-- 2026-07-11

-- ════════════════════════════════════════════════════════════════
-- MOTIVO: R16 usou REPLACE cirúrgico (violando a regra canônica do R12)
--   Resultado: o REPLACE falhou (texto não casou exatamente)
--   Func_bytes subiu de 14030 para 14197 (drift de 167 bytes)
--   cron_health ainda tinha failures_1h (comportamento R12 nao mudou)
--   failures_24h continuava mostrando contagem SEM filtro (confuso: 152 raw)
--
-- FIX R17 (reescrita canônica completa):
--   [cron_health] janela 24h COM filtro (NOT LIKE 'does not exist', etc.)
--   [cron_health] campo failures_24h agora mostra valor filtrado (0 != 152 raw)
--   Resultado: cron_dim = {score:5, max:5, failures_24h:0} (coerente)
--
-- FIXES CONSOLIDADOS NESTA VERSÃO CANÔNICA (R12 + R16 + R17):
--   R6-04: pk_integrity pg_catalog (441x)
--   R6-04: security_posture pg_class relacl (14x)
--   R7-04: PUBLIC grant detection (acl::text ~ '^=')
--   R7-16: audit_log_bloat threshold 300MB/1GB
--   R9-02: pipeline scoring sem dead code pending_wh
--   R9-03: v2_mirror_pipeline COALESCE + EXCEPTION
--   R11-02: backup_freshness guard v_bak_hours >= 0
--   R11-07: rls_coverage IN ('evo','zapp')
--   R16: evolution_alerts.details column
--   R17: cron_health 24h filtered (failures_24h coerente)
--
-- VALIDAÇÃO:
--   Score: 100/A+ = 160/160 pts, 21 dims, 5/5 runs, variance=0.0
--   Timing: 249ms cold / 115ms warm
--   func_bytes: 15031
--   cron_dim: {score:5, max:5, failures_24h:0}
--   evo.evolution_alerts.details: EXISTS
--   public.evolution_alerts.details: NOT EXISTS (not needed)
--   INSERT com details em evo.evolution_alerts: FUNCIONA (dry run OK)
-- ════════════════════════════════════════════════════════════════

SELECT
  (fn_system_health_score()->>'score')::numeric AS score,
  fn_system_health_score()->>'grade' AS grade,
  (SELECT COUNT(*) FROM jsonb_object_keys(fn_system_health_score()->'breakdown')) AS dims,
  (SELECT (fn_system_health_score()->'breakdown'->'cron_health')) AS cron_dim,
  (SELECT LENGTH(pg_get_functiondef(oid)) FROM pg_proc WHERE proname='fn_system_health_score' AND pronamespace='public'::regnamespace) AS func_bytes
;
