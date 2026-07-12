-- 1. Tabela de horários comerciais
CREATE TABLE IF NOT EXISTS public.business_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL,
    day_of_week INT NOT NULL, -- 0 (domingo) a 6 (sábado)
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    UNIQUE(instance_name, day_of_week)
);

ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read business_hours" ON public.business_hours;
CREATE POLICY "Public read business_hours" ON public.business_hours FOR SELECT USING (true);

-- 2. Função robusta para SLA (Business Hours)
CREATE OR REPLACE FUNCTION public.fn_add_business_minutes(
    p_instance_name TEXT,
    p_start_time TIMESTAMP WITH TIME ZONE,
    p_minutes_to_add INT
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_current_time TIMESTAMP WITH TIME ZONE := p_start_time;
    v_minutes_remaining INT := p_minutes_to_add;
    v_day_start TIME;
    v_day_end TIME;
    v_day_of_week INT;
    v_minutes_until_end INT;
BEGIN
    WHILE v_minutes_remaining > 0 LOOP
        v_day_of_week := EXTRACT(DOW FROM v_current_time);
        
        SELECT start_time, end_time INTO v_day_start, v_day_end
        FROM public.business_hours
        WHERE instance_name = p_instance_name AND day_of_week = v_day_of_week AND is_enabled = true;

        IF NOT FOUND OR v_day_start IS NULL THEN
            v_current_time := (v_current_time + INTERVAL '1 day')::DATE::TIMESTAMP WITH TIME ZONE;
            CONTINUE;
        END IF;

        IF v_current_time::TIME < v_day_start THEN
            v_current_time := (v_current_time::DATE + v_day_start)::TIMESTAMP WITH TIME ZONE;
        END IF;

        IF v_current_time::TIME >= v_day_end THEN
            v_current_time := (v_current_time + INTERVAL '1 day')::DATE::TIMESTAMP WITH TIME ZONE;
            CONTINUE;
        END IF;

        v_minutes_until_end := EXTRACT(EPOCH FROM (v_day_end - v_current_time::TIME)) / 60;
        
        IF v_minutes_remaining <= v_minutes_until_end THEN
            v_current_time := v_current_time + (v_minutes_remaining * INTERVAL '1 minute');
            v_minutes_remaining := 0;
        ELSE
            v_minutes_remaining := v_minutes_remaining - v_minutes_until_end;
            v_current_time := (v_current_time + INTERVAL '1 day')::DATE::TIMESTAMP WITH TIME ZONE;
        END IF;
    END LOOP;

    RETURN v_current_time;
END;
$$;

-- 3. Trigger para automatizar o expires_at
CREATE OR REPLACE FUNCTION public.trg_fn_set_transfer_sla()
RETURNS TRIGGER AS $$
DECLARE
    v_sla_minutes INT;
BEGIN
    -- Busca SLA da instância
    SELECT COALESCE(sla_first_response_minutes, 15) INTO v_sla_minutes
    FROM public.instance_registry
    WHERE instance_name = NEW.instance_name;

    -- Calcula data de expiração respeitando horário comercial
    NEW.expires_at := public.fn_add_business_minutes(NEW.instance_name, NEW.created_at, v_sla_minutes);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_transfer_sla ON public.conversation_transfers;
CREATE TRIGGER trg_set_transfer_sla
BEFORE INSERT ON public.conversation_transfers
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_set_transfer_sla();

-- 4. Função de Escalonamento Automático
CREATE OR REPLACE FUNCTION public.fn_auto_escalate_sla()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.conversation_transfers
    SET priority = CASE 
        WHEN priority = 'low' THEN 'medium'::public.transfer_priority
        WHEN priority = 'medium' THEN 'high'::public.transfer_priority
        WHEN priority = 'high' THEN 'urgent'::public.transfer_priority
        ELSE priority
    END,
    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{auto_escalated}', 'true'),
    updated_at = now()
    WHERE status = 'pending' 
    AND expires_at < now()
    AND (metadata->>'auto_escalated' IS NULL OR metadata->>'auto_escalated' = 'false');
END;
$$;
