
-- Tabela de telemetria para a external-db-proxy
CREATE TABLE IF NOT EXISTS public.proxy_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  cid TEXT,
  rid TEXT,
  op TEXT NOT NULL,           -- rpc | select | insert | update
  target TEXT NOT NULL,       -- table or rpc name
  status INT NOT NULL,        -- HTTP status returned
  ms INT NOT NULL,            -- duration in ms
  ok BOOLEAN NOT NULL,
  timeout_fired BOOLEAN NOT NULL DEFAULT false,
  pg_timeout BOOLEAN NOT NULL DEFAULT false,
  err_code TEXT,
  err_msg TEXT
);

CREATE INDEX IF NOT EXISTS idx_proxy_metrics_ts ON public.proxy_metrics (ts DESC);
CREATE INDEX IF NOT EXISTS idx_proxy_metrics_status_ts ON public.proxy_metrics (status, ts DESC);
CREATE INDEX IF NOT EXISTS idx_proxy_metrics_target_ts ON public.proxy_metrics (target, ts DESC);

ALTER TABLE public.proxy_metrics ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ler métricas; INSERT é feito pela própria edge function (service role bypassa RLS)
CREATE POLICY "Admins can view proxy metrics"
  ON public.proxy_metrics FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tabela de alertas disparados (para dedupe e histórico)
CREATE TABLE IF NOT EXISTS public.proxy_alerts (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL,           -- error_rate | latency_p95 | timeout_rate
  severity TEXT NOT NULL,       -- warning | critical
  value NUMERIC NOT NULL,
  threshold NUMERIC NOT NULL,
  window_minutes INT NOT NULL,
  sample_size INT NOT NULL,
  details JSONB
);

CREATE INDEX IF NOT EXISTS idx_proxy_alerts_ts ON public.proxy_alerts (ts DESC);
CREATE INDEX IF NOT EXISTS idx_proxy_alerts_kind_ts ON public.proxy_alerts (kind, ts DESC);

ALTER TABLE public.proxy_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view proxy alerts"
  ON public.proxy_alerts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Cleanup automático: manter apenas 24h de samples (volume alto)
CREATE OR REPLACE FUNCTION public.cleanup_proxy_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.proxy_metrics WHERE ts < now() - interval '24 hours';
  DELETE FROM public.proxy_alerts  WHERE ts < now() - interval '30 days';
END;
$$;
