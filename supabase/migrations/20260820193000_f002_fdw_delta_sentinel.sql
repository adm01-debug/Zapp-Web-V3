-- 20260820193000 — f002_fdw_delta_sentinel (F-002 preventivo — etapas 19/89 do plano)
-- =============================================================================
-- CONTEXTO F-002: outage de 14/08 (dia com 449 msgs no momento da auditoria) foi
-- RECUPERADO pelo reconcile antes do fechamento do plano — delta FDW da janela
-- 2026-08-13..17 medido em 2026-08-20: PG14=23.696 vs evo=23.703 (deficit -7;
-- evo >= fonte, diferenca = canarias redirecionadas por design). Perda real = 0.
-- PREVENCAO: sentinela horaria comparando a ultima hora fechada do PG14
-- (evo.pg14_message_hourly via FDW) vs evo.evolution_messages_wpp2.
--   * deficit > 20 (canarias ~6/h esperadas) -> alerta critical fdw_ingest_deficit (dedup 2h)
--   * FDW inacessivel -> alerta warning fdw_sentinel_error (dedup 6h), sem falhar o cron
-- Cron 556 'fdw-delta-sentinel-30min' em 7,37 * * * * (desfasado dos probes de 0/15/30/45).
-- NOTA I2: a funcao vive em zapp (nao em evo) porque escreve em zapp.evolution_alerts —
-- mesmo padrao de zapp.fn_media_queue_stalled_alert; manter em evo violaria o invariante
-- I2 do desacoplamento (funcao evo referenciando zapp.* fora de rpc_boundary_*).
--
-- Rollback:
--   SELECT cron.unschedule('fdw-delta-sentinel-30min');
--   DROP FUNCTION IF EXISTS zapp.fn_fdw_delta_sentinel();

CREATE OR REPLACE FUNCTION zapp.fn_fdw_delta_sentinel()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'pg_catalog'
AS $fn$
DECLARE
  v_hour timestamptz := date_trunc('hour', now() - interval '1 hour');
  v_pg14 bigint; v_evo bigint; v_deficit bigint;
BEGIN
  BEGIN
    SELECT coalesce(sum(cnt),0) INTO v_pg14 FROM evo.pg14_message_hourly WHERE hour = v_hour;
  EXCEPTION WHEN OTHERS THEN
    IF NOT EXISTS (SELECT 1 FROM zapp.evolution_alerts WHERE alert_type='fdw_sentinel_error' AND created_at > now() - interval '6 hours') THEN
      INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
      VALUES ('fdw_sentinel_error', 'warning', 'Sentinela FDW: falha ao consultar PG14',
              'evo.pg14_message_hourly inacessivel: ' || SQLERRM,
              jsonb_build_object('hora_alvo', v_hour));
    END IF;
    RETURN;
  END;
  SELECT count(*) INTO v_evo FROM evo.evolution_messages_wpp2
  WHERE wa_timestamp >= v_hour AND wa_timestamp < v_hour + interval '1 hour';
  v_deficit := v_pg14 - v_evo;
  IF v_deficit > 20 AND NOT EXISTS (
      SELECT 1 FROM zapp.evolution_alerts
      WHERE alert_type='fdw_ingest_deficit' AND resolved_at IS NULL
        AND created_at > now() - interval '2 hours') THEN
    INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
    VALUES ('fdw_ingest_deficit', 'critical', 'Deficit de ingestao PG14 -> evo na ultima hora',
            format('Hora %s: PG14=%s, evo=%s, deficit=%s (threshold 20; canarias ~6/h esperadas)',
                   to_char(v_hour, 'YYYY-MM-DD HH24:00'), v_pg14, v_evo, v_deficit),
            jsonb_build_object('hora', v_hour, 'pg14', v_pg14, 'evo', v_evo, 'deficit', v_deficit));
  END IF;
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_fdw_delta_sentinel() IS 'Sentinela horaria F-002 (plano 100 etapas 2026-08-20): compara contagem da ultima hora fechada no PG14 (evo.pg14_message_hourly, FDW) vs evo.evolution_messages_wpp2; deficit > 20 gera alerta critical fdw_ingest_deficit em zapp.evolution_alerts (dedup 2h). Falha de FDW gera fdw_sentinel_error (dedup 6h). Chamada pelo cron fdw-delta-sentinel-30min.';

SELECT cron.schedule('fdw-delta-sentinel-30min', '7,37 * * * *', 'SELECT zapp.fn_fdw_delta_sentinel()');

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260820193000', 'f002_fdw_delta_sentinel')
ON CONFLICT DO NOTHING;
