-- Create conversation_registry to track global state across instances
CREATE TABLE IF NOT EXISTS public.conversation_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT NOT NULL UNIQUE, -- e.g. remote JID or channel-specific ID
    current_instance_name TEXT REFERENCES public.instance_registry(instance_name),
    last_transfer_id UUID REFERENCES public.conversation_transfers(id),
    status TEXT DEFAULT 'active',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for conversation_registry
ALTER TABLE public.conversation_registry ENABLE ROW LEVEL SECURITY;

-- Policies for conversation_registry
CREATE POLICY "Members can view conversations in their instances" 
ON public.conversation_registry 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.instance_members 
        WHERE instance_members.instance_name = conversation_registry.current_instance_name 
        AND instance_members.user_id = auth.uid()
    )
);

-- Add transfer_reason_key to conversation_transfers for categorization
ALTER TABLE public.conversation_transfers 
ADD COLUMN IF NOT EXISTS transfer_reason_key TEXT;

-- Create instance_supervisors table for escalations
CREATE TABLE IF NOT EXISTS public.instance_supervisors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT REFERENCES public.instance_registry(instance_name) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    notification_preferences JSONB DEFAULT '{"email": true, "push": true}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(instance_name, user_id)
);

-- Enable RLS for instance_supervisors
ALTER TABLE public.instance_supervisors ENABLE ROW LEVEL SECURITY;

-- Supervisors can manage their own preferences
CREATE POLICY "Supervisors can manage their own rows" 
ON public.instance_supervisors 
FOR ALL 
USING (auth.uid() = user_id);

-- Admins can see all supervisors
CREATE POLICY "Admins can see all supervisors" 
ON public.instance_supervisors 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.instance_members 
        WHERE instance_members.role = 'admin' 
        AND instance_members.user_id = auth.uid()
    )
);
