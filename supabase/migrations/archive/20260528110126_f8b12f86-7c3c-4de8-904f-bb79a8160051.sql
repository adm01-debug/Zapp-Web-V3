-- Hardening messages RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Access control for messages" ON public.messages;
CREATE POLICY "Access control for messages"
ON public.messages
FOR SELECT
USING (
    -- Dev and Admin can see everything
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role IN ('dev', 'admin', 'manager')
    )
    OR
    -- Supervisors see messages from their queue's contacts (if they share a queue)
    EXISTS (
        SELECT 1 FROM public.queue_members qm
        JOIN public.contacts c ON c.queue_id = qm.queue_id
        WHERE qm.profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
        AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'supervisor')
        AND c.id = public.messages.contact_id
    )
    OR
    -- Agents see messages assigned to them
    EXISTS (
        SELECT 1 FROM public.contacts 
        WHERE id = public.messages.contact_id 
        AND assigned_to = auth.uid()
    )
);

-- Hardening whisper_messages (sensitive internal notes)
ALTER TABLE public.whisper_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Whispers are for internal staff only" ON public.whisper_messages;
CREATE POLICY "Whispers are for internal staff only"
ON public.whisper_messages
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role IN ('dev', 'admin', 'manager', 'supervisor', 'agent')
    )
);

-- Hardening global_settings
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Global settings are viewable by all staff" ON public.global_settings;
CREATE POLICY "Global settings are viewable by all staff"
ON public.global_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Only admins can modify global settings" ON public.global_settings;
CREATE POLICY "Only admins can modify global settings"
ON public.global_settings
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role IN ('dev', 'admin')
    )
);

-- Hardening whatsapp_connections
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view connections" ON public.whatsapp_connections;
CREATE POLICY "Staff can view connections"
ON public.whatsapp_connections
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Only admins can manage connections" ON public.whatsapp_connections;
CREATE POLICY "Only admins can manage connections"
ON public.whatsapp_connections
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role IN ('dev', 'admin')
    )
);

-- Ensure audit logs themselves are protected
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only admins/dev can view audit logs" ON public.audit_logs;
CREATE POLICY "Only admins/dev can view audit logs"
ON public.audit_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role IN ('dev', 'admin')
    )
);
