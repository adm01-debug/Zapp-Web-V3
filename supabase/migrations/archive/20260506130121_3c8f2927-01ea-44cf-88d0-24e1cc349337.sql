-- 1. Ensure metrics columns exist
ALTER TABLE public.conversation_transfers 
  ADD COLUMN IF NOT EXISTS queue_time_seconds INT,
  ADD COLUMN IF NOT EXISTS handle_time_seconds INT,
  ADD COLUMN IF NOT EXISTS escalation_count INT DEFAULT 0;

-- 2. Update Resolution Logic
CREATE OR REPLACE FUNCTION public.fn_complete_transfer(
    p_transfer_id UUID, 
    p_notes TEXT,
    p_type TEXT DEFAULT 'resolved'
)
RETURNS public.conversation_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_transfer public.conversation_transfers;
BEGIN
    UPDATE public.conversation_transfers
    SET status = 'completed',
        resolution_notes = p_notes,
        resolution_type = p_type,
        completed_at = now(),
        queue_time_seconds = EXTRACT(EPOCH FROM (accepted_at - created_at))::int,
        handle_time_seconds = EXTRACT(EPOCH FROM (now() - accepted_at))::int
    WHERE id = p_transfer_id 
      AND status IN ('accepted', 'in_progress')
    RETURNING * INTO v_transfer;

    RETURN v_transfer;
END;
$$;

-- 3. Efficiency Metrics View
CREATE OR REPLACE VIEW public.v_operator_efficiency AS
SELECT 
    target_operator,
    count(*) as tickets_resolved,
    avg(queue_time_seconds / 60)::numeric(10,2) as avg_queue_min,
    avg(handle_time_seconds / 60)::numeric(10,2) as avg_handle_min,
    count(*) FILTER (WHERE completed_at > expires_at) as sla_breaches,
    avg(escalation_count)::numeric(10,2) as avg_escalations
FROM public.conversation_transfers
WHERE status = 'completed' AND target_operator IS NOT NULL
GROUP BY target_operator;

-- 4. Audit Reporting View (using 'name' column)
CREATE OR REPLACE VIEW public.v_transfer_audit_full AS
SELECT 
    a.created_at as timestamp,
    t.ticket_number,
    a.action,
    COALESCE(p.name, a.user_id::text) as user_name,
    a.instance_name,
    a.metadata
FROM public.transfer_audit_log a
JOIN public.conversation_transfers t ON a.transfer_id = t.id
LEFT JOIN public.profiles p ON a.user_id = p.id
ORDER BY a.created_at DESC;

-- 5. Finalize Escalation
CREATE OR REPLACE FUNCTION public.fn_escalate_overdue_transfers()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    WITH escalated AS (
        UPDATE public.conversation_transfers
        SET status = 'escalated',
            priority = 4,
            escalated_at = now(),
            escalation_count = COALESCE(escalation_count, 0) + 1,
            updated_at = now()
        WHERE status IN ('pending', 'accepted', 'in_progress')
          AND expires_at < now()
          AND (escalated_at IS NULL OR escalated_at < now() - interval '1 hour')
        RETURNING id, target_instance, ticket_number
    )
    SELECT count(*) INTO v_count FROM escalated;

    IF v_count > 0 THEN
        PERFORM pg_notify('transfer_escalation', jsonb_build_object('count', v_count)::text);
    END IF;

    RETURN v_count;
END;
$$;
