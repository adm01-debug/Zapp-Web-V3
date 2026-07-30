
-- 1) profiles: remover policy permissiva "USING true" e a quebrada (id=auth.uid())
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by self" ON public.profiles;

-- 2) contact_notes: remover SELECT permissivo e INSERT sem validação de author
DROP POLICY IF EXISTS "Users view relevant contact notes" ON public.contact_notes;
DROP POLICY IF EXISTS "Users insert contact notes" ON public.contact_notes;

-- 3) instance_registry: corrigir condição quebrada (profiles.id -> profiles.user_id) e remover policy SELECT duplicada
DROP POLICY IF EXISTS "Enable write for admins only" ON public.instance_registry;
CREATE POLICY "Enable write for admins only"
  ON public.instance_registry
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Admin or Supervisor can view instance registry" ON public.instance_registry;
