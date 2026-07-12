CREATE OR REPLACE FUNCTION public.trg_fn_set_transfer_sla()
RETURNS TRIGGER AS $$
DECLARE
    v_sla_minutes INT;
BEGIN
    -- Busca SLA da instância de destino
    SELECT COALESCE(sla_first_response_minutes, 15) INTO v_sla_minutes
    FROM public.instance_registry
    WHERE instance_name = NEW.target_instance;

    -- Calcula data de expiração respeitando horário comercial se não for provido explicitamente
    IF NEW.expires_at IS NULL THEN
        NEW.expires_at := public.fn_add_business_minutes(NEW.target_instance, NEW.created_at, v_sla_minutes);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
