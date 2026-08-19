-- E20 follow-up: PostgREST self-hosted nao expoe o schema ops (db-schemas =
-- public, zapp, storage, graphql_public, artes, vendas, financeiro, logistica).
-- Wrapper em public para a RPC da regua, EXECUTE restrito a service_role.
-- JA APLICADA em producao em 2026-08-15 (smoke: I1=97 via wrapper).

CREATE OR REPLACE FUNCTION public.fn_boundary_audit()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$ SELECT ops.fn_boundary_audit() $$;

REVOKE ALL ON FUNCTION public.fn_boundary_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_boundary_audit() FROM anon;
REVOKE ALL ON FUNCTION public.fn_boundary_audit() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_boundary_audit() TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
