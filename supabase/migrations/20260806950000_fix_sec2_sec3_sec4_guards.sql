-- ============================================================================
-- FIX P0/P1 — SEC-2 (DoS idempotency), SEC-3 (info disclosure), SEC-4 (role disclosure)
-- ============================================================================
-- Tipo: FIX CRÍTICO DE SEGURANÇA (OWASP A01:2021 Broken Access Control)
--
-- SEC-2 (P0 — DoS seletivo via idempotency poisoning):
--   acquire_idempotency_lock, record_processed_request, check_duplicate_request,
--   record_ai_metrics têm GRANT EXECUTE a 'authenticated' sem guard auth.uid().
--   A UNIQUE constraint em processed_requests é em (request_id, action) SEM user_id.
--   Qualquer usuário autenticado pode bloquear a ação de outro usuário por 5 min:
--     SELECT acquire_idempotency_lock('req-vitima', 'payment', 'uuid-vitima')
--   → DoS seletivo em pagamentos, pedidos e outras ações críticas.
--   ESSAS FUNÇÕES SÃO CHAMADAS APENAS PELA EDGE FUNCTION ai-router COM service_role.
--   Não há chamada direta do frontend. REVOKE elimina o vetor sem impacto funcional.
--
-- SEC-3 (P1 — information disclosure — agente visibility):
--   get_visible_agent_ids(_user_id) sem guard: qualquer autenticado pode consultar
--   os agentes visíveis para qualquer outro usuário.
--   CORREÇÃO: guard que retorna conjunto vazio se _user_id ≠ auth.uid().
--
-- SEC-4 (P1 — information disclosure — hierarquia de roles/permissões):
--   has_role(_user_id, _role) e user_has_permission(_user_id, _permission_name) têm
--   GRANT a 'authenticated'. Qualquer autenticado pode consultar roles/permissões
--   de qualquer outro usuário. NÃO é possível revogar o GRANT — RLS policies
--   chamam essas funções com has_role(auth.uid(), ...) e precisam do GRANT externo.
--   CORREÇÃO: guard que retorna FALSE quando _user_id ≠ auth.uid().
--   Chamadas via RLS policies (auth.uid() == _user_id) continuam funcionando.
--
-- Detectado em: auditoria exaustiva 5 agentes — 2026-08-06
-- ============================================================================

-- ─── SEC-2: REVOKE EXECUTE FROM authenticated ────────────────────────────────
-- Funções server-side — chamadas APENAS pela Edge Function com service_role.
-- Usuários autenticados diretos via PostgREST = vetor de ataque sem uso legítimo.
REVOKE EXECUTE ON FUNCTION zapp.acquire_idempotency_lock(text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.record_processed_request(text, text, uuid, integer, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.check_duplicate_request(text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.record_ai_metrics(text, text, integer, text, uuid, text, jsonb) FROM authenticated;

-- ─── SEC-3: Guard em get_visible_agent_ids ────────────────────────────────────
-- Usuário só pode consultar agentes visíveis para si mesmo.
-- Guard: AND _user_id IS NOT DISTINCT FROM auth.uid() em ambas as branches do UNION.
CREATE OR REPLACE FUNCTION zapp.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'zapp'
AS $$
  SELECT p.id
  FROM zapp.profiles p
  WHERE p.user_id = _user_id
    AND _user_id IS NOT DISTINCT FROM auth.uid()
  UNION
  SELECT avg.can_see_agent_id
  FROM zapp.agent_visibility_grants avg
  JOIN zapp.profiles p ON p.id = avg.agent_id
  WHERE p.user_id = _user_id
    AND _user_id IS NOT DISTINCT FROM auth.uid()
    AND EXISTS (
      SELECT 1 FROM zapp.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = 'special_agent'
    )
$$;

COMMENT ON FUNCTION zapp.get_visible_agent_ids(uuid) IS
'FIX SEC-3 (2026-08-06): guard auth.uid() adicionado — usuário só pode consultar '
'agentes visíveis para si mesmo. Chamadas com _user_id de outro usuário retornam '
'conjunto vazio (em vez de expor visibilidade alheia).';

-- ─── SEC-4: Guard em has_role ─────────────────────────────────────────────────
-- Retorna FALSE em vez de dados reais quando _user_id ≠ auth.uid().
-- RLS policies que chamam has_role(auth.uid(), ...) continuam funcionando:
--   auth.uid() IS NOT DISTINCT FROM auth.uid() = TRUE → caminho normal.
-- Ataque de enumeração has_role(victim_uuid, ...) → FALSE imediato, sem acesso a DB.
CREATE OR REPLACE FUNCTION zapp.has_role(_user_id uuid, _role zapp.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'monitoring'
AS $$
  SELECT
    (_user_id IS NOT DISTINCT FROM auth.uid())
    AND EXISTS (
      SELECT 1 FROM zapp.user_roles
      WHERE user_id = _user_id AND role = _role
    )
$$;

COMMENT ON FUNCTION zapp.has_role(uuid, zapp.app_role) IS
'FIX SEC-4 (2026-08-06): guard auth.uid() adicionado — retorna FALSE quando '
'_user_id ≠ auth.uid(), bloqueando enumeração de roles de outros usuários. '
'Uso em RLS policies com has_role(auth.uid(), ...) permanece inalterado.';

-- ─── SEC-4: Guard em user_has_permission ──────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.user_has_permission(_user_id uuid, _permission_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'monitoring'
AS $$
  SELECT
    (_user_id IS NOT DISTINCT FROM auth.uid())
    AND EXISTS (
      SELECT 1 FROM zapp.user_roles ur
      JOIN zapp.role_permissions rp ON rp.role = ur.role
      JOIN zapp.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = _user_id
        AND p.name = _permission_name
    )
$$;

COMMENT ON FUNCTION zapp.user_has_permission(uuid, text) IS
'FIX SEC-4 (2026-08-06): guard auth.uid() adicionado — retorna FALSE quando '
'_user_id ≠ auth.uid(), bloqueando enumeração de permissões de outros usuários. '
'Uso em usePermissions.ts e ProtectedRoute.tsx com _user_id: user.id permanece inalterado.';
