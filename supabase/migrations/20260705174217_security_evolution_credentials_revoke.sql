-- ============================================================
-- Migration: security_evolution_credentials_revoke
-- Data: 2026-07-05
-- Audit: Fix 5/6 — Remover exposição de api_key via PostgREST
-- ============================================================

-- 1. Revogar acesso de roles públicas à view com credenciais
--    (api_key + instance_token ficam apenas acessíveis via service_role)
REVOKE ALL ON public.evolution_instance_credentials FROM authenticated;
REVOKE ALL ON public.evolution_instance_credentials FROM anon;

-- 2. Criar view segura sem campos sensíveis
CREATE OR REPLACE VIEW public.evolution_instances_public AS
  SELECT
    instance_name,
    api_url,
    display_name,
    department,
    health_status,
    last_health_check,
    online_instances,
    total_instances,
    is_active,
    updated_at
  FROM evo.evolution_instance_credentials;

COMMENT ON VIEW public.evolution_instances_public IS
  'View segura para consumo pelo frontend via PostgREST.
   Não expõe api_key nem instance_token.
   Criada em 2026-07-05 (audit Claude — fix storm 401).
   A view original public.evolution_instance_credentials
   permanece acessível apenas para service_role.';

-- 3. Grants corretos na nova view (somente leitura)
GRANT SELECT ON public.evolution_instances_public TO authenticated;
GRANT SELECT ON public.evolution_instances_public TO anon;
GRANT SELECT ON public.evolution_instances_public TO service_role;

-- 4. Validação inline
DO $$ DECLARE
  v_auth_grant int;
  v_safe_view  int;
  v_no_key     int;
BEGIN
  SELECT count(*) INTO v_auth_grant
  FROM information_schema.role_table_grants
  WHERE table_name = 'evolution_instance_credentials'
    AND table_schema = 'public'
    AND grantee IN ('authenticated', 'anon')
    AND privilege_type = 'SELECT';
  ASSERT v_auth_grant = 0,
    'FALHA: authenticated/anon ainda têm SELECT em evolution_instance_credentials!';

  SELECT count(*) INTO v_safe_view
  FROM information_schema.role_table_grants
  WHERE table_name = 'evolution_instances_public'
    AND table_schema = 'public'
    AND grantee = 'authenticated'
    AND privilege_type = 'SELECT';
  ASSERT v_safe_view = 1,
    'FALHA: authenticated não tem SELECT em evolution_instances_public!';

  SELECT count(*) INTO v_no_key
  FROM information_schema.columns
  WHERE table_name = 'evolution_instances_public'
    AND table_schema = 'public'
    AND column_name IN ('api_key', 'instance_token');
  ASSERT v_no_key = 0,
    'FALHA: api_key ou instance_token presentes na view segura!';

  RAISE NOTICE 'OK: Segurança de credenciais validada em 3/3 checks.';
END $$;
