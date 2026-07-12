-- Fix search_path for functions
ALTER FUNCTION public.generate_transfer_ticket() SET search_path = public;
ALTER FUNCTION public.trg_fn_set_transfer_ticket() SET search_path = public;
ALTER FUNCTION public.fn_create_transfer(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT) SET search_path = public;
ALTER FUNCTION public.fn_accept_transfer(UUID, UUID) SET search_path = public;

-- RPC: Complete Transfer
CREATE OR REPLACE FUNCTION public.fn_complete_transfer(
    p_transfer_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.conversation_transfers
    SET 
        status = 'completed',
        completed_at = NOW()
    WHERE 
        id = p_transfer_id AND status = 'accepted';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC: Return Transfer
CREATE OR REPLACE FUNCTION public.fn_return_transfer(
    p_transfer_id UUID,
    p_reason TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.conversation_transfers
    SET 
        status = 'returned',
        return_reason = p_reason
    WHERE 
        id = p_transfer_id AND status = 'pending';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RPC: Add Transfer Comment
CREATE OR REPLACE FUNCTION public.fn_transfer_comment(
    p_transfer_id UUID,
    p_agent_id UUID,
    p_content TEXT
)
RETURNS UUID AS $$
DECLARE
    v_comment_id UUID;
BEGIN
    INSERT INTO public.transfer_comments (
        transfer_id,
        agent_id,
        content
    ) VALUES (
        p_transfer_id,
        p_agent_id,
        p_content
    ) RETURNING id INTO v_comment_id;
    
    RETURN v_comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoke public execute on security definer functions
REVOKE EXECUTE ON FUNCTION public.fn_create_transfer(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_accept_transfer(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_complete_transfer(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_return_transfer(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_transfer_comment(UUID, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_create_transfer(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_accept_transfer(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_complete_transfer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_return_transfer(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_transfer_comment(UUID, UUID, TEXT) TO authenticated;