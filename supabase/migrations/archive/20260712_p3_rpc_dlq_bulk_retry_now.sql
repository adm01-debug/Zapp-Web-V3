-- ============================================================
-- rpc_dlq_bulk_retry_now — batch retry for DLQ items
-- Replaces N individual rpc_dlq_retry_now calls with a single
-- UPDATE ... WHERE id = ANY(p_ids) to eliminate the N+1 pattern
-- in the BulkRetry frontend mutation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_dlq_bulk_retry_now(
  p_ids  uuid[],
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'developer')
  ) THEN
    PERFORM public.log_rls_denied(
      'rpc_dlq_bulk_retry_now', 'admin|developer',
      jsonb_build_object('ids_count', array_length(p_ids, 1))
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.failed_messages
    SET next_retry_at = now(),
        status        = 'pending'
  WHERE id = ANY(p_ids)
    AND status IN ('pending', 'retrying', 'abandoned');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_bulk_retry_now(uuid[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_dlq_bulk_retry_now(uuid[], text) TO authenticated;
