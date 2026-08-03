-- 20260803_deprecate_lovable_parity_functions
-- Remove referências Lovable Cloud em funções operacionais ops/evo.
--
-- Decisão baseada em análise de dependências (2026-08-03):
--   * ops.check_lovable_parity(boolean) — ATIVA: chamada por ops.run_all_checks()
--     ← cron 106 run_all_checks_daily (07:00, 24 rows/dia, status succeeded).
--     Mantida FUNCIONAL (monitoramento não pode quebrar); descrição atualizada e
--     criado wrapper com nome neutro: ops.check_schema_parity() → delega a ela.
--   * ops.run_all_checks() — ATIVA (cron 106). Corpo NÃO modificado; apenas COMMENT.
--   * evo.fn_update_instance_health() — ATIVA (cron 172 evo-instance-health-check,
--     */10min, status succeeded). Única ref Lovable era o comentário no corpo
--     ("architecture post-lovable-cloud"); reescrita com corpo IDÊNTICO, comentário
--     neutro. Sem dependências via pg_depend (nenhuma view/rule depende das 3).

-- 1) ops.check_lovable_parity — mantida (monitoramento ativo); atualizar descrição
COMMENT ON FUNCTION ops.check_lovable_parity(p_raise boolean) IS
'DEPRECATED (2026-08-03). Mantida porque ops.run_all_checks() (cron 106 run_all_checks_daily, 07:00) ainda a invoca. Valida objetos SQL da paridade Lovable-era (F1/F3) + crons críticos + pg_statistic health; DRIFT → alerta em zapp.webhook_health_alerts. Novo nome neutro: ops.check_schema_parity() (wrapper que delega a esta).';

-- 2) Novo wrapper com nome atualizado (sem "lovable") — delega à função antiga
CREATE OR REPLACE FUNCTION ops.check_schema_parity(p_raise boolean DEFAULT false)
RETURNS ops.schema_drift_log
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'ops', 'pg_catalog'
AS $fn$
  SELECT ops.check_lovable_parity(p_raise);
$fn$;

COMMENT ON FUNCTION ops.check_schema_parity(p_raise boolean) IS
'Wrapper (2026-08-03) que delega a ops.check_lovable_parity() — mantida para o cron 106 via ops.run_all_checks(). Nome neutro (sem "lovable") para migração futura.';

-- Mesmos grants da função antiga (postgres/service_role/supabase_admin; sem PUBLIC)
REVOKE EXECUTE ON FUNCTION ops.check_schema_parity(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.check_schema_parity(boolean) TO service_role, supabase_admin;

-- 3) ops.run_all_checks — corpo INTOCADO; apenas comentário
COMMENT ON FUNCTION ops.run_all_checks() IS
'Agregador de checks operacionais (cron 106 run_all_checks_daily, 07:00; 24 checks). Inclui lovable_parity via ops.check_lovable_parity() — deprecated mas mantida (ver ops.check_schema_parity). Corpo não modificado em 2026-08-03.';

-- 4) evo.fn_update_instance_health — reescrita com corpo IDÊNTICO; apenas o
--    comentário "architecture post-lovable-cloud" trocado por texto neutro.
CREATE OR REPLACE FUNCTION evo.fn_update_instance_health()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $fn$
DECLARE
  v_gap numeric; v_msgs_1h int; v_status text;
  v_dow int := EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo');
  v_is_fds boolean := v_dow IN (0,6);
  v_gap_healthy int := 10;   -- gap < 10min = healthy sempre
  v_gap_degraded int;        -- gap < X = degraded (vs unhealthy)
BEGIN
  -- Fonte canonica: evo.evolution_messages (arquitetura pos-migracao self-hosted)
  SELECT
    ROUND(EXTRACT(EPOCH FROM (now()-MAX(created_at)))/60, 1),
    COUNT(*) FILTER (WHERE created_at > now()-INTERVAL '1h')
  INTO v_gap, v_msgs_1h
  FROM evo.evolution_messages;

  -- FIX v2: threshold adaptativo por dia da semana
  -- FDS (sab/dom): empresa B2B — normal ter gap>30min entre msgs
  -- Dia util: gap>30min ja e suspeito
  v_gap_degraded := CASE WHEN v_is_fds THEN 120 ELSE 30 END;

  v_status := CASE
    WHEN v_msgs_1h > 0 AND v_gap < v_gap_healthy THEN 'healthy'
    WHEN v_gap < v_gap_degraded                   THEN 'degraded'
    WHEN v_is_fds AND v_msgs_1h > 0              THEN 'degraded'  -- FDS: msgs existem mas gap longo = degraded (nao unhealthy)
    ELSE 'unhealthy'
  END;

  UPDATE evo.evolution_instance_credentials
  SET health_status     = v_status,
      last_health_check = NOW(),
      online_instances  = CASE WHEN v_status IN ('healthy','degraded') THEN 1 ELSE 0 END,
      notes             = FORMAT('gap=%smin msgs1h=%s auto-check=%s src=evolution_messages fds=%s gap_thr=%s',
                            v_gap, v_msgs_1h, NOW()::text, v_is_fds, v_gap_degraded)
  WHERE instance_name = 'wpp2';
END;
$fn$;

COMMENT ON FUNCTION evo.fn_update_instance_health() IS
'Atualiza health_status de wpp2 (cron 172 evo-instance-health-check, */10min). Threshold adaptativo FDS (sab/dom). Sem referencias Lovable desde 2026-08-03.';
