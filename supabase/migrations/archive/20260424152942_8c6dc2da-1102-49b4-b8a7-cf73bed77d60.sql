INSERT INTO public.global_settings (key, value, description) VALUES
  ('sla_alert_webhook_url', '', 'URL HTTPS para encaminhar eventos sla_alert (Slack incoming webhook, gateway de email, push relay, etc.). Vazio = desativado.'),
  ('sla_alert_webhook_method', 'POST', 'Método HTTP para o webhook de SLA alert. Aceita POST ou PUT.')
ON CONFLICT (key) DO NOTHING;