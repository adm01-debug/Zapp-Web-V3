-- Grant execute on new helpers to authenticated
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth_helpers TO authenticated;

-- Revoke execute from public versions for authenticated/anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_supervisor() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_supervisor() FROM anon;
