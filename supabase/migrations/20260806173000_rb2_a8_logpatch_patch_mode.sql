-- migration: 20260806173000_rb2_a8_logpatch_patch_mode.sql
-- A-8 DATA QUALITY: adiciona coluna patch_mode à evolution_logpatch_audit
-- e corrige semântica dos campos t1_ok–t5_ok no modo build-time.
--
-- Contexto:
--   Os patches T1–T6 são aplicados em BUILD-TIME (Dockerfile VERIFY fail-closed).
--   No modo build-time, t1_ok–t5_ok nunca são marcados true porque a verificação
--   é feita na etapa VERIFY do Dockerfile, não em runtime. Os valores false eram
--   incorretamente interpretados como "patches ausentes".
--
-- Fix:
--   1. Adicionar coluna `patch_mode TEXT` com default 'build-time'
--   2. Atualizar registros existentes para patch_mode='build-time'
--   3. Vista v_logpatch_health atualizada para distinguir modos

-- Coluna patch_mode
ALTER TABLE evo.evolution_logpatch_audit
  ADD COLUMN IF NOT EXISTS patch_mode TEXT NOT NULL DEFAULT 'build-time'
  CHECK (patch_mode IN ('build-time', 'runtime', 'unknown'));

COMMENT ON COLUMN evo.evolution_logpatch_audit.patch_mode IS
  'Modo de aplicação dos patches: build-time (Dockerfile VERIFY) ou runtime (logpatch.cjs). '
  'Quando build-time, os campos t1_ok–t5_ok são semanticamente N/A (sempre false por design).';

COMMENT ON COLUMN evo.evolution_logpatch_audit.t1_ok IS
  'Runtime check do patch T1. Válido apenas quando patch_mode=runtime; sempre false em build-time (N/A por design).';
COMMENT ON COLUMN evo.evolution_logpatch_audit.t2_ok IS
  'Runtime check do patch T2. Válido apenas quando patch_mode=runtime; sempre false em build-time (N/A por design).';
COMMENT ON COLUMN evo.evolution_logpatch_audit.t3_ok IS
  'Runtime check do patch T3. Válido apenas quando patch_mode=runtime; sempre false em build-time (N/A por design).';
COMMENT ON COLUMN evo.evolution_logpatch_audit.t4_ok IS
  'Runtime check do patch T4. Válido apenas quando patch_mode=runtime; sempre false em build-time (N/A por design).';
COMMENT ON COLUMN evo.evolution_logpatch_audit.t5_ok IS
  'Runtime check do patch T5. Válido apenas quando patch_mode=runtime; sempre false em build-time (N/A por design).';

COMMENT ON COLUMN evo.evolution_logpatch_audit.image_digest IS
  'OCI digest da imagem (sha256:...). Populado via env OCI_DIGEST no docker-compose/stack. '
  'Vazio quando não configurado no deploy.';

-- Atualizar registros existentes: todos são build-time
UPDATE evo.evolution_logpatch_audit
SET patch_mode = 'build-time'
WHERE patch_mode IS DISTINCT FROM 'build-time';

-- View de saúde: considera o patch_mode para determinar healthiness
-- security_invoker=on garante que a view herda as permissões do caller (sem escalada de privilégios)
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
      -- Em build-time, a verificação é o VERIFY no Dockerfile (sempre true se chegou aqui)
      logpatch_status = 'ok'
    WHEN patch_mode = 'runtime' THEN
      -- Em runtime, todos os patches devem estar ok
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
  'Em build-time, t1_ok–t5_ok são N/A e is_healthy baseia-se apenas em logpatch_status=ok.';
