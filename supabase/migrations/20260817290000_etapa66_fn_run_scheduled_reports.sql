-- ============================================================================
-- Etapa 66 — Relatórios Agendados (DASHBOARD-16): executor + agendamento
-- 2026-08-17 | DB-as-source: aplicado via MCP (supabase_apply_migration /
-- role postgres); este arquivo é o espelho versionado. Idempotente.
--
-- Depende da migration 20260817280000 (schema canônico + outbox).
--
-- Conteúdo:
--   1. Helpers: fn_report_to_csv (RFC 4180), fn_validate_report_query
--      (read-only + blocklist), fn_calculate_next_send (daily|weekly|monthly).
--   2. zapp.fn_run_scheduled_reports(p_limit) — SECURITY DEFINER:
--      advisory lock global (overlap daily+weekly) + por relatório;
--      statement_timeout 120s; valida query; EXECUTE com LIMIT 10000;
--      serializa CSV/JSON; grava na OUTBOX (scheduled_report_runs.content
--      + storage_path) — NÃO insere em storage.objects (objeto-fantasma em
--      self-hosted: o storage-api é dono dos blobs — ver cleanup-storage-
--      orphans); a edge faz upload via API + signed URL. Executa SOMENTE
--      relatórios cujo criador é admin/supervisor (F8 do SIM-4).
--      Circuit breaker: fail_count>=5 → is_active=false; backoff
--      next_send_at = now() + 15min * fail_count.
--   3. zapp.rpc_claim_pending_report_runs — claim atômico (SKIP LOCKED) da
--      outbox p/ a edge send-scheduled-report (padrão rpc_claim_csat_due).
--   4. Cron pg_cron idempotente: daily (08:00) + weekly (seg 08:00) chamando
--      a fn; dispatch */15 invocando a edge (http_post + vault service role).
--
-- Rollback:
--   SELECT cron.unschedule('scheduled-reports-daily');
--   SELECT cron.unschedule('scheduled-reports-weekly');
--   SELECT cron.unschedule('scheduled-reports-dispatch');
--   DROP FUNCTION IF EXISTS zapp.fn_run_scheduled_reports(integer);
--   DROP FUNCTION IF EXISTS zapp.fn_report_to_csv(jsonb);
--   DROP FUNCTION IF EXISTS zapp.fn_validate_report_query(text);
--   DROP FUNCTION IF EXISTS zapp.fn_calculate_next_send(text, timestamptz);
--   DROP FUNCTION IF EXISTS zapp.rpc_claim_pending_report_runs(integer, uuid);
-- ============================================================================

BEGIN;

-- ── 1a. fn_report_to_csv — serialização RFC 4180 (escape de aspas, vírgula,
-- quebra de linha; \n normalizado p/ espaço dentro de campos quotados —
-- compat Excel/Sheets). Retorna '' p/ array vazio. ──────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_report_to_csv(p_data jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_keys   text[];
  v_row    jsonb;
  v_key    text;
  v_val    text;
  v_line   text;
  v_csv    text := '';
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'array'
     OR jsonb_array_length(p_data) = 0 THEN
    RETURN '';
  END IF;

  -- Header: chaves do primeiro objeto (ordem do jsonb — determinística)
  v_keys := ARRAY(SELECT jsonb_object_keys(jsonb_array_element(p_data, 0)));
  v_csv  := array_to_string(v_keys, ',') || E'\n';

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data) LOOP
    v_line := '';
    FOREACH v_key IN ARRAY v_keys LOOP
      v_val := COALESCE(v_row ->> v_key, '');
      IF v_val ~ '["\n\r,]' THEN
        v_val := '"' || replace(replace(replace(v_val, '"', '""'), E'\r', ''), E'\n', ' ') || '"';
      END IF;
      v_line := v_line || v_val || ',';
    END LOOP;
    v_csv := v_csv || rtrim(v_line, ',') || E'\n';
  END LOOP;

  RETURN v_csv;
END
$$;

COMMENT ON FUNCTION zapp.fn_report_to_csv(jsonb) IS
  'Serializa jsonb array de objetos em CSV RFC 4180 (escape " , \\n \\r; \\n vira espaço dentro de campos quotados).';

-- ── 1b. fn_validate_report_query — só SELECT/WITH read-only. Strip de
-- comentários antes do check (F8: SEL--x\nECT); blocklist de DML/DDL/
-- funções pg_*. É defesa em profundidade — o gate real é admin-only. ────────
CREATE OR REPLACE FUNCTION zapp.fn_validate_report_query(p_sql text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean   text;
  v_blocked text[] := ARRAY[
    '\minsert\M', '\mupdate\M', '\mdelete\M', '\mdrop\M', '\malter\M',
    '\mcreate\M', '\mtruncate\M', '\mgrant\M', '\mrevoke\M', '\mcall\M',
    '\mcopy\M', '\minto\M', '\mdo\M', '\mmerge\M',
    '\mexecute\M', '\mprepare\M', '\mdeallocate\M', '\mlisten\M',
    '\mnotify\M', '\mvacuum\M', '\manalyze\M',
    '\mreindex\M', '\mcluster\M', '\mpg_[a-z_]*\s*\(',
    '\mlo_import\b', '\mlo_export\b', '\mdblink\b', '\mnet\.[a-z_]+',
    '\mhttp_post\b', '\mcron\.[a-z_]+', '\mstorage\.[a-z_]+'
  ];
  v_kw      text;
BEGIN
  IF p_sql IS NULL OR btrim(p_sql) = '' THEN
    RETURN false;
  END IF;

  -- Remove comentários de linha e bloco antes de qualquer análise
  v_clean := regexp_replace(p_sql, '--[^\n]*', '', 'g');
  v_clean := regexp_replace(v_clean, '/\*.*?\*/', '', 'gs');

  -- Deve começar com SELECT ou WITH (CTE read-only é checada pela blocklist)
  IF NOT (v_clean ~* '^\s*(SELECT|WITH)\b') THEN
    RETURN false;
  END IF;

  FOREACH v_kw IN ARRAY v_blocked LOOP
    IF v_clean ~* v_kw THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END
$$;

COMMENT ON FUNCTION zapp.fn_validate_report_query(text) IS
  'Valida que config.sql é SELECT/WITH read-only (blocklist DML/DDL/funções pg_). Defesa em profundidade — execução é restrita a admin/supervisor.';

-- ── 1c. fn_calculate_next_send — próximo disparo a partir de keyword
-- (daily|weekly|monthly) ou cron (fallback conservador: próximo dia 08:00).
-- Semana ISO (date_trunc week = segunda). ────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_calculate_next_send(
  p_schedule text,
  p_from timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_sched text := lower(btrim(COALESCE(p_schedule, 'daily')));
  v_base  timestamptz := COALESCE(p_from, now());
  v_next  timestamptz;
BEGIN
  IF v_sched = 'weekly' THEN
    v_next := date_trunc('week', v_base) + interval '8 days 8 hours';  -- próxima segunda 08:00
  ELSIF v_sched = 'monthly' THEN
    v_next := date_trunc('month', v_base) + interval '1 month 8 hours'; -- dia 1 08:00
  ELSE
    v_next := date_trunc('day', v_base) + interval '1 day 8 hours';     -- daily + fallback cron
  END IF;

  -- Guarda: nunca retornar <= base (relógio parado/retrocedido)
  IF v_next <= v_base THEN
    v_next := v_next + interval '1 day';
  END IF;

  RETURN v_next;
END
$$;

COMMENT ON FUNCTION zapp.fn_calculate_next_send(text, timestamptz) IS
  'Calcula next_send_at: daily=amanhã 08:00, weekly=próxima segunda 08:00, monthly=dia 1 08:00, cron=fallback daily.';

-- ── 2. Executor principal ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_run_scheduled_reports(p_limit integer DEFAULT 50)
RETURNS TABLE (processed integer, success integer, failed integer, skipped integer)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = zapp, public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_report     record;
  v_sql        text;
  v_data       jsonb;
  v_content    text;
  v_ext        text;
  v_mime       text;
  v_path       text;
  v_next       timestamptz;
  v_limit      integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_processed  integer := 0;
  v_success    integer := 0;
  v_failed     integer := 0;
  v_skipped    integer := 0;
  v_global_key bigint := hashtext('zapp.fn_run_scheduled_reports');
  v_report_key bigint;
BEGIN
  -- Lock global: daily+weekly rodam a MESMA fn na mesma janela; o segundo
  -- chamador não processa nada (evita run duplicado — F4/F5 do SIM-4).
  IF NOT pg_try_advisory_xact_lock(v_global_key) THEN
    RETURN QUERY SELECT 0::integer, 0::integer, 0::integer, 0::integer;
    RETURN;
  END IF;

  FOR v_report IN
    SELECT r.id, r.name, r.format, r.config, r.schedule, r.frequency
      FROM zapp.scheduled_reports r
     WHERE r.is_active
       AND r.fail_count < 5
       AND (r.next_send_at IS NULL OR r.next_send_at <= now())
       -- F8 (SIM-4): só executa queries de relatórios criados por
       -- admin/supervisor — SECURITY DEFINER não vira vetor de usuário comum
       AND EXISTS (
         SELECT 1 FROM zapp.profiles p
          WHERE p.id = r.created_by
            AND zapp.is_admin_or_supervisor(p.user_id)
       )
     ORDER BY r.next_send_at NULLS FIRST
     LIMIT v_limit
  LOOP
    v_processed := v_processed + 1;
    v_report_key := hashtext('zapp.fn_run_scheduled_reports:' || v_report.id::text);

    -- Lock por relatório: chamada concorrente da MESMA fn (overlap) pula
    IF NOT pg_try_advisory_xact_lock(v_report_key) THEN
      INSERT INTO zapp.scheduled_report_runs
        (report_id, status, error, started_at, finished_at)
      VALUES
        (v_report.id, 'skipped_lock', 'advisory lock ocupado (overlap)', now(), now());
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      -- 1) Query read-only
      v_sql := NULLIF(v_report.config ->> 'sql', '');
      IF v_sql IS NULL THEN
        RAISE EXCEPTION 'config.sql vazio — defina a query read-only do relatório';
      END IF;
      IF NOT zapp.fn_validate_report_query(v_sql) THEN
        RAISE EXCEPTION 'query inválida: apenas SELECT/WITH read-only (sem DML/DDL/comentários)';
      END IF;

      -- 2) Executa com guard de volume (LIMIT 10000) e timeout herdado (120s)
      EXECUTE format(
        'SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (SELECT * FROM (%s) _inner LIMIT 10000) t',
        v_sql
      ) INTO v_data;

      -- 3) Serializa
      IF v_report.format = 'csv' THEN
        v_content := zapp.fn_report_to_csv(v_data);
        v_ext     := 'csv';
        v_mime    := 'text/csv';
      ELSE
        v_content := jsonb_pretty(v_data);
        v_ext     := 'json';
        v_mime    := 'application/json';
      END IF;

      v_path := 'reports/' || to_char(now(), 'YYYY/MM/DD') || '/'
                || v_report.id::text || '-' || to_char(now(), 'YYYYMMDDHH24MISS')
                || '.' || v_ext;

      -- 4) OUTBOX (auditoria + fila p/ a edge). Upload do blob + signed URL
      --    ficam na edge (storage-api é dono dos arquivos em self-hosted).
      INSERT INTO zapp.scheduled_report_runs
        (report_id, status, content, storage_path, row_count, started_at, finished_at)
      VALUES
        (v_report.id, 'success', v_content, v_path,
         (SELECT count(*) FROM jsonb_array_elements(v_data)),
         now(), now());

      -- 5) Avança o agendamento
      v_next := zapp.fn_calculate_next_send(
        COALESCE(v_report.schedule, v_report.frequency), now()
      );
      UPDATE zapp.scheduled_reports
         SET last_run_at  = now(),
             last_error   = NULL,
             fail_count   = 0,
             next_send_at = v_next,
             updated_at   = now()
       WHERE id = v_report.id;

      v_success := v_success + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Circuit breaker + backoff exponencial (F3/F6 do SIM-4)
      UPDATE zapp.scheduled_reports
         SET last_run_at  = now(),
             last_error   = left(SQLERRM, 500),
             fail_count   = fail_count + 1,
             next_send_at = now() + (interval '15 minutes' * (fail_count + 1)),
             is_active    = CASE WHEN fail_count + 1 >= 5 THEN false ELSE is_active END,
             updated_at   = now()
       WHERE id = v_report.id;

      INSERT INTO zapp.scheduled_report_runs
        (report_id, status, error, started_at, finished_at)
      VALUES
        (v_report.id, 'error', left(SQLERRM, 500), now(), now());

      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_success, v_failed, v_skipped;
END
$$;

-- ignore-lint-ml001 (falso positivo: 'SECURITY DEFINER' aparece no texto do COMMENT; a funcao tem SET search_path)
COMMENT ON FUNCTION zapp.fn_run_scheduled_reports(integer) IS
  'Executor de relatórios agendados (DASHBOARD-16): gera CSV/JSON na outbox scheduled_report_runs; funcao definer com advisory locks, statement_timeout 120s, validação read-only e execução restrita a admin/supervisor.';

GRANT EXECUTE ON FUNCTION zapp.fn_run_scheduled_reports(integer) TO service_role;

-- ── 3. Claim da outbox p/ a edge (padrão rpc_claim_csat_due: SKIP LOCKED) ──
CREATE OR REPLACE FUNCTION zapp.rpc_claim_pending_report_runs(
  p_limit     integer DEFAULT 20,
  p_report_id uuid DEFAULT NULL
)
RETURNS TABLE (
  run_id       uuid,
  report_id    uuid,
  report_name  text,
  format       text,
  recipients   text[],
  content      text,
  storage_path text,
  row_count    integer,
  signed_url   text,
  send_attempts integer
)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = zapp, public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 50));
BEGIN
  -- 1) Recovery: runs presos em 'sending' >10min (edge crash no meio do
  --    batch — padrão csat F9) voltam p/ 'success' e são re-claimáveis.
  UPDATE zapp.scheduled_report_runs r
     SET status = 'success', claimed_at = NULL
   WHERE r.status = 'sending'
     AND r.claimed_at < now() - interval '10 minutes';

  -- 2) Claim atômico: marca 'sending' + send_attempts++ (DLQ após 5).
  --    p_report_id NULL = batch geral; informado = relatório específico (v1).
  --    Temp table + RETURNING: cada chamada devolve SÓ o que ELA claimou
  --    (SKIP LOCKED evita cross-talk entre dispatchers concorrentes — F5).
  CREATE TEMP TABLE _claimed_runs (run_id uuid PRIMARY KEY) ON COMMIT DROP;

  WITH claimed AS (
    UPDATE zapp.scheduled_report_runs r
       SET status = 'sending', claimed_at = now(), send_attempts = send_attempts + 1
     WHERE r.id IN (
       SELECT r2.id
         FROM zapp.scheduled_report_runs r2
        WHERE r2.status = 'success'
          AND r2.delivered_at IS NULL
          AND r2.send_attempts < 5
          AND (p_report_id IS NULL OR r2.report_id = p_report_id)
        ORDER BY r2.started_at
        LIMIT v_limit
          FOR UPDATE OF r2 SKIP LOCKED
     )
     RETURNING r.id
  )
  INSERT INTO _claimed_runs SELECT id FROM claimed;

  -- 3) Devolve os runs claimados por ESTA chamada
  RETURN QUERY
  SELECT r.id, r.report_id, s.name, s.format, s.recipients,
         r.content, r.storage_path, r.row_count, r.signed_url, r.send_attempts
    FROM zapp.scheduled_report_runs r
    JOIN zapp.scheduled_reports s ON s.id = r.report_id
   WHERE r.id IN (SELECT run_id FROM _claimed_runs)
   ORDER BY r.started_at;
END
$$;

COMMENT ON FUNCTION zapp.rpc_claim_pending_report_runs(integer, uuid) IS
  'Claim atômico (SKIP LOCKED) da outbox scheduled_report_runs p/ a edge send-scheduled-report; recupera sending órfão >10min; send_attempts>=5 vira DLQ (permanece success, não re-claimado).';

GRANT EXECUTE ON FUNCTION zapp.rpc_claim_pending_report_runs(integer, uuid) TO service_role;

COMMIT;

-- ============================================================================
-- 4. Cron pg_cron — idempotente (unschedule condicional + schedule; F2-06)
-- ============================================================================
SELECT cron.unschedule('scheduled-reports-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-reports-daily');

SELECT cron.schedule(
  'scheduled-reports-daily', '0 8 * * *',
  'SELECT zapp.fn_run_scheduled_reports()'
);

SELECT cron.unschedule('scheduled-reports-weekly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-reports-weekly');

SELECT cron.schedule(
  'scheduled-reports-weekly', '0 8 * * 1',
  'SELECT zapp.fn_run_scheduled_reports()'
);

-- Dispatch da outbox → edge (a cada 15 min; padrão csat-dispatch-tick:
-- http_post com service_role do vault). A fn varre por next_send_at, então
-- os 2 jobs diários são redundância deliberada (failover de janela).
SELECT cron.unschedule('scheduled-reports-dispatch')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-reports-dispatch');

SELECT cron.schedule(
  'scheduled-reports-dispatch', '*/15 * * * *',
  $cmd$
    SELECT extensions.http_post(
      url     := 'https://supabase.atomicabr.com.br/functions/v1/send-scheduled-report',
      body    := '{}',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key')
      )
    );
  $cmd$
);
