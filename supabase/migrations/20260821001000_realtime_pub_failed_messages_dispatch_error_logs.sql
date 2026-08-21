-- =============================================================================
-- Reincorpora zapp.failed_messages e zapp.dispatch_error_logs à publication
-- supabase_realtime (plano-100 / validação exaustiva de 2026-08-20).
--
-- CONTEXTO (verificado AO VIVO em 2026-08-20 via pg_publication_tables):
--   a publication continha apenas 5 relations — evo.evolution_messages,
--   evo.evolution_conversations, evo.evolution_contacts, zapp.profiles e
--   zapp.app_notifications. As tabelas zapp.failed_messages e
--   zapp.dispatch_error_logs NÃO estavam na publication, apesar de:
--     1. o hook src/features/inbox/hooks/realtime/useFailedMessageAlerts.ts
--        assinar { schema: 'zapp', table: 'failed_messages' } — canal
--        SILENCIOSO em produção (view/tabela fora da publication não emite CDC);
--     2. o CLAUDE.md documentar ambas como presentes (a adição original de
--        dispatch_error_logs em 20260721_fix_cursor_rpcs_and_search_path.sql
--        se perdeu em alguma recriação da publication).
--
-- Ambas são tabelas físicas (relkind='r') com PRIMARY KEY (replica identity
-- default) — verificado via pg_class/pg_index em 2026-08-20.
--
-- Idempotente: só adiciona se ausente. Não altera dados.
--
-- ROLLBACK:
--   ALTER PUBLICATION supabase_realtime DROP TABLE zapp.failed_messages;
--   ALTER PUBLICATION supabase_realtime DROP TABLE zapp.dispatch_error_logs;
-- =============================================================================

DO $$
BEGIN
  -- Guard de ambiente limpo (migration-smoke aplica num Postgres efêmero):
  -- sem a publication ou sem as tabelas, é no-op com NOTICE — em produção
  -- ambas existem (verificado 2026-08-20).
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'publication supabase_realtime ausente (ambiente sem Realtime) — nada a fazer';
    RETURN;
  END IF;

  IF to_regclass('zapp.failed_messages') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp' AND tablename = 'failed_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.failed_messages;
    RAISE NOTICE 'supabase_realtime: zapp.failed_messages adicionada';
  END IF;

  IF to_regclass('zapp.dispatch_error_logs') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp' AND tablename = 'dispatch_error_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.dispatch_error_logs;
    RAISE NOTICE 'supabase_realtime: zapp.dispatch_error_logs adicionada';
  END IF;
END $$;
