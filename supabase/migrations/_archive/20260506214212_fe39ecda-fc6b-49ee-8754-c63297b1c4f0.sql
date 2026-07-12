-- Garante que o usuário autenticado possa ler perfis do seu próprio departamento
-- mas gestores (manager+) podem ler todos.

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Profiles visibility"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (public.has_role(auth.uid(), 'manager')) OR
  (public.has_role(auth.uid(), 'admin')) OR
  (public.has_role(auth.uid(), 'dev')) OR
  (department_id = (SELECT department_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)) OR
  (user_id = auth.uid())
);

-- Note: A tabela user_roles já possui RLS. 
-- Se profiles.role for usado para RBAC legado, deve-se garantir que 
-- a trigger de sincronização de papéis (se existir) esteja segura.
