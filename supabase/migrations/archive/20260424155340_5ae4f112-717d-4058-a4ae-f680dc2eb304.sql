ALTER TABLE public.sla_alert_preferences
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;