-- 1. Detailed Audit Trail
CREATE TABLE public.transfer_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES public.conversation_transfers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('created', 'read', 'accepted', 'resolved', 'returned', 'escalated', 'reopened', 'commented')),
    instance_name TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.transfer_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view audit logs for their instances"
ON public.transfer_audit_log FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.instance_members m 
    WHERE m.instance_name = transfer_audit_log.instance_name AND m.user_id = auth.uid()
));

-- 2. Trigger to Log Status Changes
CREATE OR REPLACE FUNCTION public.trg_log_transfer_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.transfer_audit_log (transfer_id, user_id, action, instance_name, metadata)
        VALUES (
            NEW.id, 
            auth.uid(), 
            CASE 
                WHEN TG_OP = 'INSERT' THEN 'created'
                WHEN NEW.status = 'accepted' THEN 'accepted'
                WHEN NEW.status = 'completed' THEN 'resolved'
                WHEN NEW.status = 'returned' THEN 'returned'
                WHEN NEW.status = 'escalated' THEN 'escalated'
                ELSE 'reopened'
            END,
            NEW.target_instance,
            jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_transfer_status_change 
AFTER INSERT OR UPDATE OF status ON public.conversation_transfers 
FOR EACH ROW EXECUTE FUNCTION public.trg_log_transfer_status_change();

-- 3. SLA Escalation Logic
CREATE OR REPLACE FUNCTION public.fn_escalate_overdue_transfers()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    -- Update overdue pending/accepted transfers
    WITH escalated AS (
        UPDATE public.conversation_transfers
        SET status = 'escalated',
            priority = LEAST(priority + 1, 4),
            escalated_at = now(),
            escalation_count = escalation_count + 1,
            updated_at = now()
        WHERE status IN ('pending', 'accepted', 'in_progress')
          AND expires_at < now()
          AND (escalated_at IS NULL OR escalated_at < now() - interval '1 hour') -- Throttle re-escalation
        RETURNING id, target_instance, ticket_number
    )
    SELECT count(*) INTO v_count FROM escalated;

    -- Notify supervisors for each escalated ticket
    -- (This would typically be handled by a worker listening to pg_notify or a webhook)
    RETURN v_count;
END;
$$;

-- 4. SLA Breach View
CREATE OR REPLACE VIEW public.v_sla_breach_alerts AS
SELECT 
    t.id,
    t.ticket_number,
    t.target_instance,
    t.priority,
    t.expires_at,
    t.status,
    EXTRACT(EPOCH FROM (now() - t.expires_at))/60 as overdue_minutes
FROM public.conversation_transfers t
WHERE t.status IN ('pending', 'accepted', 'in_progress')
  AND t.expires_at < now()
ORDER BY t.priority DESC, t.expires_at ASC;

-- 5. Concurrency Test Utility
-- Simulates atomic accept from multiple "connections"
CREATE OR REPLACE FUNCTION public.fn_test_concurrency_accept(p_transfer_id UUID, p_iterations INT)
RETURNS TABLE (success_count INT, failure_count INT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_success INT := 0;
    v_fail INT := 0;
    v_res JSONB;
BEGIN
    FOR i IN 1..p_iterations LOOP
        v_res := public.fn_accept_transfer(p_transfer_id, 'Tester ' || i);
        IF (v_res->>'ok')::boolean THEN
            v_success := v_success + 1;
        ELSE
            v_fail := v_fail + 1;
        END IF;
    END LOOP;
    RETURN QUERY SELECT v_success, v_fail;
END;
$$;
