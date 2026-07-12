-- Tabela de métricas de retry da Evolution API
CREATE TABLE public.evolution_retry_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  method text NOT NULL,
  instance_name text,
  idempotency_key text,
  attempt_count int NOT NULL,
  final_status text NOT NULL CHECK (final_status IN ('success', 'failed', 'exhausted')),
  final_http_status int,
  retry_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evolution_retry_metrics_created_at ON public.evolution_retry_metrics (created_at DESC);
CREATE INDEX idx_evolution_retry_metrics_action ON public.evolution_retry_metrics (action, created_at DESC);
CREATE INDEX idx_evolution_retry_metrics_status ON public.evolution_retry_metrics (final_status, created_at DESC);
CREATE INDEX idx_evolution_retry_metrics_instance ON public.evolution_retry_metrics (instance_name, created_at DESC);

ALTER TABLE public.evolution_retry_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and supervisors can view retry metrics"
ON public.evolution_retry_metrics
FOR SELECT
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- INSERT só via service_role (sem policy = bloqueado para anon/authenticated)

-- Função de cleanup (>30 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_evolution_retry_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.evolution_retry_metrics
  WHERE created_at < now() - interval '30 days';
END;
$$;

-- Agenda diária via pg_cron (3am UTC)
SELECT cron.schedule(
  'cleanup-evolution-retry-metrics-daily',
  '0 3 * * *',
  $$SELECT public.cleanup_old_evolution_retry_metrics();$$
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.evolution_retry_metrics;