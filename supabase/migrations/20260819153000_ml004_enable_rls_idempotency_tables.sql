-- ============================================================================
-- ML-004: Enable RLS on idempotency/telemetry tables
-- ============================================================================
-- Gap: migration 20260804210923_restore_edge_idempotency_rpcs.sql criou
-- zapp.ai_function_metrics e zapp.processed_requests SEM
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY no mesmo bloco.
-- As policies `service_only` já foram criadas em 20260807270000
-- (via ops.safe_create_policy), mas o RLS em si estava DESLIGADO,
-- então as tabelas aceitavam leitura via GRANT mesmo sem policy.
--
-- Fix: ENABLE ROW LEVEL SECURITY idempotente (IF NOT relrowsecurity).
-- Policies service_only (só service_role) já existem e cobrem o acesso.
-- RLS não bloqueia service_role (bypass), logo zero risco de quebra de runtime.
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
  END IF;

  -- processed_requests
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'processed_requests' AND n.nspname = 'zapp' AND c.relrowsecurity
  ) THEN
    EXECUTE 'ALTER TABLE zapp.processed_requests ENABLE ROW LEVEL SECURITY';
    RAISE NOTICE 'ENABLE RLS: zapp.processed_requests';
  END IF;
END;
$$;
