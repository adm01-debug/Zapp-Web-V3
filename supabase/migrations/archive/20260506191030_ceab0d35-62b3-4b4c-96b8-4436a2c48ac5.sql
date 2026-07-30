-- Atualizar a função de monitoramento para disparar notificações reais
CREATE OR REPLACE FUNCTION public.fn_monitor_instance_health()
RETURNS TRIGGER AS $$
DECLARE
    is_down BOOLEAN;
    was_down BOOLEAN;
    alert_reason TEXT;
    admin_user_id UUID;
    notification_title TEXT;
    notification_body TEXT;
BEGIN
    -- Definir se a instância está "caída" (disconnected ou phantom)
    is_down := (NEW.status = 'disconnected' OR NEW.health_reason IN ('phantom_session', 'socket_closed'));
    was_down := (OLD.status = 'disconnected' OR OLD.health_reason IN ('phantom_session', 'socket_closed'));

    -- Pegar o primeiro admin disponível para notificar (em um cenário real, seria para todos os admins)
    SELECT id INTO admin_user_id FROM public.profiles WHERE id IN (SELECT id FROM auth.users) LIMIT 1;

    -- Caso 1: Instância caiu (TRANSIÇÃO: UP -> DOWN)
    IF is_down AND NOT was_down THEN
        alert_reason := COALESCE(NEW.health_reason, 'Desconectado');
        
        INSERT INTO public.instance_alerts (connection_id, instance_name, alert_type, reason, severity)
        VALUES (NEW.id, NEW.name, 'down', alert_reason, 'error');

        IF admin_user_id IS NOT NULL THEN
            notification_title := '🚨 Alerta: Instância ' || NEW.name || ' caiu!';
            notification_body := 'A instância WhatsApp ' || NEW.name || ' está em estado crítico: ' || alert_reason || '. A reconexão automática foi iniciada.';
            
            INSERT INTO public.notifications (user_id, title, message, type, metadata)
            VALUES (admin_user_id, notification_title, notification_body, 'alert', jsonb_build_object('connection_id', NEW.id, 'status', 'down'));
        END IF;
    END IF;

    -- Caso 2: Instância voltou (TRANSIÇÃO: DOWN -> UP)
    IF NOT is_down AND was_down THEN
        INSERT INTO public.instance_alerts (connection_id, instance_name, alert_type, reason, severity)
        VALUES (NEW.id, NEW.name, 'up', 'Conexão restabelecida', 'info');
        
        -- Marcar alertas anteriores como resolvidos
        UPDATE public.instance_alerts 
        SET resolved_at = now() 
        WHERE connection_id = NEW.id AND resolved_at IS NULL;

        IF admin_user_id IS NOT NULL THEN
            notification_title := '✅ Instância ' || NEW.name || ' normalizada';
            notification_body := 'A instância ' || NEW.name || ' voltou a ficar online e está operando normalmente.';
            
            INSERT INTO public.notifications (user_id, title, message, type, metadata)
            VALUES (admin_user_id, notification_title, notification_body, 'info', jsonb_build_object('connection_id', NEW.id, 'status', 'up'));
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;