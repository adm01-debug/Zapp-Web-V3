-- 1. Complete Transfer Comments Schema
ALTER TABLE public.transfer_comments 
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 2. Link Instance Registry to Departments
ALTER TABLE public.instance_registry 
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id);

-- 3. Unified Unread View for Operators
CREATE OR REPLACE VIEW public.v_user_unread AS
SELECT 
    m.user_id,
    m.instance_name,
    count(t.id) as unread_count,
    count(t.id) FILTER (WHERE t.priority = 4) as unread_urgent_count
FROM public.instance_members m
JOIN public.conversation_transfers t ON m.instance_name = t.target_instance
LEFT JOIN public.conversation_reads r ON (t.id = r.conversation_id AND m.user_id = r.user_id)
WHERE t.status IN ('pending', 'escalated')
  AND (r.read_at IS NULL OR r.read_at < t.updated_at)
GROUP BY m.user_id, m.instance_name;

-- 4. RLS for Violation Log
ALTER TABLE public.rls_violation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view violation logs" ON public.rls_violation_log;
CREATE POLICY "Admins can view violation logs"
ON public.rls_violation_log FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- 5. Business Hours Defaults
ALTER TABLE public.instance_registry 
  ALTER COLUMN config SET DEFAULT jsonb_build_object(
    'business_hours', jsonb_build_object(
      'monday', jsonb_build_object('enabled', true, 'open', '08:00', 'close', '18:00'),
      'tuesday', jsonb_build_object('enabled', true, 'open', '08:00', 'close', '18:00'),
      'wednesday', jsonb_build_object('enabled', true, 'open', '08:00', 'close', '18:00'),
      'thursday', jsonb_build_object('enabled', true, 'open', '08:00', 'close', '18:00'),
      'friday', jsonb_build_object('enabled', true, 'open', '08:00', 'close', '18:00'),
      'default_open', '08:00'
    )
  );
