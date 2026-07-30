-- ============================================================
-- 1. departments table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT departments_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_departments_active ON public.departments(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_departments_slug ON public.departments(slug);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view departments" ON public.departments;
CREATE POLICY "Authenticated can view departments"
  ON public.departments FOR SELECT
  TO authenticated USING (true);

-- Split admin policies (avoid permissive ALL with WITH CHECK true issues)
DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
DROP POLICY IF EXISTS "Admins insert departments" ON public.departments;
DROP POLICY IF EXISTS "Admins update departments" ON public.departments;
DROP POLICY IF EXISTS "Admins delete departments" ON public.departments;

CREATE POLICY "Admins insert departments"
  ON public.departments FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update departments"
  ON public.departments FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete departments"
  ON public.departments FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_departments_updated_at ON public.departments;
CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. profiles.department_id
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_department_id ON public.profiles(department_id);

-- ============================================================
-- 3. Seed default departments
-- ============================================================
INSERT INTO public.departments (name, slug, description) VALUES
  ('Comercial',  'comercial',  'Equipe de vendas e relacionamento com clientes'),
  ('Financeiro', 'financeiro', 'Equipe financeira e cobrança'),
  ('Compras',    'compras',    'Equipe de compras e suprimentos'),
  ('Logística',  'logistica',  'Equipe de logística e entrega')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 4. Helper functions (SECURITY DEFINER, search_path locked)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_department(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.department_id
  FROM public.profiles p
  WHERE p.user_id = _user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_above(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('dev', 'admin', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_supervise_profile(_user_id uuid, _target_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_manager_or_above(_user_id)
    OR
    (
      public.has_role(_user_id, 'supervisor')
      AND public.get_user_department(_user_id) IS NOT NULL
      AND public.get_user_department(_user_id) = (
        SELECT department_id FROM public.profiles WHERE id = _target_profile_id LIMIT 1
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = _target_profile_id AND user_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.can_user_see_contact(_user_id uuid, _contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_manager_or_above(_user_id)
    OR
    (
      public.has_role(_user_id, 'supervisor')
      AND public.get_user_department(_user_id) IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.contacts c
        JOIN public.profiles p ON p.id = c.assigned_to
        WHERE c.id = _contact_id
          AND p.department_id = public.get_user_department(_user_id)
      )
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.contacts c
      JOIN public.profiles p ON p.id = c.assigned_to
      WHERE c.id = _contact_id AND p.user_id = _user_id
    );
$$;

-- ============================================================
-- 5. Update is_admin_or_supervisor to include manager
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('dev', 'admin', 'manager', 'supervisor')
  );
$$;

-- ============================================================
-- 6. Department-scoped contact visibility policy
-- ============================================================
DROP POLICY IF EXISTS "Department-scoped contact visibility" ON public.contacts;

CREATE POLICY "Department-scoped contact visibility"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (
    public.is_manager_or_above(auth.uid())
    OR
    (
      public.has_role(auth.uid(), 'supervisor')
      AND public.get_user_department(auth.uid()) IS NOT NULL
      AND assigned_to IN (
        SELECT id FROM public.profiles
        WHERE department_id = public.get_user_department(auth.uid())
      )
    )
    OR
    assigned_to IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );