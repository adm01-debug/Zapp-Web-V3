-- =============================================================================
-- Migration: wrappers public.* das RPCs E2E (exposição PostgREST)
--
-- Contexto (2026-08-07): as RPCs de seed/validate/cleanup foram criadas em
-- zapp.* (20260807150000/20260807160000), mas o PostgREST do self-hosted só
-- expõe o schema public — chamadas REST com service_role retornavam 404
-- (o 401 sem auth é só o gate de JWT, antes do roteamento).
--
-- Padrão da casa (AGENTS.md): public é a camada de API (views security_invoker
-- + RPC); wrappers finos delegam ao schema-dono (zapp).
--
-- Rollback: DROP FUNCTION public.rpc_e2e_cleanup();
--           DROP FUNCTION public.rpc_e2e_seed_contacts();
--           DROP FUNCTION public.rpc_e2e_validate_user(text);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_e2e_cleanup()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp, public
AS $$ SELECT zapp.rpc_e2e_cleanup() $$;

CREATE OR REPLACE FUNCTION public.rpc_e2e_seed_contacts()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp, public
AS $$ SELECT zapp.rpc_e2e_seed_contacts() $$;

CREATE OR REPLACE FUNCTION public.rpc_e2e_validate_user(p_email text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp, public
AS $$ SELECT zapp.rpc_e2e_validate_user(p_email) $$;

REVOKE ALL ON FUNCTION public.rpc_e2e_cleanup() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_e2e_seed_contacts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_e2e_validate_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_cleanup() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_seed_contacts() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_e2e_validate_user(text) TO service_role, authenticated;
