-- Migration: Drop proxy ecosystem (proxy_metrics, proxy_alerts, cleanup function)
-- Date: 2026-08-03
-- Context: external-db-proxy, proxy-health, and proxy-metrics Edge Functions removidas
--   na consolidação v2.3.0. Essas tabelas eram o data sink da telemetria do proxy e
--   agora são órfãs — nenhum writer existe, as Edge Functions foram deletadas.
-- Risk: Baixo — tabelas contêm apenas telemetria histórica (0 rows); sem dependências FK.
-- Rollback: Reexecutar o DDL original das migrations de arquivo:
--   supabase/migrations/archive/20260425172645_*.sql (tabelas)
--   supabase/migrations/20260802000004_fix_bug37_edge_function_view_proxies.sql (views)

BEGIN;

-- ── 1. Drop SECURITY INVOKER views (public → zapp bridge) ─────────────────────
DROP VIEW IF EXISTS public.proxy_metrics CASCADE;
DROP VIEW IF EXISTS public.proxy_alerts CASCADE;

-- ── 2. Drop RLS policies (zapp schema) ────────────────────────────────────────
DO $$
BEGIN
  -- zapp.proxy_metrics policies
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'zapp.proxy_metrics'::regclass AND polname = 'Admins can view proxy metrics') THEN
    DROP POLICY "Admins can view proxy metrics" ON zapp.proxy_metrics;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'zapp.proxy_metrics'::regclass AND polname = 'auth_secure_187') THEN
    DROP POLICY auth_secure_187 ON zapp.proxy_metrics;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'zapp.proxy_metrics'::regclass AND polname = 'svc_rw') THEN
    DROP POLICY svc_rw ON zapp.proxy_metrics;
  END IF;

  -- zapp.proxy_alerts policies
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'zapp.proxy_alerts'::regclass AND polname = 'Admins can view proxy alerts') THEN
    DROP POLICY "Admins can view proxy alerts" ON zapp.proxy_alerts;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'zapp.proxy_alerts'::regclass AND polname = 'auth_secure_186') THEN
    DROP POLICY auth_secure_186 ON zapp.proxy_alerts;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'zapp.proxy_alerts'::regclass AND polname = 'svc_rw') THEN
    DROP POLICY svc_rw ON zapp.proxy_alerts;
  END IF;
END$$;

-- ── 3. Drop tables (zapp schema) ──────────────────────────────────────────────
DROP TABLE IF EXISTS zapp.proxy_metrics CASCADE;
DROP TABLE IF EXISTS zapp.proxy_alerts CASCADE;

-- ── 4. Drop cleanup function (zapp schema) ────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.cleanup_proxy_metrics();

COMMIT;
