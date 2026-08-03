-- =============================================================================
-- Etapa 4: Isolamento multi-tenant (ESCOPO REDUZIDO — senior dev assessment)
-- Achados: F5-16, F6-17
-- Risco: BAIXO (sistema single-tenant na prática — 1 workspace, 20.445 contatos)
-- =============================================================================
-- ROLLBACK:
--   R1: CREATE OR REPLACE FUNCTION zapp.get_default_workspace_id()
--        RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
--        SET search_path TO 'zapp'
--        AS $$ SELECT id FROM zapp.workspaces ORDER BY created_at LIMIT 1; $$;
--   R2: ALTER POLICY wconn_insert_auth ON zapp.whatsapp_connections
--        WITH CHECK ((created_by IS NULL) OR (created_by = auth.uid()));
--
-- VERIFICAÇÃO PRÉ-APLICAÇÃO (2026-08-02):
--   - workspaces: 1 row (single-tenant)
--   - evolution_contacts.assigned_to: 20.445 NULL (todos não-atribuídos)
--   - wconn_insert_auth: WITH CHECK ((created_by IS NULL) OR (created_by = auth.uid()))
--   - get_default_workspace_id: ORDER BY created_at LIMIT 1 (frágil)
-- =============================================================================

-- F5-16: Tornar get_default_workspace_id() workspace-aware
-- Antes: SELECT id FROM zapp.workspaces ORDER BY created_at LIMIT 1 (sempre o mais antigo)
-- Depois: usa o workspace do perfil do usuário autenticado
-- NOTA: sistema single-tenant hoje, mas a implementação antiga quebraria
-- silenciosamente se um segundo workspace fosse criado
CREATE OR REPLACE FUNCTION zapp.get_default_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'zapp'
AS $$
  SELECT w.id
  FROM zapp.workspaces w
  WHERE w.owner_id = (
    SELECT p.user_id
    FROM zapp.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1
  )
  UNION ALL
  -- Fallback: se o usuário não tem perfil, retorna o workspace mais antigo
  SELECT w.id
  FROM zapp.workspaces w
  ORDER BY w.created_at
  LIMIT 1
  LIMIT 1;
$$;

-- F6-17: Remover (created_by IS NULL) da policy wconn_insert_auth
-- Antes: WITH CHECK ((created_by IS NULL) OR (created_by = auth.uid()))
-- Depois: WITH CHECK (created_by = auth.uid())
-- O OR (created_by IS NULL) permitia INSERTs órfãos sem ownership
ALTER POLICY wconn_insert_auth ON zapp.whatsapp_connections
  WITH CHECK (created_by = auth.uid());
