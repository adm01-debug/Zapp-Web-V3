-- AUTOMACOES-12: Admin RPCs for pg_cron job management
-- Creates SECURITY DEFINER RPCs so authenticated users can list/toggle cron jobs
-- without needing direct access to the cron schema.

-- ── RPC: rpc_list_cron_jobs ───────────────────────────────────────────────────
-- Returns all pg_cron jobs visible in cron.job ordered by jobname.
-- Admin-only: exposes command text which may contain internal URLs.
CREATE OR REPLACE FUNCTION zapp.rpc_list_cron_jobs()
RETURNS TABLE(
  jobid   bigint,
  jobname text,
  schedule text,
  command text,
  active  bool
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cron, zapp
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Acesso negado: apenas admins e supervisores podem listar cron jobs'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    j.jobid,
    j.jobname,
    j.schedule,
    j.command,
    j.active
  FROM cron.job j
  ORDER BY j.jobname;
END;
$$;

COMMENT ON FUNCTION zapp.rpc_list_cron_jobs() IS
  'Admin RPC — lista todos os jobs pg_cron (somente admins/supervisores). SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION zapp.rpc_list_cron_jobs() TO authenticated;

-- ── RPC: rpc_toggle_cron_job ──────────────────────────────────────────────────
-- Activates or deactivates a pg_cron job by jobname.
-- Admin-only: prevents agents from pausing critical system cron jobs.
CREATE OR REPLACE FUNCTION zapp.rpc_toggle_cron_job(
  p_jobname text,
  p_active  bool
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cron, zapp
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Acesso negado: apenas admins e supervisores podem ativar/desativar cron jobs'
      USING ERRCODE = '42501';
  END IF;

  UPDATE cron.job
  SET active = p_active
  WHERE jobname = p_jobname;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cron job % not found', p_jobname
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION zapp.rpc_toggle_cron_job(text, bool) IS
  'Admin RPC — ativa ou desativa um job pg_cron (somente admins/supervisores). SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION zapp.rpc_toggle_cron_job(text, bool) TO authenticated;
