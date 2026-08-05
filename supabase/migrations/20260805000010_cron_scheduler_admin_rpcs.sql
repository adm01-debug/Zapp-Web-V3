-- AUTOMACOES-12: Admin RPCs for pg_cron job management
-- Creates SECURITY DEFINER RPCs so authenticated users can list/toggle cron jobs
-- without needing direct access to the cron schema.

-- ── RPC: rpc_list_cron_jobs ───────────────────────────────────────────────────
-- Returns all pg_cron jobs visible in cron.job ordered by jobname.
CREATE OR REPLACE FUNCTION zapp.rpc_list_cron_jobs()
RETURNS TABLE(
  jobid   bigint,
  jobname text,
  schedule text,
  command text,
  active  bool
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = cron, zapp
AS $$
  SELECT
    jobid,
    jobname,
    schedule,
    command,
    active
  FROM cron.job
  ORDER BY jobname;
$$;

COMMENT ON FUNCTION zapp.rpc_list_cron_jobs() IS
  'Admin RPC — lista todos os jobs pg_cron. SECURITY DEFINER para acesso ao schema cron.';

GRANT EXECUTE ON FUNCTION zapp.rpc_list_cron_jobs() TO authenticated;

-- ── RPC: rpc_toggle_cron_job ──────────────────────────────────────────────────
-- Activates or deactivates a pg_cron job by jobname.
-- Only updates; does NOT unschedule/delete the job.
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
  'Admin RPC — ativa ou desativa um job pg_cron pelo nome. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION zapp.rpc_toggle_cron_job(text, bool) TO authenticated;
