-- Migration 20260711130000 (R18) -- validação temporal e estabilidade
-- 2026-07-11

-- ════════════════════════════════════════════════════════════════
-- VALIDAÇÕES R18:
--
-- P0 (Partições): evolution_webhook_events_v2 já tem partições pré-criadas até 2027-06
--   Job 64 (auto-create-monthly-partitions) executou e criou tudo.
--   2026_08 EXISTS (✅), 2026_09 EXISTS (✅), etc. até 2027_06.
--   Nenhuma ação necessária.
--
-- DESCOBERTA R18: fn_system_health_score modificada por outra sessão!
--   Entre R17 (11:38 UTC) e R18 (12:45 UTC), alguém modificou a função.
--   Comentário inline adicionado:
--     -- R13 FINAL (arbitrado por Joaquim 2026-07-11): janela 1h SEM filtros
--     -- NAO reintroduzir NOT LIKE: esconde classe 'does not exist' (114+48 falhas)
--   A função agora usa:
--     - Janela 1h (mais rápido de recuperar após incidentes)
--     - SEM NOT LIKE filtros (transparente, conta TODAS as falhas reais)
--   DECISION RESPECTED: não reverter esta mudança.
--
-- MOTIVO PARA 1h SEM FILTROS:
--   Com evolution_alerts.details agora adicionado (R16), job 130 não falha mais.
--   Portanto, não há necessidade de filtrar 'does not exist' — que esconderia
--   futuras falhas legtimas de schema. A abordagem mais transparente é melhor.
--
-- DESCOBERTA 2: fn_score_security_acl expandida
--   A função de ACL foi atualizada com novos vetores:
--   anon_any_execute, public_grant_execute, auth_purge_no_guard,
--   evo_views_no_si, rls_zero_policy.
--   Score: qualquer vetor>0 = 0pts (mais estrito).
--   Estado atual: TODOS = 0 → score=5/5 (✅)
--
-- ops.fn_test_health_score_unmask(): função de diagnóstico existente
--   Confirma que cron_health sem NOT LIKE filtra falhas reais:
--   {pass:true, baseline:0, after_injection:1, expected:1}
--
-- ESTADO FINAL R18:
--   Score: 100/A+ = 160/160 pts
--   10/10 runs · variance=0.0
--   security_acl: 5/5 (✅), cron_health: 5/5 (✅)
--   fn_system_health_score: decisão de Joaquim respeitada (1h SEM filtros)
--   Partições: pré-criadas até 2027-06 (✅)
-- ════════════════════════════════════════════════════════════════

-- Verificação final
SELECT
  (fn_system_health_score()->>'score')::numeric AS score,
  fn_system_health_score()->>'grade' AS grade,
  (SELECT COUNT(*) FROM jsonb_object_keys(fn_system_health_score()->'breakdown')) AS dims,
  -- Confirmar partições pré-criadas
  (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_inherits i ON i.inhrelid=c.oid
   JOIN pg_class p ON p.oid=i.inhparent
   WHERE pn.nspname='evo' AND p.relname='evolution_webhook_events_v2'
   AND c.relname LIKE '%_202%'
   FROM pg_namespace pn WHERE pn.oid=p.relnamespace) AS partitions_count
;
