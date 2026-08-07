-- VALD2 2026-08-07: espelho de zapp.fn_drop_logflare_slot — a migration
-- 20260807145000_ag04_arq11_searchpath_outliers.sql fazia ALTER FUNCTION numa
-- função que existia NO DB (DDL não-versionado) mas nunca teve CREATE no repo
-- → check:febesync [C] órfão + quebra de 'supabase db reset'.
-- Corpo extraído do pg_proc real (SECURITY DEFINER, search_path 'zapp, pg_temp').
-- Idempotente: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION zapp.fn_drop_logflare_slot()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'zapp, pg_temp'
AS $$
DECLARE
  v_pid int;
  v_lag_mb numeric;
  v_slot_active boolean;
  v_attempts int := 0;
BEGIN
  -- Verificar lag
  SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)/1048576, active
  INTO v_lag_mb, v_slot_active
  FROM pg_replication_slots 
  WHERE slot_name = 'cainophile_nwl2ry0m';
  
  IF v_lag_mb IS NULL THEN
    RETURN 'Slot já foi dropado';
  END IF;
  
  -- Encontrar PID
  SELECT pa.pid INTO v_pid
  FROM pg_stat_activity pa
  WHERE pa.query LIKE '%cainophile%' AND pa.pid != pg_backend_pid()
  LIMIT 1;
  
  -- Terminar backend (SECURITY DEFINER como postgres)
  IF v_pid IS NOT NULL THEN
    PERFORM pg_terminate_backend(v_pid);
    -- Polling: esperar slot ficar inativo
    LOOP
      PERFORM pg_sleep(0.5);
      v_attempts := v_attempts + 1;
      SELECT active INTO v_slot_active FROM pg_replication_slots WHERE slot_name = 'cainophile_nwl2ry0m';
      EXIT WHEN v_slot_active = false OR v_attempts > 10;
    END LOOP;
  END IF;
  
  -- Tentar dropar
  SELECT active INTO v_slot_active FROM pg_replication_slots WHERE slot_name = 'cainophile_nwl2ry0m';
  IF v_slot_active THEN
    RETURN format('FALHA: slot ainda ativo após %s tentativas (lag: %s MB)', v_attempts, round(v_lag_mb,1));
  END IF;
  
  PERFORM pg_drop_replication_slot('cainophile_nwl2ry0m');
  RETURN format('SUCESSO: Slot dropado. WAL liberado: %s MB', round(v_lag_mb, 1));
EXCEPTION
  WHEN OTHERS THEN
    RETURN format('ERRO: %s', SQLERRM);
END;
$$;

-- Rollback: DROP FUNCTION zapp.fn_drop_logflare_slot(); (NÃO executar — produção usa)
