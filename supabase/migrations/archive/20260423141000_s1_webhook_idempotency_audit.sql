-- S1: Idempotência + observabilidade do webhook Evolution

-- (1) Deduplicação de eventos recebidos (PK idempotência)
CREATE TABLE IF NOT EXISTS public.webhook_events_processed (
  event_id text PRIMARY KEY,
  instance text NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_events_processed_processed_at_idx
  ON public.webhook_events_processed (processed_at DESC);

ALTER TABLE public.webhook_events_processed ENABLE ROW LEVEL SECURITY;

-- Apenas service_role lê/escreve. Nenhuma policy para anon/authenticated.
CREATE POLICY "service role manages webhook_events_processed"
  ON public.webhook_events_processed FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- TTL: remover entradas com mais de 30 dias (chamar via pg_cron em migração futura)
COMMENT ON TABLE public.webhook_events_processed IS
  'Deduplication table for incoming Evolution webhook events. Rows older than 30 days can be purged.';

-- (2) Audit log estruturado de cada evento recebido
CREATE TABLE IF NOT EXISTS public.webhook_audit_log (
  id bigserial PRIMARY KEY,
  request_id uuid NOT NULL,
  instance text,
  event_type text,
  status text NOT NULL CHECK (status IN ('received','processed','duplicate','error','rejected')),
  duration_ms integer,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_audit_log_received_at_idx
  ON public.webhook_audit_log (received_at DESC);

CREATE INDEX IF NOT EXISTS webhook_audit_log_instance_received_idx
  ON public.webhook_audit_log (instance, received_at DESC);

CREATE INDEX IF NOT EXISTS webhook_audit_log_status_idx
  ON public.webhook_audit_log (status) WHERE status IN ('error','rejected');

ALTER TABLE public.webhook_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages webhook_audit_log"
  ON public.webhook_audit_log FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Supervisores/admins podem ler para dashboards
CREATE POLICY "authenticated can read webhook_audit_log"
  ON public.webhook_audit_log FOR SELECT
  TO authenticated USING (true);
