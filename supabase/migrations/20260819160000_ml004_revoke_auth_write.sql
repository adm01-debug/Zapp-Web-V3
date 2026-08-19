-- ============================================================================
-- ML-004 (follow-up): revogar grants mortos de authenticated em tabelas de
-- idempotência/telemetria do ai-router
-- ============================================================================
-- CONTEXTO (auditado 2026-08-19, DBA PhD):
--   PR #1323 (commit eb26390) aplicou ENABLE RLS idempotente — mas RLS JA
--   ESTAVA LIGADO em producao (relrowsecurity=true) e policy service_only
--   (role=service_role) JA EXISTIA (20260807270000). Logo aquele PR foi no-op.
--
--   O GAP REAL (ML-004): a migration 20260804210923 concedeu
--     GRANT SELECT, INSERT, DELETE ON zapp.processed_requests TO authenticated
--     GRANT SELECT, INSERT         ON zapp.ai_function_metrics TO authenticated
--   Esses grants SAO MORTOS (RLS bloqueia authenticated em runtime, nao ha
--   policy para ele) — mas violam o principio do menor privilegio, idem ao
--   que foi corrigido em cron_inventory pela 20260814040000.
--
-- CORRECAO (este PR):
--   REVOGA ALL de authenticated (menor privilegio). App acessa SO via RPCs
--   SECURITY DEFINER (record_ai_metrics, acquire_idempotency_lock, etc.)
--   que rodam como service_role (bypass RLS) — ZERO risco de runtime break.
--   Mantem GRANT ALL para service_role (RPCs + backfills + operator queries).
--
-- IDEMPOTENTE: REVOKE/GRANT sao no-op se ja no estado desejado.
-- ============================================================================

REVOKE ALL ON zapp.ai_function_metrics  FROM authenticated;
REVOKE ALL ON zapp.processed_requests   FROM authenticated;

-- Sanidade: service_role deve manter acesso total (RPCs SECURITY DEFINER bypassam RLS)
GRANT ALL ON zapp.ai_function_metrics  TO service_role;
GRANT ALL ON zapp.processed_requests   TO service_role;
