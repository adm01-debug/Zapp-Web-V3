-- 1. Expansão da tabela departments
ALTER TABLE public.departments 
ADD COLUMN IF NOT EXISTS whatsapp_instance_id TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Vincular perfis a departamentos
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- 3. Tabela de convites para departamentos
CREATE TABLE IF NOT EXISTS public.department_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT DEFAULT 'pending',
    invited_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de recibos de leitura de mensagens de equipe
CREATE TABLE IF NOT EXISTS public.team_message_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES public.team_messages(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Função RPC para gerenciar membros de departamento
CREATE OR REPLACE FUNCTION public.manage_department_member(
    p_profile_id UUID,
    p_department_id UUID,
    p_action TEXT -- 'add' ou 'remove'
) RETURNS BOOLEAN AS $$
BEGIN
    IF p_action = 'add' THEN
        UPDATE public.profiles SET department_id = p_department_id WHERE id = p_profile_id;
    ELSIF p_action = 'remove' THEN
        UPDATE public.profiles SET department_id = NULL WHERE id = p_profile_id;
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RLS e Políticas
ALTER TABLE public.department_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_message_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invitations" ON public.department_invitations 
FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor'))
);

CREATE POLICY "Users view team receipts" ON public.team_message_receipts 
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users insert team receipts" ON public.team_message_receipts 
FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
