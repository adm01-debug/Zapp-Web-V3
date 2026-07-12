-- 1. Refine SLA Trigger (P4 ignores business hours)
CREATE OR REPLACE FUNCTION public.trg_transfer_auto_sla()
RETURNS TRIGGER AS $$
DECLARE
    v_minutes INT;
BEGIN
    v_minutes := CASE 
        WHEN NEW.priority = 4 THEN 120 -- 2h
        WHEN NEW.priority = 3 THEN 240 -- 4h
        WHEN NEW.priority = 2 THEN 480 -- 8h
        ELSE 1440 -- 24h
    END;

    IF NEW.priority = 4 THEN
        NEW.expires_at := now() + interval '2 hours';
    ELSE
        NEW.expires_at := public.fn_add_business_minutes(now(), v_minutes, NEW.target_instance);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Secure Monitoring View
CREATE OR REPLACE VIEW public.v_pending_transfers_secure AS
SELECT v.*
FROM public.v_pending_transfers v
WHERE EXISTS (
    SELECT 1 FROM public.instance_members m 
    WHERE m.instance_name = v.target_instance AND m.user_id = auth.uid()
);

-- 3. Transfer Comment RPC
CREATE OR REPLACE FUNCTION public.fn_transfer_comment(
    p_transfer_id UUID,
    p_author TEXT,
    p_instance TEXT,
    p_content TEXT,
    p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS public.transfer_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_comment public.transfer_comments;
BEGIN
    INSERT INTO public.transfer_comments (
        transfer_id, author_name, author_instance, content, attachments
    ) VALUES (
        p_transfer_id, p_author, p_instance, p_content, p_attachments
    )
    RETURNING * INTO v_comment;

    -- Update transfer updated_at
    UPDATE public.conversation_transfers 
    SET updated_at = now()
    WHERE id = p_transfer_id;

    RETURN v_comment;
END;
$$;
