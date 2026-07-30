-- 1. Tabela para histórico de alertas de instâncias
CREATE TABLE IF NOT EXISTS public.instance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
    instance_name TEXT NOT NULL,
    alert_type TEXT NOT NULL, -- 'down' (phantom/disconnected) ou 'up' (connected)
    reason TEXT,
    severity TEXT DEFAULT 'warning',
    notified_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Habilitar RLS
ALTER TABLE public.instance_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view instance alerts" ON public.instance_alerts FOR SELECT TO authenticated USING (true);

-- 3. Função para processar mudança de status e gerar alertas
CREATE OR REPLACE FUNCTION public.fn_monitor_instance_health()
RETURNS TRIGGER AS $$
DECLARE
    is_down BOOLEAN;
    was_down BOOLEAN;
    alert_reason TEXT;
BEGIN
    -- Definir se a instância está "caída" (disconnected ou phantom)
    is_down := (NEW.status = 'disconnected' OR NEW.health_reason IN ('phantom_session', 'socket_closed'));
    was_down := (OLD.status = 'disconnected' OR OLD.health_reason IN ('phantom_session', 'socket_closed'));

    -- Caso 1: Instância caiu (TRANSIÇÃO: UP -> DOWN)
    IF is_down AND NOT was_down THEN
        alert_reason := COALESCE(NEW.health_reason, 'Desconectado manualmente ou erro de socket');
        
        INSERT INTO public.instance_alerts (connection_id, instance_name, alert_type, reason, severity)
        VALUES (NEW.id, NEW.name, 'down', alert_reason, 'error');

        -- Aqui integraríamos com a fila de disparos (Email/Slack)
        -- Exemplo: INSERT INTO public.notification_queue ...
    END IF;

    -- Caso 2: Instância voltou (TRANSIÇÃO: DOWN -> UP)
    IF NOT is_down AND was_down THEN
        INSERT INTO public.instance_alerts (connection_id, instance_name, alert_type, reason, severity)
        VALUES (NEW.id, NEW.name, 'up', 'Conexão restabelecida', 'info');
        
        -- Marcar alertas anteriores como resolvidos
        UPDATE public.instance_alerts 
        SET resolved_at = now() 
        WHERE connection_id = NEW.id AND resolved_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger na tabela de conexões
DROP TRIGGER IF EXISTS trg_instance_health_monitor ON public.whatsapp_connections;
CREATE TRIGGER trg_instance_health_monitor
    AFTER UPDATE ON public.whatsapp_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_monitor_instance_health();