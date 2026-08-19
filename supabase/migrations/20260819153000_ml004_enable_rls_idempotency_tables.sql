-- ============================================================================
-- ML-004: hardening de RLS em tabelas de idempotência/telemetria do ai-router
-- ============================================================================
-- CONTEXTO (auditado 2026-08-19, DBA):
--   - Tabelas zapp.ai_function_metrics e zapp.processed_requests criadas em
--     20260804210923_restore_edge_idempotency_rpcs.sql.
--   - RLS JÁ ESTÁ LIGADO (relrowsecurity=true em produção) e policy
--     `service_only` (ALL, role=service_role) JÁ EXISTE (criada em
--     20260807270000 via ops.safe_create_policy).
--   - A migration original concedeu GRANT SELECT,INSERT,DELETE TO authenticated
--     — grants MORTOS (RLS bloqueia authenticated em runtime, não há policy
--     para ele). Viola o princípio do menor privilégio (idem cron_inventory
--     corrigido em 20260814040000_revoke_service_only_tables_auth_write.sql).
--
-- CORREÇÃO REAL (o que o ML-004 deveria fazer):
--   1. ENABLE ROW LEVEL SECURITY idempotente (no-op se já ligado — seguro).
--   2. REVOGAR todos os grants de authenticated (follow-up do padrão H2-COMPLEMENT-3).
--      O app acessa essas tabelas SÓ via RPCs SECURITY DEFINER
--      (record_ai_metrics, acquire_idempotency_lock, etc.) que rodam como
--      service_role (bypass RLS). Zero risco de runtime break.
--
-- SEGURANÇA: service_role mantém ALL (RPCs + backfills). anon/public já revogados.
-- ============================================================================

DO $$
BEGIN
  -- ai_function_metrics
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'ai_function_metrics' AND n.nspname = 'zapp' AND c.relrowsecurity
  ) THEN
    EXECUTE 'ALTER TABLE zapp.ai_function_metrics ENABLE ROW LEVEL SECURITY';
    RAISE NOTICE 'ENABLE RLS: zapp.ai_function_metrics';
  ELSE
    RAISE NOTICE 'RLS ja ativo: zapp.ai_function_metrics (no-op)';
  END IF;

  -- processed_requests
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'processed_requests' AND n.nspname = 'zapp' AND c.relrowsecurity
  ) THEN
    EXECUTE 'ALTER TABLE zapp.processed_requests ENABLE ROW LEVEL SECURITY';
    RAISE NOTICE 'ENABLE RLS: zapp.processed_requests';
  ELSE
    RAISE NOTICE 'RLS ja ativo: zapp.processed_requests (no-op)';
  END IF;
END;
$$;

-- Revogar grants mortos de authenticated (menor privilégio, igual a cron_inventory)
REVOKE ALL ON zapp.ai_function_metrics  FROM authenticated;
REVOKE ALL ON zapp.processed_requests   FROM authenticated;

-- Sanidade: garantir que service_role mantenha acesso total (RPCs + backfills)
GRANT ALL ON zapp.ai_function_metrics  TO service_role;
GRANT ALL ON zapp.processed_requests   TO service_role;
