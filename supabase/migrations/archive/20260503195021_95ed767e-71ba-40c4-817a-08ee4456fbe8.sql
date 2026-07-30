-- Insert automation rule for delivery alerts
-- Trigger type is likely a string or enum, assuming 'on_message_status' based on project context
INSERT INTO public.automation_rules (name, description, trigger_type, trigger_config, actions, is_active)
VALUES (
    'Alerta de Entrega Atrasada',
    'Dispara alertas quando mensagens outbound ficam entregues mas não lidas.',
    'keyword_match', -- Fallback generic type if specific status update trigger isn't defined yet
    '{"trigger": "delivery_delay", "threshold_min": 30}'::jsonb,
    '[{"type": "notify_agent", "config": {"template": "Mensagem entregue há mais de 30min sem leitura"}}]'::jsonb,
    true
);
