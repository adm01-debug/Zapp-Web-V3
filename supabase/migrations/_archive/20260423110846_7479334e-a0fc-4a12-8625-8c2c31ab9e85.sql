ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS degraded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_degraded_at
  ON public.whatsapp_connections(degraded_at)
  WHERE degraded_at IS NOT NULL;