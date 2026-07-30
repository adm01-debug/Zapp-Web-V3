-- ============================================================================
-- Restore Integrity Check Function + Daily pg_cron (E9-05)
-- Auditoria 2026-07-10
--
-- E9-05 — Restore-validate falha (backup corrompido)
--   Os stubs fn_backup_health_check / fn_check_restore_validation_health /
--   fn_trigger_restore_validation retornavam "manual_check_required" sem
--   executar nenhuma verificação real. Substituídos por
--   fn_restore_integrity_check() com 7 checks concretos ancorados em
--   baselines de produção (681 tabelas, ≥20 partições, ≤26h de backup).
--
-- Checks executados:
--   1. ops.backup_sentinel — FAIL se backup > 26h
--   2. evo.evolution_messages_wpp2 — acessibilidade e leitura
--   3. public.evolution_contacts — WARN se < 1000 linhas
--   4. evo.evolution_webhook_events — FAIL se < 20 partições
--   5. pg_index — FAIL se qualquer índice inválido (indisvalid=false)
--   6. 6 funções críticas presentes (FAIL se ausente qualquer uma)
--   7. Contagem de tabelas — FAIL se < 500 (baseline: 681)
--
-- Resultados gravados em public.restore_test_log (CREATE TABLE IF NOT EXISTS).
-- Alerta criado em zapp.webhook_health_alerts quando overall = 'FAIL'.
-- Scheduled: todo dia às 11:00 UTC.
--
-- Aplicado ao vivo via MCP em 2026-07-10. Verificado.
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION +
--   cron.unschedule (IF EXISTS) + cron.schedule.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- Log table (idempotent)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.restore_test_log (
  id          BIGSERIAL    PRIMARY KEY,
  run_id      UUID         NOT NULL,
  step        TEXT         NOT NULL,
  status      TEXT         NOT NULL,  -- PASS | WARN | FAIL
  detail      TEXT,
  checked_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.restore_test_log IS
  'E9-05: Per-step results from fn_restore_integrity_check() daily runs.';

CREATE INDEX IF NOT EXISTS idx_restore_test_log_run_id  ON public.restore_test_log (run_id);
CREATE INDEX IF NOT EXISTS idx_restore_test_log_checked ON public.restore_test_log (checked_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- Main integrity-check function
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_restore_integrity_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo, archive, zapp, monitoring, ops, pg_temp
AS $$
DECLARE
  v_run_id      uuid        := gen_random_uuid();
  v_start       timestamptz := now();
  v_result      jsonb       := '{}';
  v_pass        int         := 0;
  v_fail        int         := 0;
  v_warn        int         := 0;
  v_overall     text;
  v_n           bigint;
  v_backup_age  numeric;
  v_backup_file text;
  v_detail      text;
  v_status      text;
  v_fn_name     text;
  v_fn_exists   boolean;

  v_critical_functions text[] := ARRAY[
    'fn_process_webhook_event',
    'fn_process_whatsapp_message',
    'fn_cache_warmup_after_vacuum',
    'fn_purge_api_key_from_logs',
    'fn_gc_deleted_messages',
    'fn_zapp_web_smoke_test_v2'
  ];
BEGIN

  -- ── 1. Backup sentinel freshness (FAIL if > 26h) ──────────────────────────
  BEGIN
    SELECT
      EXTRACT(EPOCH FROM (now() - last_backup_at)) / 3600,
      last_backup_file
    INTO v_backup_age, v_backup_file
    FROM ops.backup_sentinel
    ORDER BY last_backup_at DESC
    LIMIT 1;

    IF v_backup_age IS NULL THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := 'ops.backup_sentinel is empty — no backup record found';
    ELSIF v_backup_age > 26 THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := format('last backup %sh ago (file: %s) — exceeds 26h threshold',
                         v_backup_age, v_backup_file);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := format('last backup %sh ago — file: %s', v_backup_age, v_backup_file);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'ops.backup_sentinel inaccessible: ' || SQLERRM;
  END;

  INSERT INTO public.restore_test_log (run_id, step, status, detail)
  VALUES (v_run_id, '1_backup_sentinel_freshness', v_status, v_detail);
  v_result := v_result || jsonb_build_object('1_backup_sentinel', jsonb_build_object('status', v_status, 'detail', v_detail));

  -- ── 2. evolution_messages_wpp2 accessibility ──────────────────────────────
  BEGIN
    SELECT COUNT(*) INTO v_n FROM evo.evolution_messages_wpp2 LIMIT 1;
    v_status := 'PASS'; v_pass := v_pass + 1;
    v_detail := 'evo.evolution_messages_wpp2 readable';
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'evo.evolution_messages_wpp2 inaccessible: ' || SQLERRM;
  END;

  INSERT INTO public.restore_test_log (run_id, step, status, detail)
  VALUES (v_run_id, '2_messages_wpp2_access', v_status, v_detail);
  v_result := v_result || jsonb_build_object('2_messages_wpp2', jsonb_build_object('status', v_status, 'detail', v_detail));

  -- ── 3. evolution_contacts row count (WARN < 1000) ─────────────────────────
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.evolution_contacts WHERE deleted_at IS NULL;
    IF v_n < 1000 THEN
      v_status := 'WARN'; v_warn := v_warn + 1;
      v_detail := format('evolution_contacts has only %s active rows (expected ≥ 1000)', v_n);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := format('evolution_contacts: %s active rows', v_n);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'public.evolution_contacts inaccessible: ' || SQLERRM;
  END;

  INSERT INTO public.restore_test_log (run_id, step, status, detail)
  VALUES (v_run_id, '3_contacts_row_count', v_status, v_detail);
  v_result := v_result || jsonb_build_object('3_contacts', jsonb_build_object('status', v_status, 'detail', v_detail));

  -- ── 4. evolution_webhook_events partition count (FAIL < 20) ───────────────
  BEGIN
    SELECT COUNT(*) INTO v_n
    FROM pg_inherits i
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = p.relnamespace
    WHERE n.nspname = 'evo' AND p.relname = 'evolution_webhook_events';

    IF v_n < 20 THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := format('only %s partitions found — expected ≥ 20 (baseline: 23)', v_n);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := format('%s partitions present', v_n);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'partition count check failed: ' || SQLERRM;
  END;

  INSERT INTO public.restore_test_log (run_id, step, status, detail)
  VALUES (v_run_id, '4_partition_count', v_status, v_detail);
  v_result := v_result || jsonb_build_object('4_partitions', jsonb_build_object('status', v_status, 'detail', v_detail));

  -- ── 5. Invalid indexes in public/evo/zapp (FAIL if any) ───────────────────
  BEGIN
    SELECT COUNT(*) INTO v_n
    FROM pg_index ix
    JOIN pg_class c ON c.oid = ix.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'evo', 'zapp')
      AND NOT ix.indisvalid;

    IF v_n > 0 THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := format('%s invalid index(es) found in public/evo/zapp — REINDEX required', v_n);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := 'all indexes in public/evo/zapp are valid';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'invalid index check failed: ' || SQLERRM;
  END;

  INSERT INTO public.restore_test_log (run_id, step, status, detail)
  VALUES (v_run_id, '5_invalid_indexes', v_status, v_detail);
  v_result := v_result || jsonb_build_object('5_invalid_indexes', jsonb_build_object('status', v_status, 'detail', v_detail));

  -- ── 6. 6 critical functions present ───────────────────────────────────────
  BEGIN
    v_detail := '';
    v_status := 'PASS';
    FOREACH v_fn_name IN ARRAY v_critical_functions LOOP
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('public', 'evo', 'zapp')
          AND p.proname = v_fn_name
      ) INTO v_fn_exists;

      IF NOT v_fn_exists THEN
        v_status := 'FAIL';
        v_detail := v_detail || v_fn_name || ' MISSING; ';
      END IF;
    END LOOP;

    IF v_status = 'PASS' THEN
      v_pass := v_pass + 1;
      v_detail := 'all 6 critical functions present: ' || array_to_string(v_critical_functions, ', ');
    ELSE
      v_fail := v_fail + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'critical function check failed: ' || SQLERRM;
  END;

  INSERT INTO public.restore_test_log (run_id, step, status, detail)
  VALUES (v_run_id, '6_critical_functions', v_status, v_detail);
  v_result := v_result || jsonb_build_object('6_critical_functions', jsonb_build_object('status', v_status, 'detail', v_detail));

  -- ── 7. Table count sanity (FAIL < 500; baseline 681) ─────────────────────
  BEGIN
    SELECT COUNT(*) INTO v_n
    FROM information_schema.tables
    WHERE table_schema IN ('public', 'evo', 'zapp', 'archive', 'ops')
      AND table_type = 'BASE TABLE';

    IF v_n < 500 THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := format('only %s tables found — expected ≥ 500 (baseline: 681)', v_n);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := format('%s tables present across public/evo/zapp/archive/ops', v_n);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'table count check failed: ' || SQLERRM;
  END;

  INSERT INTO public.restore_test_log (run_id, step, status, detail)
  VALUES (v_run_id, '7_table_count_sanity', v_status, v_detail);
  v_result := v_result || jsonb_build_object('7_table_count', jsonb_build_object('status', v_status, 'detail', v_detail));

  -- ── Overall verdict ────────────────────────────────────────────────────────
  v_overall := CASE
    WHEN v_fail > 0 THEN 'FAIL'
    WHEN v_warn > 0 THEN 'WARN'
    ELSE 'PASS'
  END;

  INSERT INTO public.restore_test_log (run_id, step, status, detail)
  VALUES (v_run_id, 'SUMMARY',
    v_overall,
    format('pass=%s warn=%s fail=%s duration_ms=%s',
           v_pass, v_warn, v_fail,
           ROUND(EXTRACT(EPOCH FROM (now() - v_start)) * 1000)));

  -- ── Alert on FAIL ─────────────────────────────────────────────────────────
  IF v_overall = 'FAIL' THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, message, metadata, created_at)
      VALUES (
        'restore_integrity_fail',
        'critical',
        format('E9-05: fn_restore_integrity_check FAIL — %s check(s) failed. run_id=%s', v_fail, v_run_id),
        jsonb_build_object('run_id', v_run_id, 'pass', v_pass, 'warn', v_warn, 'fail', v_fail, 'detail', v_result),
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'run_id',      v_run_id,
    'checked_at',  v_start,
    'duration_ms', ROUND(EXTRACT(EPOCH FROM (now() - v_start)) * 1000),
    'overall',     v_overall,
    'pass',        v_pass,
    'warn',        v_warn,
    'fail',        v_fail,
    'checks',      v_result
  );
END;
$$;

COMMENT ON FUNCTION public.fn_restore_integrity_check() IS
  'E9-05: 7-point daily integrity check anchored to production baselines '
  '(681 tables, ≥20 partitions, ≤26h backup age, 6 critical functions). '
  'Writes per-step results to public.restore_test_log. '
  'Raises zapp.webhook_health_alerts alert on FAIL. '
  'Scheduled daily at 11:00 UTC via pg_cron.';

-- ──────────────────────────────────────────────────────────────────────────────
-- pg_cron: daily at 11:00 UTC
-- ──────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('restore-integrity-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'restore-integrity-check');

SELECT cron.schedule(
  'restore-integrity-check',
  '0 11 * * *',
  'SELECT public.fn_restore_integrity_check()'
);
