CREATE OR REPLACE FUNCTION public.fn_test_only_accept_transfer(p_transfer_id UUID, p_operator_name TEXT)
RETURNS jsonb AS $$
DECLARE
    v_result public.conversation_transfers;
BEGIN
    UPDATE public.conversation_transfers
    SET status = 'accepted',
        target_operator = p_operator_name,
        accepted_at = now(),
        updated_at = now()
    WHERE id = p_transfer_id 
      AND status = 'pending'
    RETURNING * INTO v_result;

    IF v_result.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_ACCEPTED_OR_NOT_FOUND');
    END IF;

    RETURN jsonb_build_object('ok', true, 'data', to_jsonb(v_result));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
