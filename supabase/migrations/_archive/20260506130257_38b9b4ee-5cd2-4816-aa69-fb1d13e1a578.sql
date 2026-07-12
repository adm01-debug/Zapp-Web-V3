-- 1. Security Violation Logging (Audit for Denied Access)
CREATE TABLE public.rls_violation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    table_name TEXT,
    operation TEXT,
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.rls_violation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view violation logs"
ON public.rls_violation_log FOR SELECT
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- 2. Performance Optimization (Indexes)
CREATE INDEX IF NOT EXISTS idx_instance_members_user_instance ON public.instance_members (user_id, instance_name);
CREATE INDEX IF NOT EXISTS idx_transfers_source_target ON public.conversation_transfers (source_instance, target_instance);
CREATE INDEX IF NOT EXISTS idx_transfers_status_expires ON public.conversation_transfers (status, expires_at) WHERE status IN ('pending', 'accepted', 'in_progress');

-- 3. Admin SLA Dashboard View
CREATE OR REPLACE VIEW public.v_admin_sla_dashboard AS
SELECT 
    r.department,
    r.instance_name,
    r.display_name,
    count(t.id) as total_tickets,
    count(t.id) FILTER (WHERE t.status = 'pending') as pending,
    count(t.id) FILTER (WHERE t.status = 'escalated') as escalated,
    count(t.id) FILTER (WHERE t.expires_at < now() AND t.status NOT IN ('completed', 'cancelled')) as expired,
    avg(t.queue_time_seconds / 60)::numeric(10,2) as avg_wait_min
FROM public.instance_registry r
LEFT JOIN public.conversation_transfers t ON r.instance_name = t.target_instance
GROUP BY r.department, r.instance_name, r.display_name;

-- 4. Programmatic RLS Validation Function
CREATE OR REPLACE FUNCTION public.fn_check_transfer_access(p_transfer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.conversation_transfers t
        JOIN public.instance_members m ON (t.source_instance = m.instance_name OR t.target_instance = m.instance_name)
        WHERE t.id = p_transfer_id AND m.user_id = auth.uid()
    );
END;
$$;

-- 5. Hardening fn_accept_transfer (Explicit Load Protection)
CREATE OR REPLACE FUNCTION public.fn_accept_transfer(p_transfer_id UUID, p_operator_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result public.conversation_transfers;
BEGIN
    -- Explicit row-level lock to prevent any race condition in extreme concurrency
    -- although UPDATE ... WHERE status = 'pending' is already atomic.
    UPDATE public.conversation_transfers
    SET status = 'accepted',
        target_operator = p_operator_name,
        accepted_at = now(),
        updated_at = now()
    WHERE id = p_transfer_id 
      AND status = 'pending'
      -- RLS check integrated
      AND (target_instance IN (SELECT instance_name FROM public.instance_members WHERE user_id = auth.uid()))
    RETURNING * INTO v_result;

    IF v_result.id IS NULL THEN
        -- Check if it failed due to RLS or Status
        IF NOT EXISTS (SELECT 1 FROM public.conversation_transfers WHERE id = p_transfer_id) THEN
             RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
        ELSIF NOT (SELECT public.fn_check_transfer_access(p_transfer_id)) THEN
             INSERT INTO public.rls_violation_log (user_id, table_name, operation, metadata)
             VALUES (auth.uid(), 'conversation_transfers', 'accept', jsonb_build_object('transfer_id', p_transfer_id));
             RETURN jsonb_build_object('ok', false, 'error', 'ACCESS_DENIED');
        ELSE
             RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_ACCEPTED');
        END IF;
    END IF;

    RETURN jsonb_build_object('ok', true, 'data', to_jsonb(v_result));
END;
$$;
