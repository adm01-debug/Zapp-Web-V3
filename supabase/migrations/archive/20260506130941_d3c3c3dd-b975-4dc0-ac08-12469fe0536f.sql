-- Add mapping columns to instance_registry
ALTER TABLE public.instance_registry 
ADD COLUMN IF NOT EXISTS service_channel TEXT,
ADD COLUMN IF NOT EXISTS queue_id TEXT;

-- Function to process escalations
CREATE OR REPLACE FUNCTION public.fn_process_escalations()
RETURNS VOID AS $$
BEGIN
    -- Escalate pending transfers that are expired
    UPDATE public.conversation_transfers
    SET status = 'escalated',
        escalated_at = now(),
        escalation_count = escalation_count + 1,
        priority = priority + 10, -- Increase priority on escalation
        updated_at = now()
    WHERE status = 'pending' 
      AND expires_at < now();
      
    -- Log escalations in audit log (optional, could be a trigger)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update conversation_registry on new transfers
CREATE OR REPLACE FUNCTION public.fn_on_transfer_created()
RETURNS TRIGGER AS $$
BEGIN
    -- Upsert into conversation_registry
    INSERT INTO public.conversation_registry (external_id, current_instance_name, last_transfer_id, updated_at)
    VALUES (NEW.remote_jid, NEW.target_instance, NEW.id, now())
    ON CONFLICT (external_id) 
    DO UPDATE SET 
        current_instance_name = EXCLUDED.current_instance_name,
        last_transfer_id = EXCLUDED.last_transfer_id,
        updated_at = now();
        
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_on_transfer_created
AFTER INSERT ON public.conversation_transfers
FOR EACH ROW
EXECUTE FUNCTION public.fn_on_transfer_created();
