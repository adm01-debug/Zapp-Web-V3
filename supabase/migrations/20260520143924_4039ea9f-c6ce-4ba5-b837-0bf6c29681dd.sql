-- Fix search_path for functions — guarded: may not exist in CI
DO $sp2_guards$ BEGIN
  BEGIN
    ALTER FUNCTION public.generate_transfer_ticket() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP generate_transfer_ticket SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.trg_fn_set_transfer_ticket() SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP trg_fn_set_transfer_ticket SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_create_transfer(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_create_transfer(7 args) SET search_path: %', SQLERRM;
  END;
  BEGIN
    ALTER FUNCTION public.fn_accept_transfer(UUID, UUID) SET search_path = public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP fn_accept_transfer(uuid,uuid) SET search_path: %', SQLERRM;
  END;
END $sp2_guards$;

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

-- Revoke public execute on security definer functions — guarded
DO $sp2_grants$ BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.fn_create_transfer(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP REVOKE fn_create_transfer: %', SQLERRM;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.fn_accept_transfer(UUID, UUID) FROM PUBLIC;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP REVOKE fn_accept_transfer: %', SQLERRM;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.fn_complete_transfer(UUID) FROM PUBLIC;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP REVOKE fn_complete_transfer: %', SQLERRM;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.fn_return_transfer(UUID, TEXT) FROM PUBLIC;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP REVOKE fn_return_transfer: %', SQLERRM;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.fn_transfer_comment(UUID, UUID, TEXT) FROM PUBLIC;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP REVOKE fn_transfer_comment: %', SQLERRM;
  END;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.fn_create_transfer(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP GRANT fn_create_transfer: %', SQLERRM;
  END;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.fn_accept_transfer(UUID, UUID) TO authenticated;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP GRANT fn_accept_transfer: %', SQLERRM;
  END;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.fn_complete_transfer(UUID) TO authenticated;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP GRANT fn_complete_transfer: %', SQLERRM;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.fn_return_transfer(UUID, TEXT) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.fn_return_transfer(UUID, TEXT) TO authenticated;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP GRANT fn_return_transfer: %', SQLERRM;
  END;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.fn_transfer_comment(UUID, UUID, TEXT) TO authenticated;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP GRANT fn_transfer_comment: %', SQLERRM;
  END;
END $sp2_grants$;
