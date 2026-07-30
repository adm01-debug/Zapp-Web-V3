-- Add department_id to team_conversations
ALTER TABLE public.team_conversations ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id);

-- Update is_team_conversation_member to handle departments
CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    conv_dept_id uuid;
    user_dept_id uuid;
    is_admin boolean;
BEGIN
    -- Get conversation department
    SELECT department_id INTO conv_dept_id FROM public.team_conversations WHERE id = _conversation_id;
    
    -- Check if user is admin (optional, but usually helpful)
    SELECT (role = 'admin') INTO is_admin FROM public.profiles WHERE user_id = _user_id;
    IF is_admin THEN
        RETURN true;
    END IF;

    -- If it's a department conversation
    IF conv_dept_id IS NOT NULL THEN
        SELECT department_id INTO user_dept_id FROM public.profiles WHERE user_id = _user_id;
        RETURN (conv_dept_id = user_dept_id);
    END IF;

    -- Otherwise, check standard membership in team_conversation_members
    RETURN EXISTS (
        SELECT 1 FROM public.team_conversation_members tcm
        JOIN public.profiles p ON p.id = tcm.profile_id
        WHERE tcm.conversation_id = _conversation_id
          AND p.user_id = _user_id
    );
END;
$function$;
