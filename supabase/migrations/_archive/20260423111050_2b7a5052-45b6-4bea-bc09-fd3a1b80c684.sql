
-- Preferências de alerta de conexão por usuário
CREATE TABLE IF NOT EXISTS public.connection_alert_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  alert_on_degraded BOOLEAN NOT NULL DEFAULT true,
  alert_on_disconnected BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.connection_alert_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own connection alert prefs"
  ON public.connection_alert_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_connection_alert_preferences_updated_at
  BEFORE UPDATE ON public.connection_alert_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Permitir o service_role inserir notificações (já há policy bloqueando authenticated)
-- O edge function usa service role, que bypass RLS, então não precisa nova policy.
