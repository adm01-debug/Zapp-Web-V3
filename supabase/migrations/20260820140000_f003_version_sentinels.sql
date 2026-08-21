-- 20260820140000 — f003_version_sentinels — REGISTRO RETROATIVO, NAO REAPLICAR (F-003)
-- =============================================================================
-- Correcao da colisao de versao detectada na auditoria RELATORIO-AUDITORIA-ZAPP-20260820:
--   * repo tinha 20260818140000_etapa57_invite_user.sql, mas no banco a versao
--     20260818140000 correspondia a "sentinel-teste-mensal" (criada via MCP).
--   * o conteudo de invite_user foi de fato aplicado como 20260818190003 (invite_user_rpc)
--     — confirmado em 2026-08-20 comparando pg_get_functiondef(zapp.invite_user) com o
--     arquivo 20260818190003_invite_user_rpc.sql (identicos: 3 args, RETURNS TABLE).
--
-- Acoes executadas (banco):
UPDATE supabase_migrations.schema_migrations
   SET name = 'sentinel-teste-mensal (FT evo.fdw_evolution_message + cron 530) - versao corrigida'
 WHERE version = '20260818140000';

UPDATE supabase_migrations.schema_migrations
   SET name = 'sentinel-curto-521 (job 532, 401 silencioso do cron 521)'
 WHERE version = '20260818160000';

-- Acoes executadas (repo):
--   * removido supabase/migrations/20260818140000_etapa57_invite_user.sql (conteudo superado;
--     a versao canonica do invite_user e 20260818190003_invite_user_rpc.sql);
--   * criados os registros retroativos 20260818140000_sentinel_teste_mensal.sql e
--     20260818160000_sentinel_curto_521.sql com o DDL real capturado do banco.

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260820140000', 'f003_version_sentinels')
ON CONFLICT DO NOTHING;
