-- ============================================================================
-- Migration: 20260816260007_fix_views_security_invoker_restantes
-- Fix: 7 views (public x5 + zapp x2) sem security_invoker=true.
-- Padrao da casa: view(invoker=true) -> GRANT na base evo.* -> RLS filtra.
-- APLICADA em producao 2026-08-17 via psql (container supabase_db) + registrada
-- em schema_migrations (DB-as-source). Este arquivo e o registro historico.
-- Canario pre: authenticated via 43.436 webhook events sem filtro (invoker=false).
-- Canario pos admin: acesso total preservado; user sem membership: media_* e
-- v_connection_uptime = 0 (RLS ativa); webhook events filtrados pela policy
-- de instancia vigente (wpp2/wppmkt) — decisao da casa, fora deste escopo.
-- ============================================================================

GRANT SELECT ON TABLE
  evo.media_download_queue,
  evo.media_cache,
  evo.media_scan_log,
  evo.evolution_webhook_events_v2,
  evo.ingest_ledger,
  evo.evolution_connection_history
TO authenticated;

DO $do$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'public.evolution_webhook_events_v2',
    'public.ingest_ledger',
    'public.media_cache',
    'public.media_download_queue',
    'public.media_scan_log',
    'zapp.evolution_webhook_events_v2',
    'zapp.v_connection_uptime'
  ] LOOP
    EXECUTE format('ALTER VIEW %s SET (security_invoker = true)', v);
  END LOOP;
END $do$;

DROP POLICY IF EXISTS media_scan_log_select_authenticated ON evo.media_scan_log;
CREATE POLICY media_scan_log_select_authenticated
  ON evo.media_scan_log
  FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor());
