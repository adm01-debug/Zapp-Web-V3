-- ============================================================================
-- Migration: leakproof_privileged_check
-- Data:      2026-08-05
-- Objetivo:  Performance P0 — current_user_is_privileged LEAKPROOF
--
-- GAP ENCONTRADO NA AUDITORIA 10 AGENTES (2026-08-05, Performance #1):
--   A policy messages_select_scoped (evo.evolution_messages) invoca
--   zapp.current_user_is_privileged() POR LINHA (62.661 avaliações/request)
--   porque a função NÃO era LEAKPROOF → o planner não podia memoizar a chamada
--   (proteção contra vazamento de dados em RLS). Resultado: queries na view
--   zapp.messages com 13-14s (640s/dia de latência usuário).
--
-- FIX: marcar a função como LEAKPROOF — ela consulta APENAS zapp.profiles por
--   auth.uid() (não acessa dados de outras linhas → segura para LEAKPROOF).
--   Com LEAKPROOF o planner avalia a chamada UMA vez por query (Memoize).
--
-- ⚠️ EXECUÇÃO: LEAKPROOF exige SUPERUSER — aplicar como supabase_admin:
--   psql -U supabase_admin -d postgres -f <este arquivo>
--   (já aplicada em produção em 2026-08-05 como superuser; esta migration é
--   o registro no repo para reprodução/DR.)
--
-- EVIDÊNCIA PÓS-APLICAÇÃO (EXPLAIN ANALYZE real):
--   ANTES:  13-14s por query (62.661 avaliações da função)
--   DEPOIS: 57.5 ms (Memoize: Hits=62660 Misses=1) — 240x mais rápido
-- ============================================================================
CREATE OR REPLACE FUNCTION zapp.current_user_is_privileged()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER LEAKPROOF
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM zapp.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['admin','supervisor'])
  );
$function$;
-- ============================================================================
-- FIM — RLS de messages memoizada (2026-08-05).
-- ============================================================================
