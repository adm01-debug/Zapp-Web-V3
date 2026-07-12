-- Function to manage department members
CREATE OR REPLACE FUNCTION public.manage_department_member(
    _admin_user_id uuid,
    _target_profile_id uuid,
    _department_id uuid,
    _action text -- 'add' or 'remove'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _is_admin boolean;
    _dept_name text;
    _target_name text;
BEGIN
    -- Check if requester is admin
    SELECT (role = 'admin') INTO _is_admin FROM public.profiles WHERE user_id = _admin_user_id;
    IF NOT _is_admin THEN
        RAISE EXCEPTION 'Acesso negado: Apenas administradores podem gerenciar departamentos';
    END IF;

    -- Get department and profile info for audit
    SELECT name INTO _dept_name FROM public.departments WHERE id = _department_id;
    SELECT name INTO _target_name FROM public.profiles WHERE id = _target_profile_id;

    IF _action = 'add' THEN
        UPDATE public.profiles 
        SET department_id = _department_id,
            department = _dept_name
        WHERE id = _target_profile_id;

        -- Log audit
        INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (_admin_user_id, 'ADD_MEMBER', 'department', _department_id, 
                jsonb_build_object('profile_id', _target_profile_id, 'profile_name', _target_name, 'department_name', _dept_name));
    
    ELSIF _action = 'remove' THEN
        UPDATE public.profiles 
        SET department_id = NULL,
            department = NULL
        WHERE id = _target_profile_id AND department_id = _department_id;

        -- Log audit
        INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (_admin_user_id, 'REMOVE_MEMBER', 'department', _department_id, 
                jsonb_build_object('profile_id', _target_profile_id, 'profile_name', _target_name, 'department_name', _dept_name));
    END IF;
END;
$function$;

-- Ensure RLS on audit_logs allows admins to view
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
ON public.audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);
