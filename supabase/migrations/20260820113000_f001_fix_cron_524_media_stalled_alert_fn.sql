-- 20260820113000 — f001_fix_cron_524_media_stalled_alert_fn — REGISTRO RETROATIVO, NAO REAPLICAR (F-001, P1)
-- =============================================================================
-- FINDING F-001 (auditoria 2026-08-20): o job 524 media-queue-stalled-alert falhava em
-- TODA execucao desde o deploy (20260818100000_etapa38) com "syntax error at or near
-- SELECT" — o DO block com dollar-quoting nao sobrevive ao caminho do pg_cron.
-- O watchdog da fila de midia estava MORTO.
--
-- FIX aplicado direto no banco em 2026-08-20 via MCP (plano 100 etapas, Bloco 1):
-- a logica do DO block foi convertida na funcao zapp.fn_media_queue_stalled_alert()
-- (mesmos thresholds: pendentes parados >2h, locks orfaos >30min, failure rate >10%
-- em 24h com >=20 itens; mesmo INSERT em zapp.evolution_alerts com dedup de 6h)
-- e o job 524 reagendado para SELECT fn().
--
-- VALIDACAO (2026-08-20): cron.job_run_details do job 524 = "succeeded" em todos os
-- ticks (*/15min) e alertas media_download_queue_stalled sendo emitidos (6 em 48h)
-- para o backlog real de midia.
--
-- Rollback: restaurar o DO block original no command do job 524 (texto no historico
-- da execucao do plano; nao recomendado — o DO block e exatamente o que quebrava).

CREATE OR REPLACE FUNCTION zapp.fn_media_queue_stalled_alert()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public'
AS $function$ DECLARE v_horas numeric; v_pend int; v_locks int; v_f24 int; v_t24 int; v_dispara boolean := false; v_motivos text[] := '{}'; BEGIN SELECT round(extract(epoch FROM (now() - max(created_at))) / 3600, 1), count(*) FILTER (WHERE status IN ('pending','processing')), count(*) FILTER (WHERE locked_at > now() - interval '30 minutes'), count(*) FILTER (WHERE status = 'failed' AND created_at >= now() - interval '24 hours'), count(*) FILTER (WHERE created_at >= now() - interval '24 hours') INTO v_horas, v_pend, v_locks, v_f24, v_t24 FROM evo.media_download_queue; IF v_pend > 0 AND (v_horas IS NULL OR v_horas > 2) THEN v_dispara := true; v_motivos := array_append(v_motivos, 'produtor_parado_' || coalesce(v_horas::text, 'fila_vazia') || 'h'); END IF; IF v_locks > 0 THEN v_dispara := true; v_motivos := array_append(v_motivos, 'lock_orfao_' || v_locks); END IF; IF v_t24 >= 20 AND v_f24::numeric / v_t24 > 0.10 THEN v_dispara := true; v_motivos := array_append(v_motivos, 'failed_rate_' || round(100.0 * v_f24 / v_t24, 1) || 'pct'); END IF; IF v_dispara AND NOT EXISTS (SELECT 1 FROM zapp.evolution_alerts WHERE alert_type = 'media_download_queue_stalled' AND resolved_at IS NULL AND created_at > now() - interval '6 hours') THEN INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload) VALUES ('media_download_queue_stalled', 'critical', 'Fila de download de midia travada/estagnada', 'media_download_queue parada: ' || array_to_string(v_motivos, ', '), jsonb_build_object( 'horas_sem_item_novo', v_horas, 'pendentes', v_pend, 'locks_ativos', v_locks, 'falhas_24h', v_f24, 'total_24h', v_t24)); END IF; END; $function$;

-- Reagendamento do job 524 (mesmo schedule */15 * * * *)
SELECT cron.alter_job(524, command := 'SELECT zapp.fn_media_queue_stalled_alert()');

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260820113000', 'f001_fix_cron_524_media_stalled_alert_fn')
ON CONFLICT DO NOTHING;
