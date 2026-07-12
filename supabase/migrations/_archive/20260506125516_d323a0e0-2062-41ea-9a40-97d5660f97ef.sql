-- 1. Fix Security Definer function search_path
ALTER FUNCTION public.fn_accept_transfer(UUID, TEXT) SET search_path = public;

-- 2. Complete RLS Policies for Registry and Comments
CREATE POLICY "Admins can manage instance_registry"
ON public.instance_registry FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
));

CREATE POLICY "Agents can view instance_registry"
ON public.instance_registry FOR SELECT
USING (true);

CREATE POLICY "Agents can view and create comments for their transfers"
ON public.transfer_comments FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.conversation_transfers t
    JOIN public.instance_members m ON (t.source_instance = m.instance_name OR t.target_instance = m.instance_name)
    WHERE t.id = transfer_comments.transfer_id AND m.user_id = auth.uid()
));

-- 3. Core Transfer RPCs
CREATE OR REPLACE FUNCTION public.fn_create_transfer(
    p_source TEXT,
    p_target TEXT,
    p_jid TEXT,
    p_reason TEXT,
    p_category TEXT DEFAULT 'outro',
    p_priority INT DEFAULT 2,
    p_type TEXT DEFAULT 'internal',
    p_operator TEXT DEFAULT NULL,
    p_summary TEXT DEFAULT NULL,
    p_tags TEXT[] DEFAULT '{}',
    p_idempotency_key UUID DEFAULT NULL
)
RETURNS public.conversation_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_transfer public.conversation_transfers;
BEGIN
    INSERT INTO public.conversation_transfers (
        source_instance, target_instance, remote_jid, reason, category, 
        priority, transfer_type, source_operator, context_summary, 
        tags, idempotency_key
    ) VALUES (
        p_source, p_target, p_jid, p_reason, p_category, 
        p_priority, p_type, p_operator, p_summary, 
        p_tags, p_idempotency_key
    )
    RETURNING * INTO v_transfer;

    RETURN v_transfer;
END;
$$;

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
        completed_at = now()
    WHERE id = p_transfer_id 
      AND status IN ('accepted', 'in_progress')
    RETURNING * INTO v_transfer;

    RETURN v_transfer;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_return_transfer(
    p_transfer_id UUID, 
    p_reason TEXT
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
    SET status = 'returned',
        resolution_notes = p_reason,
        resolution_type = 'returned'
    WHERE id = p_transfer_id 
      AND status IN ('accepted', 'in_progress')
    RETURNING * INTO v_transfer;

    RETURN v_transfer;
END;
$$;

-- 4. Realtime Notifications Trigger
CREATE OR REPLACE FUNCTION public.trg_transfer_notify()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'transfer_' || NEW.target_instance,
        jsonb_build_object(
            'id', NEW.id,
            'ticket', NEW.ticket_number,
            'contact', NEW.contact_name,
            'reason', NEW.reason,
            'priority', NEW.priority
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transfer_notify AFTER INSERT ON public.conversation_transfers FOR EACH ROW EXECUTE FUNCTION public.trg_transfer_notify();

-- 5. Views for Operations Hub
CREATE OR REPLACE VIEW public.v_pending_transfers AS
SELECT 
    target_instance,
    count(*) FILTER (WHERE status = 'pending') as pending,
    count(*) FILTER (WHERE priority = 4 AND status = 'pending') as urgente,
    count(*) FILTER (WHERE priority = 3 AND status = 'pending') as alta,
    count(*) FILTER (WHERE expires_at < now() AND status = 'pending') as sla_estourado,
    min(created_at) as mais_antiga
FROM public.conversation_transfers
GROUP BY target_instance;

CREATE OR REPLACE VIEW public.v_transfer_metrics AS
SELECT 
    target_instance,
    count(*) as total,
    count(*) FILTER (WHERE status = 'completed') as completed,
    count(*) FILTER (WHERE status = 'pending') as pending,
    avg(EXTRACT(EPOCH FROM (completed_at - created_at))/60)::numeric(10,2) as avg_min,
    count(*) FILTER (WHERE completed_at <= expires_at) as within_sla,
    count(*) FILTER (WHERE completed_at > expires_at) as missed_sla
FROM public.conversation_transfers
GROUP BY target_instance;
