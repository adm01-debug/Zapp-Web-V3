-- 20260818140000 — sentinel-teste-mensal — REGISTRO RETROATIVO, NAO REAPLICAR (F-003, plano 100 etapas)
-- =============================================================================
-- Criado direto no banco em 2026-08-18 via MCP (workaround: supabase_apply_migration
-- bugado no self-hosted). Este arquivo versiona o DDL REAL capturado do banco em
-- 2026-08-20 (cron.job jobid=530 + foreign table evo.fdw_evolution_message).
--
-- HISTORICO DA COLISAO (F-003): a versao 20260818140000 estava registrada em
-- supabase_migrations.schema_migrations com o conteudo de "etapa57_invite_user",
-- que na verdade foi aplicado no banco como 20260818190003 (invite_user_rpc).
-- O name da linha 20260818140000 foi corrigido para "sentinel-teste-mensal"
-- (ver 20260820140000_f003_version_sentinels.sql) e o arquivo colidido
-- 20260818140000_etapa57_invite_user.sql foi removido do repo.
--
-- Rollback:
--   SELECT cron.unschedule('sentinel-teste-mensal');
--   DROP FOREIGN TABLE IF EXISTS evo.fdw_evolution_message;

-- 1) Foreign table para o banco interno da Evolution API (PG14).
--    Servidor FDW pre-existente: evolution_postgres (host=postgres, port=5432,
--    dbname=evolution, connect_timeout=5). Tabela remota: public."Message".
CREATE FOREIGN TABLE IF NOT EXISTS evo.fdw_evolution_message (
  id text,
  key jsonb,
  message jsonb,
  "messageTimestamp" integer
) SERVER evolution_postgres OPTIONS (schema_name 'public', table_name 'Message');

-- 2) Cron 530 — todo dia 2 do mes as 12:00 UTC: alerta critico no warroom se
--    nenhuma mensagem [TESTE-MENSAL] chegou ao PG14 desde o inicio do mes.
SELECT cron.schedule('sentinel-teste-mensal', '0 12 2 * *', $cmd$
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
$cmd$);
