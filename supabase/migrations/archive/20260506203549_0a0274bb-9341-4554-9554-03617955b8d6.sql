-- Create internal schema
CREATE SCHEMA IF NOT EXISTS auth_helpers;

-- Create has_role in auth_helpers
CREATE OR REPLACE FUNCTION auth_helpers.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create is_admin_or_supervisor in auth_helpers
CREATE OR REPLACE FUNCTION auth_helpers.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN auth_helpers.has_role(_user_id, 'admin') OR auth_helpers.has_role(_user_id, 'supervisor');
END;
$$;

-- Create overload for no args if needed (using auth.uid())
CREATE OR REPLACE FUNCTION auth_helpers.is_admin_or_supervisor()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN auth_helpers.is_admin_or_supervisor(auth.uid());
END;
$$;
