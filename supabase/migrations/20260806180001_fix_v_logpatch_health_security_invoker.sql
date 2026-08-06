-- migration: 20260806180000_fix_v_logpatch_health_security_invoker.sql
-- FIX: adiciona security_invoker=on à view evo.v_logpatch_health
--
-- A view foi criada em 20260806173000 sem WITH (security_invoker=on),
-- o que a excluía do gate CI "Verify security_invoker on all views".
-- Esta migration recria a view com a opção correta (CREATE OR REPLACE é idempotente).

CREATE OR REPLACE VIEW evo.v_logpatch_health
WITH (security_invoker = on)
AS
SELECT
  id,
  instance_name,
  patch_mode,
  booted_at,
  evolution_version,
  image_digest,
  logpatch_status,
  logpatch_detail,
  CASE
    WHEN patch_mode = 'build-time' THEN
      logpatch_status = 'ok'
    WHEN patch_mode = 'runtime' THEN
      (t1_ok AND t2_ok AND t3_ok AND t4_ok AND t5_ok AND logpatch_status = 'ok')
    ELSE false
  END AS is_healthy,
  CASE
    WHEN patch_mode = 'build-time' THEN 'N/A (build-time mode — Dockerfile VERIFY garante patches)'
    WHEN (t1_ok AND t2_ok AND t3_ok AND t4_ok AND t5_ok) THEN 'Todos os 5 patches ok'
    ELSE format('Patches falhos: %s',
      string_agg(patch_name, ', ')
      FILTER (WHERE NOT patch_ok)
    )
  END AS patch_summary
FROM evo.evolution_logpatch_audit
CROSS JOIN LATERAL (
  VALUES
    ('T1', t1_ok), ('T2', t2_ok), ('T3', t3_ok),
    ('T4', t4_ok), ('T5', t5_ok)
) AS patches(patch_name, patch_ok)
GROUP BY
  id, instance_name, patch_mode, booted_at, evolution_version,
  image_digest, logpatch_status, logpatch_detail, t1_ok, t2_ok, t3_ok, t4_ok, t5_ok;

COMMENT ON VIEW evo.v_logpatch_health IS
  'View de saúde dos boots com interpretação correta de patch_mode. '
  'Em build-time, t1_ok–t5_ok são N/A e is_healthy baseia-se apenas em logpatch_status=ok. '
  'security_invoker=on: permissões do caller, sem escalada.';
