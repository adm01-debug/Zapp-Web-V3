-- ═══════════════════════════════════════════════════════════════════════════════
-- INV-6 — a publicação `supabase_realtime` não pode encolher em silêncio
-- ═══════════════════════════════════════════════════════════════════════════════
-- Motivo: o PR #712 propôs 1292 linhas de migração para "adicionar 25 tabelas
-- ausentes" da publicação. Medição no `pg_catalog` mostrou que as 25 já estavam
-- lá. A auditoria tinha sido feita por grep no diretório de migrações — que não
-- enxerga `ALTER PUBLICATION` emitido por `EXECUTE format(...)` dentro de bloco
-- DO, e ignora `supabase/migrations/archive/` (963 arquivos, 70 deles mexendo
-- na publicação).
--
-- Este check faz a pergunta certa na fonte certa: compara o manifesto versionado
-- em `scripts/sql/realtime-publication.manifest` contra o catálogo real.
--
-- Uso local ou na VPS:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/check-realtime-publication.sql
--
-- Regenerar o manifesto (só com justificativa no commit):
--   psql "$SUPABASE_DB_URL" -Atc "SELECT schemaname||'.'||tablename FROM pg_publication_tables \
--     WHERE pubname='supabase_realtime' ORDER BY 1" > scripts/sql/realtime-publication.manifest
-- ═══════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\set QUIET on

CREATE TEMP TABLE _manifesto (tabela TEXT);
\copy _manifesto FROM 'scripts/sql/realtime-publication.manifest'

\set QUIET off

DO $$
DECLARE
  v_faltando TEXT[];
  v_extras   TEXT[];
  v_total    INT;
BEGIN
  SELECT count(*) INTO v_total FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

  -- Regressão: estava no manifesto e sumiu da publicação. Isto reprova.
  SELECT coalesce(array_agg(m.tabela ORDER BY m.tabela), ARRAY[]::TEXT[])
    INTO v_faltando
    FROM _manifesto m
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_publication_tables pt
      WHERE pt.pubname = 'supabase_realtime'
        AND pt.schemaname || '.' || pt.tablename = m.tabela
   );

  -- Drift para cima: entrou sem passar pelo manifesto. Isto avisa, não reprova.
  SELECT coalesce(array_agg(pt.schemaname || '.' || pt.tablename ORDER BY 1), ARRAY[]::TEXT[])
    INTO v_extras
    FROM pg_publication_tables pt
   WHERE pt.pubname = 'supabase_realtime'
     AND NOT EXISTS (SELECT 1 FROM _manifesto m WHERE m.tabela = pt.schemaname || '.' || pt.tablename);

  RAISE NOTICE '[INV-6] publicacao tem % tabelas; manifesto tem %',
    v_total, (SELECT count(*) FROM _manifesto);

  IF array_length(v_extras, 1) > 0 THEN
    RAISE WARNING '[INV-6] % tabela(s) na publicacao fora do manifesto: [%]. Se for intencional, regenere o manifesto no mesmo commit.',
      array_length(v_extras, 1), array_to_string(v_extras, ', ');
  END IF;

  IF array_length(v_faltando, 1) > 0 THEN
    RAISE EXCEPTION '[INV-6] REGRESSAO: % tabela(s) do manifesto sumiram de supabase_realtime: [%]',
      array_length(v_faltando, 1), array_to_string(v_faltando, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '[INV-6] OK — nenhuma regressao na publicacao.';
END $$;
