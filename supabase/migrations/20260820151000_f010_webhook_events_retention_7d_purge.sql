-- 20260820151000 — f010_webhook_events_retention_7d_purge — REGISTRO RETROATIVO, NAO REAPLICAR (F-010, GATE-C APROVADO)
-- =============================================================================
-- FINDING F-010: zapp.webhook_events_processed com 472MB (19% do DB), ~600k rows,
-- 18 dias de retencao efetiva; evo.evolution_traefik_401_stats sem retencao.
-- GATE-C aprovado em 2026-08-20: retencao 7 dias para ambos.
-- Este arquivo versiona os jobs/funcoes REAIS capturados do banco em 2026-08-20.
--
-- Efeito medido ate 2026-08-20 23h: webhook_events_processed 600k -> 194.058 rows
-- (oldest = 2026-08-13); traefik_401_stats 13MB/7.645 rows com purge diario ativo.
-- O tamanho fisico (477MB) decai conforme VACUUM reusa paginas (job 544).
--
-- Rollback:
--   SELECT cron.unschedule('purge-webhook-events-7d');
--   SELECT cron.unschedule('weekly-vacuum-webhook-events-processed');
--   SELECT cron.unschedule('evo-purge-traefik-401-7d');
--   SELECT cron.unschedule('vacuum-analyze-traefik-401-weekly');
--   DROP FUNCTION IF EXISTS evo.fn_purge_traefik_401_stats();

-- 1) Cron 546 — purge semanal (domingo 00:30): retencao 7d por processed_at
SELECT cron.schedule('purge-webhook-events-7d', '30 00 * * 0',
  $cmd$ DELETE FROM zapp.webhook_events_processed WHERE processed_at < now() - interval '7 days'; ANALYZE zapp.webhook_events_processed; $cmd$);

-- 2) Cron 544 — VACUUM ANALYZE semanal (domingo 03:00) para devolver paginas ao FSM
SELECT cron.schedule('weekly-vacuum-webhook-events-processed', '0 3 * * 0',
  'VACUUM ANALYZE zapp.webhook_events_processed');

-- 3) Funcao de purge do traefik_401_stats (retencao 7d por collected_at)
CREATE OR REPLACE FUNCTION evo.fn_purge_traefik_401_stats()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE v_deleted bigint;
BEGIN
  DELETE FROM evo.evolution_traefik_401_stats
  WHERE collected_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

-- 4) Cron 551 — purge diario 03:20
SELECT cron.schedule('evo-purge-traefik-401-7d', '20 3 * * *', 'SELECT evo.fn_purge_traefik_401_stats()');

-- 5) Cron 541 — VACUUM ANALYZE semanal do traefik_401_stats (segunda 07:00)
SELECT cron.schedule('vacuum-analyze-traefik-401-weekly', '0 7 * * 1', 'VACUUM ANALYZE evo.evolution_traefik_401_stats');
