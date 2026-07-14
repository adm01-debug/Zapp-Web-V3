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
--
-- HARDENING (2026-07-11, GAP-02):
--   - DO block garante dblink no schema public (instala ou realoca se já existir em outro schema)
--   - Guarda p_days > 0 rejeita valores inválidos antes de qualquer DELETE
--   - String de conexão inclui lock_timeout e statement_timeout por partição
--   - Chamadas dblink/dblink_exec schema-qualificadas (public.) — shadow-injection prevention
--   - REVOKE ALL + GRANT EXECUTE — restringe execução a postgres e supabase_admin
--   - search_path: pg_catalog PRIMEIRO para evitar function-shadowing

DO $do$
DECLARE v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'dblink';
  IF NOT FOUND THEN
    EXECUTE 'CREATE EXTENSION dblink SCHEMA public';
  ELSIF v_schema <> 'public' THEN
    RAISE EXCEPTION
      '[analytics_retention] dblink está instalado no schema "%" — mova-o para public '
      'antes de executar este script: ALTER EXTENSION dblink SET SCHEMA public',
      v_schema;
  END IF;
END $do$;

CREATE OR REPLACE FUNCTION ops.fn_analytics_log_retention(p_days int DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ops, public
AS $$
DECLARE
  v_conn    text;
  v_tbl     text;
  v_result  jsonb   := '[]'::jsonb;
  v_deleted text;
BEGIN
  -- Guarda: rejeitar valores que deletariam todos os dados ou não fazem sentido.
  IF p_days IS NULL OR p_days <= 0 THEN
    RAISE EXCEPTION '[analytics_retention] p_days deve ser positivo, recebido: %', p_days
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- lock_timeout: levanta exceção se uma partição ficar bloqueada (> 30s),
  -- permitindo que o handler por-partição a capture e continue para a próxima.
  -- statement_timeout: guarda adicional contra operações longas por partição.
  v_conn := 'host=/var/run/postgresql dbname=_supabase user=postgres '
            'options=''-c lock_timeout=30s -c statement_timeout=5min''';

  FOR v_tbl IN
    SELECT t.relname FROM public.dblink(v_conn,
      $q$SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='_analytics' AND c.relkind='r' AND c.relname ~ '^log_events_[0-9a-f_]{36}$'$q$
    ) AS t(relname text)
  LOOP
    BEGIN
      -- allowlist estrita: apenas _analytics.log_events_<uuid-com-underscores>
      v_deleted := public.dblink_exec(v_conn, format(
        'DELETE FROM _analytics.%I WHERE "timestamp" < (now() at time zone ''utc'') - interval ''%s days''',
        v_tbl, p_days));
      PERFORM public.dblink_exec(v_conn, format('VACUUM ANALYZE _analytics.%I', v_tbl));
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

-- SECURITY DEFINER + dblink/VACUUM em _analytics: não pode ficar executável via PUBLIC.
-- REVOKE explícito aqui torna o script auto-contido (não depende de script externo).
REVOKE ALL ON FUNCTION ops.fn_analytics_log_retention(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.fn_analytics_log_retention(int)
  TO postgres, supabase_admin;

COMMENT ON FUNCTION ops.fn_analytics_log_retention(int) IS
  'S4-4 (2026-07-04): retencao de 14 dias nos logs do Logflare (_supabase/_analytics). Antes desta correcao o _supabase tinha 35 GB (76% do disco do host); apos rewrite-swap ficou com 709 MB. Roda diario via pg_cron (dblink local peer, sem senha). search_path corrigido (pg_catalog first), exception handler por-particao adicionado, public.dblink schema-qualificado, lock_timeout/statement_timeout no dblink, guarda p_days>0, outer EXCEPTION re-raises para alertar pg_cron, REVOKE/GRANT hardening, DO block garante dblink em schema public (2026-07-11, GAP-02).';
