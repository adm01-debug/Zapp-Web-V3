-- =============================================================================
-- E10 — Pre-Flight Checklist (Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: criar função SQL que executa verificações pré-deploy para garantir
-- que qualquer migration do processo de desacoplamento pode ser aplicada com
-- segurança. Permite bloquear deploys se condições críticas não forem atendidas.
-- =============================================================================

-- Tabela de registro de execuções do checklist
CREATE TABLE IF NOT EXISTS ops.decouple_preflight_runs (
  id              BIGSERIAL PRIMARY KEY,
  run_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_by          TEXT,
  target_etapa    TEXT,  -- ex: 'E25', 'E40', etc.
  result          TEXT NOT NULL CHECK (result IN ('PASS', 'FAIL', 'WARN')),
  checks_passed   INT NOT NULL DEFAULT 0,
  checks_failed   INT NOT NULL DEFAULT 0,
  checks_warned   INT NOT NULL DEFAULT 0,
  details         JSONB,
  notes           TEXT
);

COMMENT ON TABLE ops.decouple_preflight_runs IS
  'Histórico de execuções do pre-flight checklist de desacoplamento. '
  'Criado em E10 (2026-08-15).';

-- Função principal: executa todos os checks e retorna resultado
CREATE OR REPLACE FUNCTION ops.fn_decouple_preflight(
  p_target_etapa TEXT DEFAULT NULL,
  p_run_by TEXT DEFAULT SESSION_USER
)
RETURNS TABLE (
  check_name    TEXT,
  status        TEXT,
  detail        TEXT,
  blocking      BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, zapp, evo, public
AS $$
DECLARE
  v_count INT;
  v_lag INTERVAL;
  v_passed INT := 0;
  v_failed INT := 0;
  v_warned INT := 0;
  v_result TEXT;
  v_details JSONB := '{}'::JSONB;
BEGIN

  -- CHECK 1: webhook_audit_log recebendo eventos (ingestão ativa)
  SELECT COUNT(*) INTO v_count
  FROM zapp.webhook_audit_log
  WHERE created_at > NOW() - INTERVAL '10 minutes';

  IF v_count > 0 THEN
    v_passed := v_passed + 1;
    RETURN QUERY SELECT
      'webhook_ingestao_ativa'::TEXT,
      'PASS'::TEXT,
      FORMAT('webhook_audit_log: %s eventos nos últimos 10min', v_count),
      FALSE;
  ELSE
    v_warned := v_warned + 1;
    RETURN QUERY SELECT
      'webhook_ingestao_ativa'::TEXT,
      'WARN'::TEXT,
      'Nenhum evento em webhook_audit_log nos últimos 10min — verificar se ingestão está pausada',
      FALSE;
  END IF;

  -- CHECK 2: lag de mensagens aceitável (< 5 minutos)
  SELECT NOW() - MAX(created_at) INTO v_lag
  FROM evo.evolution_messages;

  IF v_lag IS NULL OR v_lag < INTERVAL '5 minutes' THEN
    v_passed := v_passed + 1;
    RETURN QUERY SELECT
      'lag_mensagens'::TEXT,
      'PASS'::TEXT,
      FORMAT('Última mensagem há %s', COALESCE(v_lag::TEXT, 'N/A (tabela vazia?)')),
      FALSE;
  ELSIF v_lag < INTERVAL '30 minutes' THEN
    v_warned := v_warned + 1;
    RETURN QUERY SELECT
      'lag_mensagens'::TEXT,
      'WARN'::TEXT,
      FORMAT('Lag de %s — monitorar', v_lag),
      FALSE;
  ELSE
    v_failed := v_failed + 1;
    RETURN QUERY SELECT
      'lag_mensagens'::TEXT,
      'FAIL'::TEXT,
      FORMAT('Lag crítico de %s — NÃO prosseguir sem investigar', v_lag),
      TRUE;
  END IF;

  -- CHECK 3: ops.fn_evo_url() funcionando
  DECLARE v_evo_url TEXT;
  BEGIN
    v_evo_url := ops.fn_evo_url();
    IF v_evo_url IS NOT NULL AND length(v_evo_url) > 5 THEN
      v_passed := v_passed + 1;
      RETURN QUERY SELECT
        'fn_evo_url_ok'::TEXT,
        'PASS'::TEXT,
        'ops.fn_evo_url() retorna URL válida',
        FALSE;
    ELSE
      v_failed := v_failed + 1;
      RETURN QUERY SELECT
        'fn_evo_url_ok'::TEXT,
        'FAIL'::TEXT,
        'ops.fn_evo_url() retornou NULL ou string curta — verificar vault',
        TRUE;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed + 1;
    RETURN QUERY SELECT
      'fn_evo_url_ok'::TEXT,
      'FAIL'::TEXT,
      FORMAT('ops.fn_evo_url() lançou erro: %s', SQLERRM),
      TRUE;
  END;

  -- CHECK 4: ops.fn_evo_key() funcionando
  DECLARE v_evo_key TEXT;
  BEGIN
    v_evo_key := ops.fn_evo_key();
    IF v_evo_key IS NOT NULL AND length(v_evo_key) > 5 THEN
      v_passed := v_passed + 1;
      RETURN QUERY SELECT
        'fn_evo_key_ok'::TEXT,
        'PASS'::TEXT,
        'ops.fn_evo_key() retorna key válida',
        FALSE;
    ELSE
      v_failed := v_failed + 1;
      RETURN QUERY SELECT
        'fn_evo_key_ok'::TEXT,
        'FAIL'::TEXT,
        'ops.fn_evo_key() retornou NULL ou string curta — verificar vault',
        TRUE;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed + 1;
    RETURN QUERY SELECT
      'fn_evo_key_ok'::TEXT,
      'FAIL'::TEXT,
      FORMAT('ops.fn_evo_key() lançou erro: %s', SQLERRM),
      TRUE;
  END;

  -- CHECK 5: Sem locks bloqueando schemas evo/zapp
  SELECT COUNT(*) INTO v_count
  FROM pg_locks l
  JOIN pg_stat_activity a ON l.pid = a.pid
  WHERE l.granted = FALSE
    AND a.query ILIKE ANY(ARRAY['%evo.%', '%zapp.%']);

  IF v_count = 0 THEN
    v_passed := v_passed + 1;
    RETURN QUERY SELECT
      'sem_locks_bloqueantes'::TEXT,
      'PASS'::TEXT,
      'Nenhum lock bloqueante nos schemas evo/zapp',
      FALSE;
  ELSE
    v_failed := v_failed + 1;
    RETURN QUERY SELECT
      'sem_locks_bloqueantes'::TEXT,
      'FAIL'::TEXT,
      FORMAT('%s locks bloqueantes detectados — aguardar resolução antes de aplicar migration', v_count),
      TRUE;
  END IF;

  -- CHECK 6: i4_violation_baseline existe e tem registros
  SELECT COUNT(*) INTO v_count
  FROM ops.i4_violation_baseline
  WHERE resolved_date IS NULL
    AND schema_name != 'ops';

  v_passed := v_passed + 1;
  RETURN QUERY SELECT
    'i4_violations_pendentes'::TEXT,
    CASE WHEN v_count = 0 THEN 'PASS' ELSE 'WARN' END,
    FORMAT('%s violações I4 pendentes de correção', v_count),
    FALSE;

  IF v_count = 0 THEN
    v_passed := v_passed + 1;
  ELSE
    v_warned := v_warned + 1;
  END IF;

  -- CHECK 7: Cron jobs ativos sem erros recentes
  SELECT COUNT(*) INTO v_count
  FROM cron.job
  WHERE active = TRUE
    AND last_error IS NOT NULL
    AND last_run > NOW() - INTERVAL '1 hour';

  IF v_count = 0 THEN
    v_passed := v_passed + 1;
    RETURN QUERY SELECT
      'cron_sem_erros_recentes'::TEXT,
      'PASS'::TEXT,
      'Nenhum cron job com erro na última hora',
      FALSE;
  ELSE
    v_warned := v_warned + 1;
    RETURN QUERY SELECT
      'cron_sem_erros_recentes'::TEXT,
      'WARN'::TEXT,
      FORMAT('%s cron jobs com erro na última hora — verificar antes de prosseguir', v_count),
      FALSE;
  END IF;

  -- CHECK 8: Score de boundary (via baseline offline)
  -- Verificar se BOUNDARY_SCORE arquivo existe (não podemos executar boundary-audit.mjs aqui,
  -- mas podemos checar se a tabela de baseline existe e tem dados)
  SELECT COUNT(*) INTO v_count
  FROM ops.i4_violation_baseline;

  IF v_count > 0 THEN
    v_passed := v_passed + 1;
    RETURN QUERY SELECT
      'baseline_i4_presente'::TEXT,
      'PASS'::TEXT,
      FORMAT('ops.i4_violation_baseline tem %s registros', v_count),
      FALSE;
  ELSE
    v_warned := v_warned + 1;
    RETURN QUERY SELECT
      'baseline_i4_presente'::TEXT,
      'WARN'::TEXT,
      'ops.i4_violation_baseline vazia — E8 pode não ter sido aplicado',
      FALSE;
  END IF;

  -- Salvar resultado no histórico
  v_result := CASE
    WHEN v_failed > 0 THEN 'FAIL'
    WHEN v_warned > 0 THEN 'WARN'
    ELSE 'PASS'
  END;

  INSERT INTO ops.decouple_preflight_runs (
    run_by, target_etapa, result, checks_passed, checks_failed, checks_warned
  ) VALUES (
    p_run_by, p_target_etapa, v_result, v_passed, v_failed, v_warned
  );

END;
$$;

COMMENT ON FUNCTION ops.fn_decouple_preflight IS
  'Executa checklist pré-deploy do desacoplamento ZAPP×Evolution. '
  'Retorna tabela de checks com status PASS/FAIL/WARN e flag blocking. '
  'Uso: SELECT * FROM ops.fn_decouple_preflight(''E25'');';

-- View de histórico de runs
CREATE OR REPLACE VIEW ops.v_preflight_history AS
SELECT
  id,
  run_at,
  run_by,
  target_etapa,
  result,
  checks_passed,
  checks_failed,
  checks_warned,
  notes
FROM ops.decouple_preflight_runs
ORDER BY run_at DESC;

-- Permissões
GRANT SELECT ON ops.decouple_preflight_runs TO authenticated;
GRANT SELECT ON ops.v_preflight_history TO authenticated;
GRANT EXECUTE ON FUNCTION ops.fn_decouple_preflight TO authenticated;
