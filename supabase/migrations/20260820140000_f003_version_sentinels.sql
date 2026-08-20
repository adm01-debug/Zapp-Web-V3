-- F-003 (PLANO-100 B3) — versionamento retroativo dos sentinel jobs 530/532
-- (PR #1336 separado para comentários + snapshots)
-- NOTA: apply_migration bugado no self-hosted. Aplicado:
-- INSERT INTO supabase_migrations.schema_migrations (version, name)
-- VALUES ('20260820140000', 'f003_version_sentinels') ON CONFLICT DO NOTHING;

-- Job 530: sentinel-teste-mensal (FT evo.fdw_evolution_message, 1x/mes)
SELECT cron.unschedule('sentinel-teste-mensal') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sentinel-teste-mensal');
SELECT cron.schedule('sentinel-teste-mensal', '0 12 2 * *', $$
INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, entity, severity)
SELECT 'critical',
       'FALHA teste mensal warroom',
       'Nenhuma mensagem [TESTE-MENSAL] em Message (evolution PG14) desde '
         || to_char(date_trunc('month', now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD') || ' 00:00Z. '
         || 'Verificar cron 521, edge warroom-monthly-test, vault supabase_service_role_key, n8n.',
       'sentinel-teste-mensal', 'warroom-monthly-test', 'critical'
WHERE NOT EXISTS (
  SELECT 1 FROM evo.fdw_evolution_message m
  WHERE m.message::text ILIKE '%TESTE-MENSAL%'
    AND m."messageTimestamp" >= extract(epoch from date_trunc('month', now()))::bigint
) AND NOT EXISTS (
  SELECT 1 FROM zapp.warroom_alerts a
  WHERE a.source = 'sentinel-teste-mensal' AND a.alert_type = 'critical'
    AND a.created_at >= date_trunc('month', now())
);
$$);

-- Job 532: sentinel-curto-521 (detecta 401 silencioso do cron 521, 1x/mes)
SELECT cron.unschedule('sentinel-curto-521') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sentinel-curto-521');
SELECT cron.schedule('sentinel-curto-521', '30 14 1 * *', $$
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
$$);
