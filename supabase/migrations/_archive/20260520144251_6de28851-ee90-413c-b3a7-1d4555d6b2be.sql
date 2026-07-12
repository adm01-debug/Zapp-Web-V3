CREATE OR REPLACE FUNCTION public.fn_accept_transfer(
    p_transfer_id UUID,
    p_agent_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_conversation_id UUID;
BEGIN
    -- Update the transfer record
    UPDATE public.conversation_transfers
    SET 
        status = 'accepted',
        to_agent_id = p_agent_id,
        accepted_at = NOW()
    WHERE 
        id = p_transfer_id AND status = 'pending'
    RETURNING conversation_id INTO v_conversation_id;
    
    IF FOUND THEN
        -- Assign the contact to the new agent
        UPDATE public.contacts
        SET assigned_to = p_agent_id
        WHERE id = v_conversation_id;
        
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;