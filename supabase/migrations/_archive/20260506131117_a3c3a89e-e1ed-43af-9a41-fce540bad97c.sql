CREATE OR REPLACE FUNCTION public.trg_log_transfer_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.transfer_audit_log (transfer_id, user_id, action, instance_name, metadata)
        VALUES (
            NEW.id, 
            COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), -- Fallback for system actions
            CASE 
                WHEN TG_OP = 'INSERT' THEN 'created'
                WHEN NEW.status = 'accepted' THEN 'accepted'
                WHEN NEW.status = 'completed' THEN 'resolved'
                WHEN NEW.status = 'returned' THEN 'returned'
                WHEN NEW.status = 'escalated' THEN 'escalated'
                ELSE 'updated'
            END,
            NEW.target_instance,
            jsonb_build_object(
                'old_status', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, 
                'new_status', NEW.status
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
