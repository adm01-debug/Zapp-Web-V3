-- Create instance_registry table
CREATE TABLE IF NOT EXISTS public.instance_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    owner_id UUID REFERENCES public.profiles(id),
    status TEXT DEFAULT 'inactive',
    connection_status TEXT DEFAULT 'disconnected',
    api_key TEXT,
    api_url TEXT,
    webhook_url TEXT,
    webhook_enabled BOOLEAN DEFAULT true,
    phone_number TEXT,
    profile_picture TEXT,
    is_master BOOLEAN DEFAULT false,
    proxy_host TEXT,
    proxy_port TEXT,
    proxy_user TEXT,
    proxy_pass TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    last_connected_at TIMESTAMP WITH TIME ZONE,
    message_count_sent INTEGER DEFAULT 0,
    message_count_received INTEGER DEFAULT 0,
    error_logs TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for instance_registry
ALTER TABLE public.instance_registry ENABLE ROW LEVEL SECURITY;

-- Create conversation_transfers table
CREATE TABLE IF NOT EXISTS public.conversation_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    from_agent_id UUID REFERENCES public.profiles(id),
    to_agent_id UUID REFERENCES public.profiles(id),
    from_queue_id UUID,
    to_queue_id UUID,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'completed', 'returned', 'canceled')),
    transfer_type TEXT NOT NULL DEFAULT 'direct' CHECK (transfer_type IN ('direct', 'queue', 'internal')),
    priority TEXT DEFAULT 'P3' CHECK (priority IN ('P1', 'P2', 'P3', 'P4')),
    sla_deadline TIMESTAMP WITH TIME ZONE,
    context_summary TEXT,
    return_reason TEXT,
    ticket_number TEXT NOT NULL UNIQUE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for conversation_transfers
ALTER TABLE public.conversation_transfers ENABLE ROW LEVEL SECURITY;

-- Create transfer_comments table
CREATE TABLE IF NOT EXISTS public.transfer_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES public.conversation_transfers(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES public.profiles(id),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for transfer_comments
ALTER TABLE public.transfer_comments ENABLE ROW LEVEL SECURITY;

-- Create sequence for ticket numbers if not exists
CREATE SEQUENCE IF NOT EXISTS transfer_ticket_seq;

-- Function to generate ticket numbers
CREATE OR REPLACE FUNCTION generate_transfer_ticket() 
RETURNS TEXT AS $$
DECLARE
    today TEXT := to_char(CURRENT_DATE, 'YYYYMMDD');
    seq_val INT;
BEGIN
    seq_val := nextval('transfer_ticket_seq');
    RETURN 'TRF-' || today || '-' || lpad(seq_val::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate ticket number
CREATE OR REPLACE FUNCTION trg_fn_set_transfer_ticket()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_number IS NULL THEN
        NEW.ticket_number := generate_transfer_ticket();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_transfer_ticket ON public.conversation_transfers;
CREATE TRIGGER trg_set_transfer_ticket
BEFORE INSERT ON public.conversation_transfers
FOR EACH ROW
EXECUTE FUNCTION trg_fn_set_transfer_ticket();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_instance_registry_updated_at ON public.instance_registry;
CREATE TRIGGER trg_instance_registry_updated_at
BEFORE UPDATE ON public.instance_registry
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_conversation_transfers_updated_at ON public.conversation_transfers;
CREATE TRIGGER trg_conversation_transfers_updated_at
BEFORE UPDATE ON public.conversation_transfers
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Views for Monitoring
-- Guard: conversation_transfers schema may differ; skip view if columns absent.
DO $v_pending_guard$ BEGIN
  EXECUTE $$
    CREATE OR REPLACE VIEW public.v_pending_transfers AS
    SELECT
        ct.*,
        c.name  AS contact_name,
        p_from.name AS from_agent_name,
        p_to.name   AS to_agent_name
    FROM  public.conversation_transfers ct
    JOIN  public.contacts c        ON ct.conversation_id = c.id
    LEFT JOIN public.profiles p_from ON ct.from_agent_id = p_from.id
    LEFT JOIN public.profiles p_to   ON ct.to_agent_id   = p_to.id
    WHERE ct.status = 'pending'
  $$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SKIP v_pending_transfers: %', SQLERRM;
END $v_pending_guard$;

-- RPC: Create Transfer
CREATE OR REPLACE FUNCTION public.fn_create_transfer(
    p_conversation_id UUID,
    p_from_agent_id UUID,
    p_to_agent_id UUID DEFAULT NULL,
    p_to_queue_id UUID DEFAULT NULL,
    p_transfer_type TEXT DEFAULT 'direct',
    p_priority TEXT DEFAULT 'P3',
    p_context_summary TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_transfer_id UUID;
BEGIN
    INSERT INTO public.conversation_transfers (
        conversation_id,
        from_agent_id,
        to_agent_id,
        to_queue_id,
        transfer_type,
        priority,
        context_summary,
        sla_deadline
    ) VALUES (
        p_conversation_id,
        p_from_agent_id,
        p_to_agent_id,
        p_to_queue_id,
        p_transfer_type,
        p_priority,
        p_context_summary,
        CASE 
            WHEN p_priority = 'P1' THEN NOW() + INTERVAL '15 minutes'
            WHEN p_priority = 'P2' THEN NOW() + INTERVAL '1 hour'
            WHEN p_priority = 'P3' THEN NOW() + INTERVAL '4 hours'
            ELSE NOW() + INTERVAL '24 hours'
        END
    ) RETURNING id INTO v_transfer_id;
    
    RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- RPC: Accept Transfer
CREATE OR REPLACE FUNCTION public.fn_accept_transfer(
    p_transfer_id UUID,
    p_agent_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.conversation_transfers
    SET 
        status = 'accepted',
        to_agent_id = p_agent_id,
        accepted_at = NOW()
    WHERE 
        id = p_transfer_id AND status = 'pending';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- RLS Policies (Basic)
CREATE POLICY "Enable read for authenticated users" ON public.instance_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable write for admins only" ON public.instance_registry FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Guard: conversation_transfers may lack from_agent_id/to_agent_id if schema differs.
DO $ct_pol_guard$ BEGIN
  EXECUTE $$CREATE POLICY "Enable read for relevant agents" ON public.conversation_transfers FOR SELECT TO authenticated USING (
    from_agent_id = auth.uid() OR to_agent_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
  )$$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SKIP policy Enable read for relevant agents: %', SQLERRM;
END $ct_pol_guard$;

CREATE POLICY "Enable insert for authenticated" ON public.conversation_transfers FOR INSERT TO authenticated WITH CHECK (true);

-- Guard: transfer_comments policies reference from_agent_id via subquery on conversation_transfers.
DO $tc_read_pol_guard$ BEGIN
  EXECUTE $$CREATE POLICY "Enable read for transfer participants" ON public.transfer_comments FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.conversation_transfers
        WHERE id = transfer_id AND (from_agent_id = auth.uid() OR to_agent_id = auth.uid())
    ) OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
  )$$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SKIP policy Enable read for transfer participants: %', SQLERRM;
END $tc_read_pol_guard$;

DO $tc_ins_pol_guard$ BEGIN
  EXECUTE $$CREATE POLICY "Enable insert for transfer participants" ON public.transfer_comments FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.conversation_transfers
        WHERE id = transfer_id AND (from_agent_id = auth.uid() OR to_agent_id = auth.uid())
    )
  )$$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SKIP policy Enable insert for transfer participants: %', SQLERRM;
END $tc_ins_pol_guard$;