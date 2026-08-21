-- 20260818160000 — sentinel-curto-521 — REGISTRO RETROATIVO, NAO REAPLICAR (F-003, plano 100 etapas)
-- =============================================================================
-- Criado direto no banco em 2026-08-18 via MCP (workaround apply_migration bugado).
-- Este arquivo versiona o DDL REAL capturado do banco em 2026-08-20 (cron.job jobid=532).
-- Detecta o modo de falha "401 silencioso" do cron 521 (edge warroom-monthly-test):
-- se em 26h nao houver resposta 200 valida em net._http_response, alerta warning.
--
-- Rollback: SELECT cron.unschedule('sentinel-curto-521');

SELECT cron.schedule('sentinel-curto-521', '30 14 1 * *', $cmd$
INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, entity, severity)
SELECT 'warning',
       'cron 521 pode ter falhado (401 silencioso)',
       'Nenhuma resposta 200 da edge warroom-monthly-test em net._http_response nas ultimas 26h '
         || '(janela desde ' || to_char(now() - interval '26 hours', 'YYYY-MM-DD"T"HH24:MI"Z"') || '). '
         || 'Verificar rotacao da supabase_service_role_key (nome novo no vault), cron 521, edge warroom-monthly-test.',
       'sentinel-curto-521', 'warroom-monthly-test', 'warning'
WHERE NOT EXISTS (
  SELECT 1 FROM net._http_response r
  WHERE r.status_code = 200
    AND r.content LIKE '{"ok":true,"status":%'
    AND r.created >= now() - interval '26 hours'
) AND NOT EXISTS (
  SELECT 1 FROM zapp.warroom_alerts a
  WHERE a.source = 'sentinel-curto-521' AND a.alert_type = 'warning'
    AND a.created_at >= date_trunc('month', now())
);
$cmd$);
