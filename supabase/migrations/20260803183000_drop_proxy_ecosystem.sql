-- Migration: Drop proxy ecosystem (proxy_metrics, proxy_alerts, cleanup function)
-- Date: 2026-08-03
-- Context: external-db-proxy, proxy-health, and proxy-metrics Edge Functions removed.
--   These tables were the data sink for external-db-proxy telemetry and are now
--   orphan — no writer exists, proxy-health and proxy-metrics are deleted.
-- Risk: Low — tables contain only historical telemetry; no FK dependencies.
-- Rollback: Re-run the original creation DDL from archive migrations:
--   supabase/migrations/archive/20260425172645_*.sql
--   supabase/migrations/20260802000004_fix_bug37_edge_function_view_proxies.sql (views)

BEGIN;

-- ── 1. Drop zapp-scoped views (created by fix_bug37 migration) ─────────────────
DROP VIEW IF EXISTS zapp.proxy_metrics CASCADE;
DROP VIEW IF EXISTS zapp.proxy_alerts CASCADE;

-- ── 2. Drop RLS policies ──────────────────────────────────────────────────────
DO $$
BEGIN
  -- proxy_metrics policies
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.proxy_metrics'::regclass AND polname = 'Admins can view proxy metrics') THEN
    DROP POLICY "Admins can view proxy metrics" ON public.proxy_metrics;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.proxy_metrics'::regclass AND polname = 'auth_secure_187') THEN
    DROP POLICY auth_secure_187 ON public.proxy_metrics;
  END IF;

  -- proxy_alerts policies
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.proxy_alerts'::regclass AND polname = 'Admins can view proxy alerts') THEN
    DROP POLICY "Admins can view proxy alerts" ON public.proxy_alerts;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.proxy_alerts'::regclass AND polname = 'auth_secure_186') THEN
    DROP POLICY auth_secure_186 ON public.proxy_alerts;
  END IF;
END$$;

-- ── 3. Drop tables ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.proxy_metrics CASCADE;
DROP TABLE IF EXISTS public.proxy_alerts CASCADE;

-- ── 4. Drop cleanup function ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cleanup_proxy_metrics();

COMMIT;
