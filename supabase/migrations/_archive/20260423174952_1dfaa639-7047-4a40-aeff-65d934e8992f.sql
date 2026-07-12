-- Função de cleanup da DLQ: remove succeeded/abandoned com mais de 30 dias
CREATE OR REPLACE FUNCTION public.cleanup_failed_messages()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - interval '30 days';
  v_deleted_count integer := 0;
BEGIN
  -- Apenas service_role (cron) ou admin pode executar
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin role or service_role required';
  END IF;

  WITH deleted AS (
    DELETE FROM public.failed_messages
    WHERE status IN ('succeeded', 'abandoned')
      AND COALESCE(succeeded_at, last_attempt_at, created_at) < v_cutoff
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_count FROM deleted;

  RETURN jsonb_build_object(
    'deleted_count', v_deleted_count,
    'cutoff', v_cutoff,
    'executed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_failed_messages() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_failed_messages() TO authenticated, service_role;

-- Garante extensão pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove job antigo (se existir) e agenda diário às 03:00 UTC
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-failed-messages-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-failed-messages-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-failed-messages-daily',
  '0 3 * * *',
  $$ SELECT public.cleanup_failed_messages(); $$
);