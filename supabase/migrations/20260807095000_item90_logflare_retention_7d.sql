-- ============================================================================
-- AG-EX-17 wave 2 observabilidade | item 90 — Retenção Logflare 7d
-- 20260807095000_item90_logflare_retention_7d.sql
--
-- Problema (AG-EX-09 §90): DB _supabase com 9,97GB; cloudflare (6,48GB) e deno
-- (2,24GB) = ~620MB/dia de ingestão. Retenção 30d → steady-state ~18GB num disco
-- a 82-83%. Job 218 (iterador de partições, wave 1) aplica 30d uniforme.
--
-- Fix: janela diferenciada no job 218 — cloudflare + deno (fontes de alto volume)
-- passam a 7 DIAS; demais fontes (postgres/gotrue/realtime/storage/postgrest,
-- volume baixo) mantêm 30 dias. Primeiro run pós-fix purga ~7d de cloudflare/deno
-- (≈ -4GB imediatos no disco).
-- ============================================================================

UPDATE cron.job
SET command = $cmd$DO $log$
DECLARE
  r            record;
  v_rows       bigint;
  v_total      bigint := 0;
  v_cutoff     timestamptz;
  v_retention  interval;
  v_high_volume text[] := ARRAY[
    'log_events_d8f3db66_f2bb_4b55_91dd_634ae4d84584',  -- cloudflare (alto volume, 7d)
    'log_events_5d6439e4_9b4f_40fe_8753_17bb211a9d14'   -- deno (alto volume, 7d)
  ];
BEGIN
  FOR r IN SELECT tablename FROM pg_tables
           WHERE schemaname='_analytics' AND tablename LIKE 'log_events_%'
           ORDER BY tablename
  LOOP
    v_retention := CASE WHEN r.tablename = ANY(v_high_volume)
                        THEN interval '7 days'   -- FIX AG-EX-17: alto volume 30d→7d
                        ELSE interval '30 days'
                   END;
    v_cutoff := now() - v_retention;
    EXECUTE format('DELETE FROM _analytics.%I WHERE timestamp < %L', r.tablename, v_cutoff);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
    RAISE NOTICE 'logflare-cleanup: % purgados de % (retencao %)', v_rows, r.tablename, v_retention;
  END LOOP;
  RAISE NOTICE 'logflare-cleanup-consolidated: % rows purgados (cloudflare/deno=7d, demais=30d)', v_total;
END $log$;$cmd$
WHERE jobid = 218;
