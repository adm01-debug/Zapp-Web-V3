-- S4-4 (sessão 5, 2026-07-04): retenção do _analytics/Logflare (Supabase self-hosted).
-- ANTES: banco _supabase = 35 GB (uma tabela cloudflare.logs.prod com 30 GB / 29,6M linhas,
--        das quais só 320k tinham < 14 dias — pico anômalo de ingestão entre 11–20/06),
--        disco do host a 76%, e supabase_db sofrendo exit 137 (padrão OOM) recorrente.
-- EXECUTADO: rewrite-swap com janela de 14 dias nas duas maiores tabelas
--   (CREATE LIKE INCLUDING ALL → INSERT janela → RENAME swap → DROP antiga → VACUUM ANALYZE),
--   lock de 4,7s (5,3 GB → 79 MB) e 25s (30 GB → 350 MB). Ingestão do Logflare validada
--   pós-swap (linhas novas entrando). Resultado: _supabase = 709 MB (~34,3 GB recuperados).
-- PERMANENTE: função abaixo (DB postgres, owner supabase_admin — dblink local peer exige
--   superuser para conexão sem senha) + pg_cron jobid 100:
--   SELECT cron.schedule('analytics-log-retention', '20 5 * * *',
--     'SELECT ops.fn_analytics_log_retention(14)');
--   (agendado como supabase_admin — o pg_cron executa o job com o role de quem agendou)

CREATE EXTENSION IF NOT EXISTS dblink;

CREATE OR REPLACE FUNCTION ops.fn_analytics_log_retention(p_days int DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ops, public
AS $$
DECLARE
  v_conn    text    := 'host=/var/run/postgresql dbname=_supabase user=postgres';
  v_tbl     text;
  v_result  jsonb   := '[]'::jsonb;
  v_deleted text;
BEGIN
  FOR v_tbl IN
    SELECT t.relname FROM dblink(v_conn,
      $q$SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='_analytics' AND c.relkind='r' AND c.relname ~ '^log_events_[0-9a-f_]{36}$'$q$
    ) AS t(relname text)
  LOOP
    BEGIN
      -- allowlist estrita: apenas _analytics.log_events_<uuid-com-underscores>
      v_deleted := dblink_exec(v_conn, format(
        'DELETE FROM _analytics.%I WHERE "timestamp" < (now() at time zone ''utc'') - interval ''%s days''',
        v_tbl, p_days));
      PERFORM dblink_exec(v_conn, format('VACUUM ANALYZE _analytics.%I', v_tbl));
      v_result := v_result || jsonb_build_object('table', v_tbl, 'result', v_deleted);
    EXCEPTION WHEN OTHERS THEN
      -- Falha em uma partição não deve parar o processamento das demais.
      RAISE WARNING '[analytics_retention] particao % falhou: % (SQLSTATE %)', v_tbl, SQLERRM, SQLSTATE;
      v_result := v_result || jsonb_build_object('table', v_tbl, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('retention_days', p_days, 'executed_at', now(), 'tables', v_result);

EXCEPTION WHEN OTHERS THEN
  -- Falha crítica (ex: socket indisponível, sem permissão no dblink).
  -- Re-levanta a exceção após registrar WARNING: pg_cron marca o job como
  -- 'failed' apenas quando a função levanta, não quando retorna resultado de erro.
  RAISE WARNING '[analytics_retention] falha critica: % (SQLSTATE %)', SQLERRM, SQLSTATE;
  RAISE;
END $$;

ALTER FUNCTION ops.fn_analytics_log_retention(int) OWNER TO supabase_admin;

COMMENT ON FUNCTION ops.fn_analytics_log_retention(int) IS
  'S4-4 (2026-07-04): retencao de 14 dias nos logs do Logflare (_supabase/_analytics). Antes desta correcao o _supabase tinha 35 GB (76% do disco do host); apos rewrite-swap ficou com 709 MB. Roda diario via pg_cron (dblink local peer, sem senha).';
