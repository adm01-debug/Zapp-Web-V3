-- ============================================================================
-- AG-EX-17 wave 2 observabilidade | item 143 — Falso positivo do baseline de
-- partições em fn_restore_integrity_check
-- 20260807094000_item143_restore_partition_baseline_dynamic.sql
--
-- Problema (AG-EX-09 §82): step 4_partition_count exige baseline ESTÁTICO ≥17
-- partições de evo.evolution_webhook_events_v2. Realidade: 13 partições mensais
-- (2026_06 → 2027_06) + _default VAZIA = 14 → FAIL diário às 11:00Z → alertas
-- críticos restore_integrity_fail falsos (6 abertos) em silo silencioso.
--
-- Fix: baseline DINÂMICO — (a) conta só partições NÃO-default (default vazia não
-- conta nem falha); (b) exige ≥7 (mês atual + 6 futuros, cobertura da automação);
-- (c) default com linhas = WARN (dados fora do range). Resolve os 6 alertas
-- abertos (todos com único fail = 4_partitions).
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_restore_integrity_check()
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
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
  v_row_exists  boolean;
  v_default_part text;
  v_default_rows bigint;

  v_critical_functions text[] := ARRAY[
    'fn_process_webhook_event',
    'fn_process_whatsapp_message',
    'fn_cache_warmup_after_vacuum',
    'fn_purge_api_key_from_logs',
    'fn_gc_deleted_messages',
    'fn_zapp_web_smoke_test_v2'
  ];
BEGIN

  BEGIN
    SELECT EXTRACT(EPOCH FROM (now() - last_backup_at)) / 3600, last_backup_file
    INTO v_backup_age, v_backup_file
    FROM ops.backup_sentinel ORDER BY last_backup_at DESC LIMIT 1;
    IF v_backup_age IS NULL THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := 'ops.backup_sentinel is empty — no backup record found';
    ELSIF v_backup_age > 26 THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := format('last backup %sh ago (file: %s) — exceeds 26h threshold', v_backup_age, v_backup_file);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := format('last backup %sh ago — file: %s', v_backup_age, v_backup_file);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'ops.backup_sentinel inaccessible: ' || SQLERRM;
  END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '1_backup_sentinel_freshness', v_status, v_detail);
  v_result := v_result || jsonb_build_object('1_backup_sentinel', jsonb_build_object('status', v_status, 'detail', v_detail));

  BEGIN
    SELECT EXISTS (SELECT 1 FROM evo.evolution_messages LIMIT 1) INTO v_row_exists;
    v_status := 'PASS'; v_pass := v_pass + 1;
    v_detail := 'evo.evolution_messages readable';
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'evo.evolution_messages inaccessible: ' || SQLERRM;
  END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '2_messages_wpp2_access', v_status, v_detail);
  v_result := v_result || jsonb_build_object('2_messages_wpp2', jsonb_build_object('status', v_status, 'detail', v_detail));

  BEGIN
    SELECT COUNT(*) INTO v_n FROM zapp.evolution_contacts WHERE deleted_at IS NULL;
    IF v_n < 1000 THEN
      v_status := 'WARN'; v_warn := v_warn + 1;
      v_detail := format('evolution_contacts has only %s active rows (expected ≥ 1000)', v_n);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := format('evolution_contacts: %s active rows', v_n);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'zapp.evolution_contacts inaccessible: ' || SQLERRM;
  END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '3_contacts_row_count', v_status, v_detail);
  v_result := v_result || jsonb_build_object('3_contacts', jsonb_build_object('status', v_status, 'detail', v_detail));

  -- FIX AG-EX-17: baseline DINÂMICO — partições NÃO-default (default vazia não conta),
  -- exigência ≥7 (mês atual + 6 futuros); default com linhas = WARN.
  BEGIN
    SELECT COUNT(*) INTO v_n FROM pg_class c
    WHERE c.relispartition = true
      AND c.relnamespace = 'evo'::regnamespace
      AND c.oid IN (
        SELECT inhrelid FROM pg_inherits
        WHERE inhparent = 'evo.evolution_webhook_events_v2'::regclass
      )
      AND c.relname NOT LIKE '%\_default';

    IF v_n < 7 THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := format('only %s non-default partitions found — expected ≥ 7 (mês atual + 6 futuros)', v_n);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := format('%s non-default partitions present (default ignorada no baseline)', v_n);
    END IF;

    -- Default vazia = saudável; default com linhas = dados fora do range (WARN)
    SELECT c.relname INTO v_default_part
    FROM pg_class c
    JOIN pg_inherits i ON i.inhrelid = c.oid
    WHERE i.inhparent = 'evo.evolution_webhook_events_v2'::regclass
      AND c.relname LIKE '%\_default'
    LIMIT 1;

    IF v_default_part IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM evo.%I', v_default_part) INTO v_default_rows;
      IF v_default_rows > 0 THEN
        v_status := 'WARN'; v_warn := v_warn + 1;
        v_detail := format('default partition %s has %s rows (dados fora do range de partições!)', v_default_part, v_default_rows);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'FAIL'; v_fail := v_fail + 1;
    v_detail := 'partition count check failed: ' || SQLERRM;
  END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '4_partition_count', v_status, v_detail);
  v_result := v_result || jsonb_build_object('4_partitions', jsonb_build_object('status', v_status, 'detail', v_detail));

  BEGIN
    SELECT COUNT(*) INTO v_n
    FROM pg_index ix JOIN pg_class c ON c.oid = ix.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'evo', 'zapp') AND NOT ix.indisvalid;
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
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '5_invalid_indexes', v_status, v_detail);
  v_result := v_result || jsonb_build_object('5_invalid_indexes', jsonb_build_object('status', v_status, 'detail', v_detail));

  BEGIN
    v_detail := ''; v_status := 'PASS';
    FOREACH v_fn_name IN ARRAY v_critical_functions LOOP
      SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname IN ('public', 'evo', 'zapp') AND p.proname = v_fn_name) INTO v_fn_exists;
      IF NOT v_fn_exists THEN v_status := 'FAIL'; v_detail := v_detail || v_fn_name || ' MISSING; '; END IF;
    END LOOP;
    IF v_status = 'PASS' THEN v_pass := v_pass + 1; v_detail := 'all 6 critical functions present: ' || array_to_string(v_critical_functions, ', ');
    ELSE v_fail := v_fail + 1; END IF;
  EXCEPTION WHEN OTHERS THEN v_status := 'FAIL'; v_fail := v_fail + 1; v_detail := 'critical function check failed: ' || SQLERRM; END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '6_critical_functions', v_status, v_detail);
  v_result := v_result || jsonb_build_object('6_critical_functions', jsonb_build_object('status', v_status, 'detail', v_detail));

  BEGIN
    SELECT COUNT(*) INTO v_n FROM information_schema.tables
    WHERE table_schema IN ('public', 'evo', 'zapp', 'archive', 'ops') AND table_type = 'BASE TABLE';
    IF v_n < 500 THEN
      v_status := 'FAIL'; v_fail := v_fail + 1;
      v_detail := format('only %s tables found — expected ≥ 500 (baseline: 681)', v_n);
    ELSE
      v_status := 'PASS'; v_pass := v_pass + 1;
      v_detail := format('%s tables present across public/evo/zapp/archive/ops', v_n);
    END IF;
  EXCEPTION WHEN OTHERS THEN v_status := 'FAIL'; v_fail := v_fail + 1; v_detail := 'table count check failed: ' || SQLERRM; END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail) VALUES (v_run_id, '7_table_count_sanity', v_status, v_detail);
  v_result := v_result || jsonb_build_object('7_table_count', jsonb_build_object('status', v_status, 'detail', v_detail));

  v_overall := CASE WHEN v_fail > 0 THEN 'FAIL' WHEN v_warn > 0 THEN 'WARN' ELSE 'PASS' END;
  INSERT INTO zapp.restore_test_log (run_id, step, status, detail)
  VALUES (v_run_id, 'SUMMARY', v_overall,
    format('pass=%s warn=%s fail=%s duration_ms=%s', v_pass, v_warn, v_fail,
           ROUND(EXTRACT(EPOCH FROM (now() - v_start)) * 1000)));

  IF v_overall = 'FAIL' THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts (alert_type, severity, title, details, created_at)
      VALUES ('restore_integrity_fail', 'critical',
        format('E9-05: fn_restore_integrity_check FAIL — %s check(s) failed. run_id=%s', v_fail, v_run_id),
        jsonb_build_object('run_id', v_run_id, 'pass', v_pass, 'warn', v_warn, 'fail', v_fail, 'detail', v_result),
        now());
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run_id, 'checked_at', v_start,
    'duration_ms', ROUND(EXTRACT(EPOCH FROM (now() - v_start)) * 1000),
    'overall', v_overall, 'pass', v_pass, 'warn', v_warn, 'fail', v_fail, 'checks', v_result
  );
END;
$function$;

-- Resolve os 6 alertas restore_integrity_fail abertos — TODOS falsos positivos
-- (único fail = 4_partitions, baseline defasado; pass=6 fail=1 em todos).
UPDATE zapp.webhook_health_alerts
SET resolved_at = now()
WHERE alert_type = 'restore_integrity_fail'
  AND resolved_at IS NULL
  AND (details->>'fail')::int = 1
  AND details->'detail'->'4_partitions'->>'status' = 'FAIL';
