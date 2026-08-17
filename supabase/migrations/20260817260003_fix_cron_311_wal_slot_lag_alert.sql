-- =============================================================================
-- FIX CRON 311 — wal_slot_lag_check (idempotente)
-- 2026-08-17 | audit 20260816 | SIM-4
--
-- PROBLEMA (A6 / CRON_FAILURES_7D §3.2): UPDATE em coluna gerada de
--   evolution_alerts -> ERROR: column "resolved" can only be updated to
--   DEFAULT — is a generated column (3 falhas 08-09). A coluna `resolved`
--   é GENERATED ALWAYS AS (resolved_at IS NOT NULL) STORED (conferido via
--   information_schema em prod, 17:47Z) e a DDL dela NÃO está no repo (A8).
--
-- ESTADO ATUAL EM PROD (17:47Z):
--   * Comando vivo do job 311: SELECT ops.fn_alert_wal_slot_drop() — função
--     NÃO versionada (só REVOKE em 20260808230300); runs succeeded 17:45Z.
--   * Tabela real: zapp.evolution_alerts (relkind 'r'); public.evolution_alerts
--     é view; evo.evolution_alerts NÃO existe (Lote 6 moveu para zapp).
--   * zapp.fn_wal_slot_lag_check(p_threshold_mb) já versionada (squash:5886)
--     — SELECT-only, SEM nome de slot hardcoded (pitfall cainophile_*).
--
-- ESTA MIGRATION:
--   1) versiona a DDL da coluna gerada (guard to_regclass — DB fresco A8);
--   2) cria zapp.fn_wal_slot_lag_alert(p_threshold_mb) — alerta/resolução de
--      WAL lag SEM nunca SET na coluna gerada (só resolved_at/resolved_by),
--      dedupe por slot, fonte = zapp.fn_wal_slot_lag_check versionada;
--   3) repoint idempotente do job 311 (padrão A — preserva jobid 311).
--   Re-run = UPDATE 0 (comando já no formato-alvo).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PASSO 1: DDL da coluna gerada (gap A8 — só existe em prod; guard p/ DB fresco)
-- Expressão conferida em prod: (resolved_at IS NOT NULL), STORED.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('zapp.evolution_alerts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE zapp.evolution_alerts ADD COLUMN IF NOT EXISTS resolved boolean GENERATED ALWAYS AS (resolved_at IS NOT NULL) STORED';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- PASSO 2: zapp.fn_wal_slot_lag_alert — SEM SET na coluna gerada
--   Comportamento espelhado da função viva ops.fn_alert_wal_slot_drop
--   (alert_type 'wal_slot_high_lag', dedupe 60min por slot, resolved_by),
--   porém: fonte versionada zapp.fn_wal_slot_lag_check (slot_type='logical',
--   sem prefixo cainophile hardcoded) e p_threshold_mb parametrizável.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_wal_slot_lag_alert(p_threshold_mb integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'pg_catalog'
AS $function$
DECLARE
  r          record;
  v_checked  int := 0;
  v_open     int := 0;
  v_resolved int := 0;
  v_rows     int;
BEGIN
  FOR r IN
    SELECT slot_name, lag_mb, is_active
    FROM zapp.fn_wal_slot_lag_check(p_threshold_mb)
    ORDER BY lag_mb DESC NULLS LAST
  LOOP
    v_checked := v_checked + 1;

    IF r.lag_mb > p_threshold_mb THEN
      -- Alerta aberto (dedupe: não empilha se já há alerta aberto p/ o slot < 60min)
      INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
      SELECT 'wal_slot_high_lag', 'high',
        format('[WAL-ALERTA] Slot %s retendo %s MB', r.slot_name, round(r.lag_mb, 1)),
        format('Cainophile/Logflare retendo %s MB de WAL. Consumer ativo=%s. Limiar=%s MB. Acao: reiniciar supabase_analytics se nao reduzir em 15min.',
               round(r.lag_mb, 1), r.is_active, p_threshold_mb),
        jsonb_build_object(
          'slot', r.slot_name, 'lag_mb', r.lag_mb, 'active', r.is_active,
          'threshold_alert_mb', p_threshold_mb, 'checked_at', now())
      WHERE NOT EXISTS (
        SELECT 1 FROM zapp.evolution_alerts
        WHERE alert_type = 'wal_slot_high_lag'
          AND resolved_at IS NULL
          AND (payload->>'slot') = r.slot_name
          AND created_at >= now() - INTERVAL '60 minutes'
      );
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_open := v_open + v_rows;
    ELSE
      -- Resolução SÓ via colunas base (resolved_at/resolved_by) — NUNCA SET resolved
      UPDATE zapp.evolution_alerts
      SET resolved_at = now(),
          resolved_by = 'fn_wal_slot_lag_alert:recovered'
      WHERE alert_type IN ('wal_slot_high_lag', 'wal_slot_lag')
        AND resolved_at IS NULL
        AND (payload->>'slot') = r.slot_name;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_resolved := v_resolved + v_rows;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'slots_verificados', v_checked,
    'alertas_abertos', v_open,
    'resolvidos', v_resolved,
    'threshold_mb', p_threshold_mb
  );
END $function$;

REVOKE EXECUTE ON FUNCTION zapp.fn_wal_slot_lag_alert(integer) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- PASSO 3: repoint idempotente (padrão A — preserva jobid 311)
--   Em prod o comando vivo é SELECT ops.fn_alert_wal_slot_drop() (não
--   versionada) -> o UPDATE reponta para a função versionada; re-run = UPDATE 0.
-- ---------------------------------------------------------------------------
UPDATE cron.job
SET command = 'SELECT zapp.fn_wal_slot_lag_alert(200)'
WHERE jobid = 311
  AND command NOT LIKE '%fn_wal_slot_lag_alert%';
