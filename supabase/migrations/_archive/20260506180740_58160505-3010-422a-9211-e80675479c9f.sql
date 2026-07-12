-- Create the conversations table as expected by the UI
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES public.contacts(id),
    remote_jid TEXT,
    status TEXT DEFAULT 'open',
    assigned_to UUID REFERENCES public.profiles(id),
    department TEXT,
    subject TEXT,
    priority TEXT DEFAULT 'normal',
    labels TEXT[] DEFAULT '{}',
    message_count INTEGER DEFAULT 0,
    unread_count INTEGER DEFAULT 0,
    first_message_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    last_message_content TEXT,
    last_message_type TEXT,
    first_response_at TIMESTAMPTZ,
    first_response_seconds INTEGER,
    resolution_at TIMESTAMPTZ,
    resolution_seconds INTEGER,
    is_bot_active BOOLEAN DEFAULT FALSE,
    satisfaction_score NUMERIC,
    instance_name TEXT DEFAULT 'wpp2',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Allow all for now so the user can test
CREATE POLICY "Public full access to conversations" ON public.conversations FOR ALL USING (true);

-- Populate with mock data based on the contacts created earlier
INSERT INTO public.conversations (
    contact_id,
    remote_jid,
    status,
    assigned_to,
    priority,
    message_count,
    unread_count,
    last_message_at,
    last_message_content,
    last_message_type,
    instance_name,
    created_at
)
SELECT 
    id,
    phone || '@s.whatsapp.net',
    'open',
    assigned_to,
    CASE WHEN random() > 0.8 THEN 'high' ELSE 'normal' END,
    6,
    (random()*5)::int,
    NOW() - (random()*24 || ' hours')::interval,
    'Última mensagem enviada por ' || name,
    'text',
    'wpp2',
    NOW() - (random()*5 || ' days')::interval
FROM public.contacts
WHERE name LIKE 'Mock Contact %';
