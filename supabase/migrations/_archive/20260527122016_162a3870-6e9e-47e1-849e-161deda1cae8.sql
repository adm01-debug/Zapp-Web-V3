-- Create table for custom inbox scopes
CREATE TABLE IF NOT EXISTS public.inbox_custom_scopes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    icon TEXT, -- Lucide icon name
    filter_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Grant permissions for inbox_custom_scopes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_custom_scopes TO authenticated;
GRANT ALL ON public.inbox_custom_scopes TO service_role;

-- Enable RLS
ALTER TABLE public.inbox_custom_scopes ENABLE ROW LEVEL SECURITY;

-- Create policies for inbox_custom_scopes
CREATE POLICY "Custom scopes are viewable by everyone" ON public.inbox_custom_scopes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only admins can manage custom scopes" ON public.inbox_custom_scopes FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur 
        JOIN public.profiles p ON p.id = ur.user_id 
        WHERE p.id = auth.uid() AND ur.role::text = 'admin'
    )
);

-- Add channel-based permissions to permissions table
INSERT INTO public.permissions (id, name, description)
VALUES 
    (gen_random_uuid(), 'inbox.view_whatsapp', 'Permite visualizar conversas do canal WhatsApp'),
    (gen_random_uuid(), 'inbox.view_instagram', 'Permite visualizar conversas do canal Instagram'),
    (gen_random_uuid(), 'inbox.view_chat', 'Permite visualizar conversas do canal Web Chat')
ON CONFLICT (name) DO NOTHING;

-- Grant permissions for custom scopes to default roles
DO $$ 
DECLARE 
    whatsapp_perm_id UUID;
    instagram_perm_id UUID;
    chat_perm_id UUID;
BEGIN
    SELECT id INTO whatsapp_perm_id FROM public.permissions WHERE name = 'inbox.view_whatsapp';
    SELECT id INTO instagram_perm_id FROM public.permissions WHERE name = 'inbox.view_instagram';
    SELECT id INTO chat_perm_id FROM public.permissions WHERE name = 'inbox.view_chat';

    -- Give channel permissions to all roles by default
    INSERT INTO public.role_permissions (role, permission_id)
    SELECT r::public.app_role, whatsapp_perm_id FROM (VALUES ('admin'), ('manager'), ('supervisor'), ('agent')) AS roles(r)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.role_permissions (role, permission_id)
    SELECT r::public.app_role, instagram_perm_id FROM (VALUES ('admin'), ('manager'), ('supervisor'), ('agent')) AS roles(r)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.role_permissions (role, permission_id)
    SELECT r::public.app_role, chat_perm_id FROM (VALUES ('admin'), ('manager'), ('supervisor'), ('agent')) AS roles(r)
    ON CONFLICT DO NOTHING;
END $$;
