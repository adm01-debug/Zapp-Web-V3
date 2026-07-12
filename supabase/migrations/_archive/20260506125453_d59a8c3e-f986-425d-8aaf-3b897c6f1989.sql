-- 1. Instance Registry
CREATE TABLE public.instance_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    slot_name TEXT,
    department TEXT,
    usage_type TEXT CHECK (usage_type IN ('individual', 'shared')),
    operator_name TEXT,
    operator_email TEXT,
    operator_since TIMESTAMP WITH TIME ZONE,
    operator_phone TEXT,
    phone_number TEXT,
    is_active BOOLEAN DEFAULT true,
    webhook_url TEXT,
    webhook_enabled BOOLEAN DEFAULT true,
    max_concurrent_chats INT DEFAULT 50,
    sla_first_response_minutes INT DEFAULT 30,
    sla_resolution_hours INT DEFAULT 24,
    auto_reply_enabled BOOLEAN DEFAULT false,
    auto_reply_message TEXT,
    business_hours_enabled BOOLEAN DEFAULT false,
    bitrix_integration JSONB DEFAULT '{}'::jsonb,
    n8n_workflows JSONB DEFAULT '{}'::jsonb,
    config JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Transfers System
CREATE TABLE public.conversation_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number SERIAL,
    source_instance TEXT NOT NULL REFERENCES public.instance_registry(instance_name),
    source_conversation_id UUID,
    source_message_id UUID,
    source_operator TEXT,
    target_instance TEXT NOT NULL REFERENCES public.instance_registry(instance_name),
    target_conversation_id UUID,
    target_operator TEXT,
    contact_id UUID,
    remote_jid TEXT NOT NULL,
    contact_name TEXT,
    transfer_type TEXT CHECK (transfer_type IN ('internal', 'direct')),
    category TEXT,
    reason TEXT NOT NULL,
    context_summary TEXT,
    context_messages JSONB DEFAULT '[]'::jsonb,
    tags TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'returned', 'rejected', 'expired', 'cancelled')),
    priority INT DEFAULT 2 CHECK (priority BETWEEN 1 AND 4),
    resolution_notes TEXT,
    resolution_type TEXT,
    idempotency_key UUID UNIQUE,
    parent_transfer_id UUID REFERENCES public.conversation_transfers(id),
    first_response_at TIMESTAMP WITH TIME ZONE,
    accepted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    escalated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Comments for Transfers
CREATE TABLE public.transfer_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES public.conversation_transfers(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    author_instance TEXT NOT NULL,
    content TEXT NOT NULL,
    mentioned_users UUID[] DEFAULT '{}',
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Shared Read Status
CREATE TABLE public.conversation_reads (
    conversation_id UUID NOT NULL,
    user_id UUID NOT NULL,
    last_read_message_id TEXT,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);

-- 5. Instance Membership (Security)
CREATE TABLE public.instance_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL REFERENCES public.instance_registry(instance_name),
    user_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('agent', 'supervisor', 'viewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (instance_name, user_id)
);

-- 6. Trigger for SLA and Timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_instance_registry_updated_at BEFORE UPDATE ON public.instance_registry FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_transfers_updated_at BEFORE UPDATE ON public.conversation_transfers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SLA Logic
CREATE OR REPLACE FUNCTION public.trg_transfer_auto_sla()
RETURNS TRIGGER AS $$
BEGIN
    NEW.expires_at := CASE 
        WHEN NEW.priority = 4 THEN now() + interval '2 hours'
        WHEN NEW.priority = 3 THEN now() + interval '4 hours'
        WHEN NEW.priority = 2 THEN now() + interval '8 hours'
        ELSE now() + interval '24 hours'
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transfer_auto_sla BEFORE INSERT ON public.conversation_transfers FOR EACH ROW EXECUTE FUNCTION public.trg_transfer_auto_sla();

-- 7. Atomic Functions
CREATE OR REPLACE FUNCTION public.fn_accept_transfer(p_transfer_id UUID, p_operator_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result public.conversation_transfers;
BEGIN
    UPDATE public.conversation_transfers
    SET status = 'accepted',
        target_operator = p_operator_name,
        accepted_at = now()
    WHERE id = p_transfer_id 
      AND status = 'pending'
    RETURNING * INTO v_result;

    IF v_result.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Transfer already accepted or not pending');
    END IF;

    RETURN jsonb_build_object('ok', true, 'data', to_jsonb(v_result));
END;
$$;

-- 8. Enable RLS
ALTER TABLE public.instance_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instance_members ENABLE ROW LEVEL SECURITY;

-- 9. Secure Policies
CREATE POLICY "Users can view members of their own instances"
ON public.instance_members FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.instance_members AS m
    WHERE m.instance_name = instance_members.instance_name 
    AND m.user_id = auth.uid()
));

CREATE POLICY "Agents can view transfers for their instances"
ON public.conversation_transfers FOR SELECT
USING (
    source_instance IN (SELECT instance_name FROM public.instance_members WHERE user_id = auth.uid())
    OR 
    target_instance IN (SELECT instance_name FROM public.instance_members WHERE user_id = auth.uid())
);
