-- Department Invitations Table
CREATE TABLE IF NOT EXISTS public.department_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    code TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER,
    uses INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on invitations
ALTER TABLE public.department_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invitations"
ON public.department_invitations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Anyone authenticated can view active invitations"
ON public.department_invitations
FOR SELECT
USING (is_active AND (expires_at IS NULL OR expires_at > now()));

-- Function to create/update department
CREATE OR REPLACE FUNCTION public.upsert_department(
    _admin_user_id uuid,
    _id uuid,
    _name text,
    _description text,
    _is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _is_admin boolean;
    _final_id uuid;
    _action text;
BEGIN
    SELECT (role = 'admin') INTO _is_admin FROM public.profiles WHERE user_id = _admin_user_id;
    IF NOT _is_admin THEN
        RAISE EXCEPTION 'Acesso negado';
    END IF;

    IF _id IS NULL THEN
        INSERT INTO public.departments (name, description, is_active)
        VALUES (_name, _description, _is_active)
        RETURNING id INTO _final_id;
        _action := 'CREATE_DEPARTMENT';
    ELSE
        UPDATE public.departments 
        SET name = _name, description = _description, is_active = _is_active, updated_at = now()
        WHERE id = _id;
        _final_id := _id;
        _action := 'UPDATE_DEPARTMENT';
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (_admin_user_id, _action, 'department', _final_id, 
            jsonb_build_object('name', _name, 'description', _description));

    RETURN _final_id;
END;
$function$;

-- Function to join department via code
CREATE OR REPLACE FUNCTION public.join_department_via_code(
    _user_id uuid,
    _code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _invitation record;
    _profile_id uuid;
    _dept_name text;
BEGIN
    -- Find invitation
    SELECT * INTO _invitation FROM public.department_invitations 
    WHERE code = _code AND is_active = true AND (expires_at IS NULL OR expires_at > now());

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Convite inválido ou expirado';
    END IF;

    IF _invitation.max_uses IS NOT NULL AND _invitation.uses >= _invitation.max_uses THEN
        RAISE EXCEPTION 'Este convite atingiu o limite de usos';
    END IF;

    -- Get profile
    SELECT id INTO _profile_id FROM public.profiles WHERE user_id = _user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;

    -- Get department name
    SELECT name INTO _dept_name FROM public.departments WHERE id = _invitation.department_id;

    -- Update profile
    UPDATE public.profiles 
    SET department_id = _invitation.department_id,
        department = _dept_name
    WHERE id = _profile_id;

    -- Increment uses
    UPDATE public.department_invitations SET uses = uses + 1 WHERE id = _invitation.id;

    -- Audit
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (_user_id, 'JOIN_VIA_LINK', 'department', _invitation.department_id, 
            jsonb_build_object('invitation_code', _code, 'department_name', _dept_name));
END;
$function$;
