-- GAP-02 (sessão 6, 2026-07-11): adiciona handler de exceção por partição em
-- ops.fn_analytics_log_retention e corrige ordem do search_path.
--
-- PROBLEMA: versão original (S4-4) não tinha bloco BEGIN...EXCEPTION dentro do LOOP.
-- Se uma partição falhasse (ex: tabela bloqueada, dblink timeout), toda a função
-- abortava sem processar as demais. O pg_cron marcava o job como 'failed' e as
-- outras partições ficavam sem limpeza.
--
-- CORREÇÃO:
--   1. Bloco BEGIN...EXCEPTION WHEN OTHERS THEN dentro do LOOP — falha em uma
--      partição registra WARNING e continua para a próxima (sem RAISE, sem RETURN).
--   2. Bloco EXCEPTION WHEN OTHERS THEN externo — captura falha catastrófica
--      (socket dblink indisponível, sem permissão) e retorna jsonb de erro em vez
--      de propagar exceção. O pg_cron só marca o job como 'failed' quando a função
--      levanta; retornar jsonb mantém o histórico de execução visível em cron.job_run_details.
--   3. search_path reordenado: pg_catalog PRIMEIRO (shadow-injection prevention).

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
  -- Retorna jsonb de erro em vez de propagar exceção: o pg_cron marca o job como
  -- 'failed' apenas quando a função levanta, não quando retorna resultado de erro.
  RAISE WARNING '[analytics_retention] falha critica: % (SQLSTATE %)', SQLERRM, SQLSTATE;
  RETURN jsonb_build_object(
    'error',          SQLERRM,
    'sqlstate',       SQLSTATE,
    'retention_days', p_days,
    'executed_at',    now(),
    'tables',         v_result
  );
END $$;

ALTER FUNCTION ops.fn_analytics_log_retention(int) OWNER TO supabase_admin;

-- SECURITY DEFINER + dblink/VACUUM em _analytics: não pode ficar executável via PUBLIC.
-- REVOKE explícito aqui torna a migration auto-contida (não depende de script externo).
REVOKE ALL ON FUNCTION ops.fn_analytics_log_retention(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.fn_analytics_log_retention(int)
  TO postgres, supabase_admin;

COMMENT ON FUNCTION ops.fn_analytics_log_retention(int) IS
  'S4-4 (2026-07-04): retencao de 14 dias nos logs do Logflare (_supabase/_analytics). Antes desta correcao o _supabase tinha 35 GB (76% do disco do host); apos rewrite-swap ficou com 709 MB. Roda diario via pg_cron (dblink local peer, sem senha). search_path corrigido (pg_catalog first) e exception handler por-particao adicionado em 2026-07-11 (GAP-02).';
