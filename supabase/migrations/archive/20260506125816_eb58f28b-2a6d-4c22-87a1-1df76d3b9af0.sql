-- 1. Context Capture in Transfer
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
    v_context JSONB;
BEGIN
    -- Auto-capture last 5 messages for context
    SELECT jsonb_agg(sub.msg) INTO v_context
    FROM (
        SELECT jsonb_build_object(
            'content', content,
            'direction', direction,
            'timestamp', created_at
        ) as msg
        FROM public.evolution_messages
        WHERE remote_jid = p_jid
        ORDER BY created_at DESC
        LIMIT 5
    ) sub;

    INSERT INTO public.conversation_transfers (
        source_instance, target_instance, remote_jid, reason, category, 
        priority, transfer_type, source_operator, context_summary, 
        tags, idempotency_key, context_messages
    ) VALUES (
        p_source, p_target, p_jid, p_reason, p_category, 
        p_priority, p_type, p_operator, p_summary, 
        p_tags, p_idempotency_key, COALESCE(v_context, '[]'::jsonb)
    )
    RETURNING * INTO v_transfer;

    RETURN v_transfer;
END;
$$;

-- 2. Secure Unread Summary for Current User
CREATE OR REPLACE FUNCTION public.fn_get_my_unread_summary()
RETURNS TABLE (
    instance_name TEXT,
    unread_transfers BIGINT,
    unread_urgent BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT 
        instance_name,
        unread_transfers,
        unread_urgent
    FROM public.v_operator_unread_summary
    WHERE user_id = auth.uid();
$$;

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_conv_reads_lookup ON public.conversation_reads (conversation_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conv_reads_user ON public.conversation_reads (user_id);

-- 4. Ensure RLS on conversation_reads
ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own read status"
ON public.conversation_reads FOR ALL
USING (user_id = auth.uid());
