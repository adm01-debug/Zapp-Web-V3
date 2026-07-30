-- user_roles
DROP POLICY IF EXISTS "Only admins can manage roles" ON public.user_roles;
CREATE POLICY "Only admins can manage roles" ON public.user_roles
FOR ALL TO authenticated USING (auth_helpers.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users view own roles, admins view all" ON public.user_roles;
CREATE POLICY "Users view own roles, admins view all" ON public.user_roles
FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR auth_helpers.is_admin_or_supervisor(auth.uid()));

-- profiles
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles
FOR ALL TO authenticated USING (auth_helpers.has_role(auth.uid(), 'admin'));

-- chatbot_executions
DROP POLICY IF EXISTS "Authenticated can view chatbot executions" ON public.chatbot_executions;
CREATE POLICY "Authenticated can view chatbot executions" ON public.chatbot_executions
FOR SELECT TO authenticated USING (((contact_id IN ( SELECT c.id FROM public.contacts c WHERE (c.assigned_to IN ( SELECT p.id FROM public.profiles p WHERE (p.user_id = auth.uid()))))) OR auth_helpers.is_admin_or_supervisor(auth.uid())));

-- password_reset_requests
DROP POLICY IF EXISTS "Admins can delete password reset requests" ON public.password_reset_requests;
CREATE POLICY "Admins can delete password reset requests" ON public.password_reset_requests
FOR DELETE TO authenticated USING (auth_helpers.has_role(auth.uid(), 'admin'));
