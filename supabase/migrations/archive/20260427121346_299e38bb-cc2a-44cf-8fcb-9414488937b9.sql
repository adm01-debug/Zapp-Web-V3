-- Habilitar realtime para automation_executions: necessário para o alerta global
-- de falhas de automação (useAutomationFailureAlerts) detectar transições para
-- status='failed' em tempo real.
ALTER TABLE public.automation_executions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_executions;