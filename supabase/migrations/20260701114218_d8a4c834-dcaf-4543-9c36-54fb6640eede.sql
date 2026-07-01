ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS health_reason TEXT,
  ADD COLUMN IF NOT EXISTS degraded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_jid TEXT;