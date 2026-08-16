-- E86 / decisao Opcao A (2026-08-16): cria os 8 objetos ops.* de observabilidade
-- que estavam em PLANNED_OBJECTS do sql-gate (fantasmas do registry).
-- Instrumentacao para a fase I4/E73-E77 (mover tabelas evolution_* para evo):
--   - ops.pgnet_egress_log + ops.log_pgnet_call: trilha de egresso pg_net (E8)
--   - ops.i4_violation_baseline + ops.v_i4_violations_summary +
--     ops.v_i4_correction_progress: baseline e progresso das 147 refs fisicas
--     (regex identica ao aux da ops.fn_boundary_audit)
--   - ops.decouple_preflight_runs + ops.fn_decouple_preflight +
--     ops.v_preflight_history: preflight que inclui deteccao de cron apontando
--     para fn inexistente (teria pego a quebra do auto_resolve_alerts de hoje).
--     Matches que sao RELATION (nao function) sao excluidos (ex.: DELETE FROM
--     zapp.fn_health_score_history, que e tabela).
-- JA APLICADA em producao 2026-08-16 (registro 20260816250001). Baseline I4
-- populado com o estado do momento. Primeiro preflight rodado (ok=false por
-- falhas pre-fix do auto_resolve_alerts na janela de 1h - limpa sozinho).
-- NOTA para o merge da branch do Agente 2: mover as 8 entradas
-- PLANNED_OBJECTS -> PROD_OBJECTS_REGISTRY no sql-gate.mjs + fixture.

CREATE TABLE IF NOT EXISTS ops.pgnet_egress_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  called_at timestamptz NOT NULL DEFAULT now(),
  caller text NOT NULL,
  url text NOT NULL,
  method text NOT NULL DEFAULT 'POST',
  via_gateway boolean NOT NULL DEFAULT false,
  note text
);
CREATE INDEX IF NOT EXISTS idx_pgnet_egress_log_called_at ON ops.pgnet_egress_log (called_at);

CREATE OR REPLACE FUNCTION ops.log_pgnet_call(p_caller text, p_url text, p_method text DEFAULT 'POST', p_via_gateway boolean DEFAULT false, p_note text DEFAULT NULL)
RETURNS bigint LANGUAGE sql SECURITY DEFINER
SET search_path = ops, pg_catalog, pg_temp
AS $$
  INSERT INTO ops.pgnet_egress_log (caller, url, method, via_gateway, note)
  VALUES (p_caller, p_url, p_method, p_via_gateway, p_note) RETURNING id;
$$;
REVOKE ALL ON FUNCTION ops.log_pgnet_call(text,text,text,boolean,text) FROM PUBLIC;

CREATE TABLE IF NOT EXISTS ops.i4_violation_baseline (
  measured_at timestamptz NOT NULL DEFAULT now(),
  fn_schema text NOT NULL,
  fn_name text NOT NULL,
  n_refs int NOT NULL,
  PRIMARY KEY (measured_at, fn_schema, fn_name)
);

CREATE OR REPLACE VIEW ops.v_i4_violations_summary AS
SELECT n.nspname AS fn_schema, p.proname AS fn_name,
       (SELECT count(*) FROM regexp_matches(p.prosrc, 'zapp\.evolution_(messages|contacts|conversations)', 'g')) AS n_refs
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND p.prosrc ~ 'zapp\.evolution_(messages|contacts|conversations)';

CREATE OR REPLACE VIEW ops.v_i4_correction_progress AS
WITH baseline AS (
  SELECT count(*) AS fns, coalesce(sum(n_refs),0) AS refs
  FROM ops.i4_violation_baseline
  WHERE measured_at = (SELECT max(measured_at) FROM ops.i4_violation_baseline)
),
atual AS (SELECT count(*) AS fns, coalesce(sum(n_refs),0) AS refs FROM ops.v_i4_violations_summary)
SELECT b.fns AS baseline_fns, a.fns AS atual_fns, b.fns - a.fns AS fns_corrigidas,
       b.refs AS baseline_refs, a.refs AS atual_refs, b.refs - a.refs AS refs_corrigidas
FROM baseline b, atual a;

INSERT INTO ops.i4_violation_baseline (fn_schema, fn_name, n_refs)
SELECT fn_schema, fn_name, sum(n_refs) FROM ops.v_i4_violations_summary
GROUP BY fn_schema, fn_name
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS ops.decouple_preflight_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  checks jsonb NOT NULL
);

CREATE OR REPLACE FUNCTION ops.fn_decouple_preflight()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog, pg_temp
AS $$
DECLARE
  v_boundary jsonb;
  v_broken_crons jsonb;
  v_failed_runs_1h int;
  v_ok boolean;
  v_checks jsonb;
BEGIN
  v_boundary := ops.fn_boundary_audit();
  SELECT coalesce(jsonb_agg(jsonb_build_object('job', jobname, 'fn', fn_ref)), '[]'::jsonb)
  INTO v_broken_crons
  FROM (
    SELECT DISTINCT j.jobname, m[1] || '.' || m[2] AS fn_ref
    FROM cron.job j,
    LATERAL regexp_matches(j.command, '(evo|zapp|public|ops)\.(fn_[a-z_0-9]+|pr_[a-z_0-9]+|rpc_[a-z_0-9]+)', 'g') m
    WHERE j.active
      AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                      WHERE n.nspname = m[1] AND p.proname = m[2])
      AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                      WHERE n.nspname = m[1] AND c.relname = m[2])
  ) x;
  SELECT count(*) INTO v_failed_runs_1h
  FROM cron.job_run_details WHERE status='failed' AND start_time > now() - interval '1 hour';

  v_ok := (v_broken_crons = '[]'::jsonb) AND v_failed_runs_1h = 0;
  v_checks := jsonb_build_object('boundary', v_boundary, 'crons_quebrados', v_broken_crons,
                                 'cron_failures_1h', v_failed_runs_1h);
  INSERT INTO ops.decouple_preflight_runs (ok, checks) VALUES (v_ok, v_checks);
  RETURN jsonb_build_object('ok', v_ok) || v_checks;
END;
$$;
REVOKE ALL ON FUNCTION ops.fn_decouple_preflight() FROM PUBLIC;

CREATE OR REPLACE VIEW ops.v_preflight_history AS
SELECT id, run_at, ok, checks->'cron_failures_1h' AS cron_failures_1h,
       jsonb_array_length(checks->'crons_quebrados') AS n_crons_quebrados
FROM ops.decouple_preflight_runs ORDER BY run_at DESC;
