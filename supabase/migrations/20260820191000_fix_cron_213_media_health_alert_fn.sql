-- 20260820191000 — fix_cron_213_media_health_alert_fn (achado novo do plano 100 etapas)
-- =============================================================================
-- BUG LATENTE: zapp.fn_run_media_health_alert() (cron 213, a cada 4h) inseria em
-- zapp.warroom_alerts a coluna "body", que nao existe mais (schema atual usa
-- "message"; alert_type e ENUM zapp.warroom_alert_type NOT NULL). O INSERT so roda
-- quando ha alerta a emitir — por isso o job "passava" enquanto a fila estava
-- saudavel e comecou a falhar em 2026-08-20 16:00 quando pending>1000.
-- FIX: INSERT com colunas atuais (alert_type::zapp.warroom_alert_type, source,
-- severity, title, message). Logica de deteccao INALTERADA.
-- VALIDACAO: SELECT zapp.fn_run_media_health_alert() OK + alerta warning real criado
-- ("Fila com 2099 pending") — coerente com o backlog de midia em aberto.
--
-- Rollback: restaurar INSERT com (source, severity, title, body) — nao recomendado
-- (volta a quebrar; "body" nao existe no schema atual).

CREATE OR REPLACE FUNCTION zapp.fn_run_media_health_alert()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $function$ DECLARE v_report RECORD; v_alert_count int := 0; v_alert_msg text := ''; BEGIN UPDATE zapp.warroom_alerts SET resolved_at=now(), resolved_reason='auto-resolve:healthcheck' WHERE source='media_pipeline' AND resolved_at IS NULL; SELECT (SELECT count(*) FROM public.evo_media_download_queue WHERE status='failed' AND processed_at > now()-interval '1 hour') AS failed_1h, (SELECT count(*) FROM public.evo_media_download_queue WHERE status='pending') AS pending, (SELECT count(*) FROM public.evo_media_download_queue WHERE status='processing' AND processed_at < now()-interval '15 minutes') AS stuck INTO v_report; IF v_report.failed_1h > 10 THEN v_alert_count := v_alert_count + 1; v_alert_msg := v_alert_msg || format('Falhas de download: %s na ultima hora. ', v_report.failed_1h); END IF; IF v_report.pending > 1000 THEN v_alert_count := v_alert_count + 1; v_alert_msg := v_alert_msg || format('Fila com %s pending. ', v_report.pending); END IF; IF v_report.stuck > 5 THEN v_alert_count := v_alert_count + 1; v_alert_msg := v_alert_msg || format('%s itens travados. ', v_report.stuck); END IF; IF v_alert_count > 0 THEN INSERT INTO zapp.warroom_alerts (alert_type, source, severity, title, message) VALUES ((CASE WHEN v_report.failed_1h > 20 THEN 'critical' ELSE 'warning' END)::zapp.warroom_alert_type, 'media_pipeline', CASE WHEN v_report.failed_1h > 20 THEN 'critical' ELSE 'warning' END, '[MEDIA] Pipeline degradado', v_alert_msg) ON CONFLICT DO NOTHING; END IF; END; $function$;

COMMENT ON FUNCTION zapp.fn_run_media_health_alert() IS 'Health check da fila de midia (cron 213, a cada 4h): auto-resolve alertas media_pipeline abertos e re-alerta em warroom_alerts se failed_1h>10, pending>1000 ou stuck>5. Corrigido 2026-08-20 (plano 100 etapas): coluna body -> message + cast enum warroom_alert_type (falhava desde a mudanca de schema do warroom).';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260820191000', 'fix_cron_213_media_health_alert_fn')
ON CONFLICT DO NOTHING;
