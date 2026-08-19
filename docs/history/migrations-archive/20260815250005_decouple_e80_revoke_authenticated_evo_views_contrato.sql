-- E80 (PLANO_INDEPENDENCIA_100_ETAPAS_20260815): I5 - leitura do outro lado
-- so por view de contrato.
-- Diagnostico: os 38 grants SELECT de authenticated em evo.* existiam para
-- servir 66 views SECURITY INVOKER de backcompat/dashboard. Uso real no
-- front/edge (grep em src + supabase/functions, excluindo types.ts gerado):
-- apenas 6 relnames - evolution_webhook_events_v2, ingest_ledger, media_cache,
-- media_download_queue, media_scan_log, v_connection_uptime.
-- Acao: essas 6 (copias em public e zapp) viram security_invoker=false
-- (leitura via owner = view de contrato); TODOS os grants de authenticated
-- em evo.* revogados.
-- JA APLICADA em producao em 2026-08-15. RPC confirma I5=0. Smoke como
-- authenticated: 6 views legiveis; evo.* inacessivel (sem USAGE no schema).

DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'v'
      AND n.nspname IN ('public','zapp')
      AND c.relname IN ('evolution_webhook_events_v2','ingest_ledger','media_cache',
                        'media_download_queue','media_scan_log','v_connection_uptime')
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = false)', r.nspname, r.relname);
  END LOOP;

  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relkind IN ('r','p','v','m')
      AND has_table_privilege('authenticated', c.oid, 'SELECT')
  LOOP
    EXECUTE format('REVOKE ALL ON evo.%I FROM authenticated', r.relname);
  END LOOP;
END
$do$;
