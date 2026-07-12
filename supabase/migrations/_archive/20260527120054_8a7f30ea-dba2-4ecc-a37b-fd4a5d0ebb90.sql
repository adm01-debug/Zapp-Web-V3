-- Atualizar políticas de contatos para serem baseadas em permissões dinâmicas
DROP POLICY IF EXISTS "Admins can view all contacts including unassigned" ON public.contacts;
DROP POLICY IF EXISTS "contacts_select_policy" ON public.contacts;

CREATE POLICY "contacts_select_dynamic_policy" ON public.contacts
FOR SELECT
TO authenticated
USING (
  user_has_permission(auth.uid(), 'inbox.view_all')
  OR (
    user_has_permission(auth.uid(), 'inbox.view_department')
    AND (
      assigned_to IS NULL 
      OR assigned_to IN (
        SELECT p.id FROM profiles p 
        WHERE p.department_id = (SELECT department_id FROM profiles WHERE user_id = auth.uid())
      )
    )
  )
  OR (
    assigned_to = (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
);

-- Garantir que a tabela de auditoria tenha RLS e permissões corretas
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own audit logs" 
ON public.audit_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (user_has_permission(auth.uid(), 'security.view_logs') OR user_has_permission(auth.uid(), 'admin.all'));

GRANT INSERT ON public.audit_logs TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
