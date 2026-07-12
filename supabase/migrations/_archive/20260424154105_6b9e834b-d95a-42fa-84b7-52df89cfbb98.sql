CREATE TABLE public.sla_alert_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  alert_first_response BOOLEAN NOT NULL DEFAULT true,
  alert_resolution BOOLEAN NOT NULL DEFAULT true,
  severity_warning BOOLEAN NOT NULL DEFAULT true,
  severity_breached BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sla_alert_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own SLA alert preferences"
  ON public.sla_alert_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own SLA alert preferences"
  ON public.sla_alert_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SLA alert preferences"
  ON public.sla_alert_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_sla_alert_preferences_updated_at
  BEFORE UPDATE ON public.sla_alert_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();