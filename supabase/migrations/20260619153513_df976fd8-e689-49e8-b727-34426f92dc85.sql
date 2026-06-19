
CREATE INDEX IF NOT EXISTS idx_query_telemetry_created_at
  ON public.query_telemetry (created_at DESC);

CREATE OR REPLACE FUNCTION public.purge_old_query_telemetry(p_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.query_telemetry
   WHERE created_at < now() - (p_days || ' days')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_query_telemetry(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_query_telemetry(integer) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge_query_telemetry_daily')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'purge_query_telemetry_daily'
      );
    PERFORM cron.schedule(
      'purge_query_telemetry_daily',
      '0 3 * * *',
      $cron$ SELECT public.purge_old_query_telemetry(30); $cron$
    );
  END IF;
END $$;
