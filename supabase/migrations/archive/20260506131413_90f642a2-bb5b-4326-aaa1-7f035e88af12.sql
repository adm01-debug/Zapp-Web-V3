-- Function to reopen/return a transfer
CREATE OR REPLACE FUNCTION public.fn_reopen_transfer(
    p_parent_transfer_id UUID,
    p_reason TEXT,
    p_target_instance TEXT DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_parent public.conversation_transfers;
    v_new_id UUID;
BEGIN
    -- 1. Get parent details
    SELECT * INTO v_parent FROM public.conversation_transfers WHERE id = p_parent_transfer_id;
    
    IF v_parent.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PARENT_NOT_FOUND');
    END IF;

    -- 2. Create new transfer linked to parent
    INSERT INTO public.conversation_transfers (
        source_instance,
        target_instance,
        remote_jid,
        reason,
        parent_transfer_id,
        priority,
        status
    )
    VALUES (
        v_parent.target_instance,
        COALESCE(p_target_instance, v_parent.source_instance), -- Default return to source
        v_parent.remote_jid,
        p_reason,
        v_parent.id,
        v_parent.priority,
        'pending'
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('ok', true, 'new_transfer_id', v_new_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
