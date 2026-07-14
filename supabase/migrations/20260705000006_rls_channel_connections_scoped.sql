-- ==========================================================================
-- MELHORIA #3: RLS granular em zapp.channel_connections
-- ==========================================================================
-- Problema: auth_full_access com USING(true) FOR ALL permitia que qualquer
-- usuario autenticado (agente) fizesse INSERT/UPDATE/DELETE em conexoes
-- WhatsApp. Alem disso, a coluna `credentials` ficava exposta.
--
-- Fix: remover auth_full_access, criar politicas separadas por operacao:
--   SELECT: todos os authenticated (necessario para routing de mensagens)
--   INSERT: apenas admin, manager, supervisor
--   UPDATE: apenas admin, manager, supervisor
--   DELETE: apenas admin, manager
--   service_role: acesso total (mantido para webhooks e edge functions)
-- ==========================================================================

-- Remove a politica permissiva
DROP POLICY IF EXISTS auth_full_access ON zapp.channel_connections;

-- Selecao para todos os usuarios autenticados
CREATE POLICY IF NOT EXISTS channel_conn_select ON zapp.channel_connections
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: admin/manager/supervisor apenas
CREATE POLICY IF NOT EXISTS channel_conn_insert ON zapp.channel_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'supervisor'::public.app_role)
  );

-- UPDATE: admin/manager/supervisor apenas  
CREATE POLICY IF NOT EXISTS channel_conn_update ON zapp.channel_connections
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'supervisor'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role) OR
    public.has_role(auth.uid(), 'supervisor'::public.app_role)
  );

-- DELETE: admin/manager apenas
CREATE POLICY IF NOT EXISTS channel_conn_delete ON zapp.channel_connections
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'manager'::public.app_role)
  );

-- Verificacao pos-apply:
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'zapp' AND tablename = 'channel_connections';
-- Esperado: channel_conn_delete, channel_conn_insert, channel_conn_select,
--           channel_conn_update, service_full_access
