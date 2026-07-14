-- Migration 20260710200000 — R8 sentinel: estado canônico validado
-- Rodada de validação 8 (2026-07-10)
-- Esta migration não altera estrutura — documenta o estado definitivo do sistema
-- após 7 rodadas de validação exaustiva.

-- ════════════════════════════════════════════════════════════════
-- DESCOBERTAS DA RODADA 8:
--
-- [R8-01] fn_system_health_score tem 21 dimensões (não 20 como documentado):
--   Dimensão extra: v2_mirror_pipeline (10 pts) via fn_score_v2_pipeline()
--   -> fn_v2_mirror_health() em schema evo
--   Max real: 160 pts (não 150)
--   Score: 100/A+ = 160/160 pts
--
-- [R8-02] Todas as 3 mudanças não-comitadas (R6/R7) estão corretamente aplicadas:
--   - pk_integrity via pg_catalog: SELECT COUNT(*) FROM pg_class c...
--   - security_posture PUBLIC detection: acl::text ~ '^='
--   - audit_log threshold: 314572800 bytes (300MB)
--
-- [R8-03] VACUUM ANALYZE nas 3 tabelas principais:
--   - evolution_messages_wpp2: dead_tuples 0, heap_fetches 2303 -> 53 (-97.7%)
--   - webhook_events_processed: dead_tuples 0 (pós-purge)
--   - webhook_audit_log: dead_tuples 831 (normal com tráfego ativo)
--
-- [R8-04] evolution_webhook_events_v2 já está recebendo eventos:
--   - last_1h: 4 eventos, last_24h: 1337 eventos
--   - O consumer v16 escreve em AMBAS: audit_log + v2 table
--   - Divergence = false (ambas sincronizadas)
--
-- [R8-05] fn_score_security_acl() e fn_score_v2_pipeline() são funções auxiliares
--   chamadas dentro do health score — documentadas aqui pela primeira vez.
-- ════════════════════════════════════════════════════════════════

-- ESTADO DO BANCO APÓS 8 RODADAS:
SELECT
  (fn_system_health_score()->>'score')::numeric AS score,
  fn_system_health_score()->>'grade' AS grade,
  (fn_system_health_score()->'breakdown'->'webhook_pipeline'->'score')::int AS pipeline_15,
  (fn_system_health_score()->'breakdown'->'v2_mirror_pipeline'->'score')::int AS v2_10,
  (fn_system_health_score()->'breakdown'->'wpp2_connection'->'score')::int AS wpp2_20,
  (fn_system_health_score()->'breakdown'->'audit_log_bloat'->>'threshold') AS audit_threshold,
  (fn_system_health_score()->'breakdown'->'security_posture'->'anon_zapp_grants')::int AS anon_grants
;
