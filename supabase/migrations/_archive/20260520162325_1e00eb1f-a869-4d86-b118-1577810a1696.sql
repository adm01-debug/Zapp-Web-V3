-- Drop dependent objects
DROP VIEW IF EXISTS public.v_pending_transfers CASCADE;
DROP VIEW IF EXISTS public.v_transfer_metrics CASCADE;

-- Drop constraints that might cause type mismatch during ALTER
ALTER TABLE public.conversation_transfers DROP CONSTRAINT IF EXISTS conversation_transfers_priority_check;

-- Align columns
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversation_transfers' AND column_name = 'conversation_id') THEN
        ALTER TABLE public.conversation_transfers RENAME COLUMN conversation_id TO source_conversation_id;
    END IF;
END $$;

ALTER TABLE public.conversation_transfers
ADD COLUMN IF NOT EXISTS source_instance TEXT,
ADD COLUMN IF NOT EXISTS source_message_id UUID,
ADD COLUMN IF NOT EXISTS source_operator TEXT,
ADD COLUMN IF NOT EXISTS target_instance TEXT,
ADD COLUMN IF NOT EXISTS target_conversation_id UUID,
ADD COLUMN IF NOT EXISTS target_operator TEXT,
ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id),
ADD COLUMN IF NOT EXISTS remote_jid TEXT,
ADD COLUMN IF NOT EXISTS contact_name TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS reason TEXT,
ADD COLUMN IF NOT EXISTS context_messages JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
ADD COLUMN IF NOT EXISTS resolution_type TEXT;

-- Priority conversion
ALTER TABLE public.conversation_transfers ALTER COLUMN priority DROP DEFAULT;

ALTER TABLE public.conversation_transfers 
ALTER COLUMN priority TYPE INTEGER 
USING (
    CASE 
        WHEN priority = 'P1' THEN 1
        WHEN priority = 'P2' THEN 2
        WHEN priority = 'P3' THEN 3
        WHEN priority = 'P4' THEN 4
        WHEN priority ~ '^\d+$' THEN priority::integer
        ELSE 2
    END
);

ALTER TABLE public.conversation_transfers ALTER COLUMN priority SET DEFAULT 2;

-- Align transfer_comments
ALTER TABLE public.transfer_comments 
ADD COLUMN IF NOT EXISTS author_name TEXT,
ADD COLUMN IF NOT EXISTS author_instance TEXT;

-- RPCs
CREATE OR REPLACE FUNCTION public.fn_create_transfer(
    p_source_instance TEXT,
    p_target_instance TEXT,
    p_remote_jid TEXT,
    p_reason TEXT,
    p_category TEXT,
    p_priority INTEGER DEFAULT 2,
    p_transfer_type TEXT DEFAULT 'internal',
    p_source_operator TEXT DEFAULT NULL,
    p_context_summary TEXT DEFAULT NULL,
    p_tags TEXT[] DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_transfer_id UUID;
BEGIN
    INSERT INTO public.conversation_transfers (
        source_instance, target_instance, remote_jid,
        reason, category, priority, transfer_type, source_operator,
        context_summary, tags, status, expires_at
    ) VALUES (
        p_source_instance, p_target_instance, p_remote_jid,
        p_reason, p_category, p_priority, p_transfer_type, p_source_operator,
        p_context_summary, p_tags, 'pending',
        CASE 
            WHEN p_priority = 4 THEN NOW() + INTERVAL '2 hours'
            WHEN p_priority = 3 THEN NOW() + INTERVAL '4 hours'
            WHEN p_priority = 2 THEN NOW() + INTERVAL '8 hours'
            ELSE NOW() + INTERVAL '24 hours'
        END
    ) RETURNING id INTO v_transfer_id;

    RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_accept_transfer(p_transfer_id UUID, p_operator TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.conversation_transfers SET status = 'accepted', target_operator = p_operator, accepted_at = NOW()
    WHERE id = p_transfer_id AND status = 'pending';
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_complete_transfer(p_transfer_id UUID, p_notes TEXT, p_type TEXT DEFAULT 'resolved')
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.conversation_transfers SET status = 'completed', resolution_notes = p_notes, resolution_type = p_type, completed_at = NOW()
    WHERE id = p_transfer_id AND status IN ('accepted', 'in_progress');
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_return_transfer(p_transfer_id UUID, p_reason TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.conversation_transfers SET status = 'returned', resolution_notes = p_reason, resolution_type = 'returned', completed_at = NOW()
    WHERE id = p_transfer_id AND status IN ('accepted', 'in_progress');
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_transfer_comment(p_transfer_id UUID, p_author TEXT, p_instance TEXT, p_content TEXT)
RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
    INSERT INTO public.transfer_comments (transfer_id, author_name, author_instance, content)
    VALUES (p_transfer_id, p_author, p_instance, p_content) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate Monitoring View
CREATE OR REPLACE VIEW public.v_pending_transfers AS
SELECT 
    target_instance,
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    COUNT(*) FILTER (WHERE status = 'pending' AND priority = 4) as urgente,
    COUNT(*) FILTER (WHERE status = 'pending' AND priority = 3) as alta,
    COUNT(*) FILTER (WHERE status = 'pending' AND expires_at < NOW()) as sla_estourado,
    MIN(created_at) as mais_antiga
FROM 
    public.conversation_transfers
GROUP BY 
    target_instance;
