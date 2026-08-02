-- 20260801140000_rls_gaps_validador_exaustivo.sql
-- Corrige 12 GAPs encontrados pela validação exaustiva pós-aplicação (300 testes, 2026-08-01)
-- Metodologia: RLS Matrix (133 tabelas x 3 roles) + varredura de policies USING(true) residuais
-- + testes de escrita (WITH CHECK) + SECDEF funcional (positivo/negativo)

-- ============================================================
-- GAP 1: email_app.meta_capi_events — auth_full_access USING(true) residual
-- (base da view zapp.meta_capi_events; eventos com contact_id)
-- ============================================================
DROP POLICY IF EXISTS "auth_full_access" ON email_app.meta_capi_events;
CREATE POLICY auth_secure_133 ON email_app.meta_capi_events FOR ALL TO authenticated
  USING ((contact_id IS NULL OR zapp.is_contact_visible_to_user(contact_id, auth.uid())) OR zapp.is_admin_or_supervisor())
  WITH CHECK (zapp.is_admin_or_supervisor());

-- ============================================================
-- GAP 2: zapp.system_connections — config (credenciais) legível por qualquer authenticated
-- ============================================================
DROP POLICY IF EXISTS "system_connections_read_authenticated" ON zapp.system_connections;

-- ============================================================
-- GAP 3: zapp.stickers — stickers_select_all residual (duplicada da auth_secure_110)
-- ============================================================
DROP POLICY IF EXISTS "stickers_select_all" ON zapp.stickers;

-- ============================================================
-- GAP 4: zapp.queues — authenticated_write_queues/q_modify ALL true (agent criava/deletava filas)
-- ============================================================
DROP POLICY IF EXISTS "authenticated_write_queues" ON zapp.queues;
DROP POLICY IF EXISTS "q_modify" ON zapp.queues;
CREATE POLICY auth_secure_134 ON zapp.queues FOR ALL TO authenticated
  USING (true)
  WITH CHECK (zapp.is_admin_or_supervisor());

-- ============================================================
-- GAP 5: zapp.provider_sessions — "Authenticated read sessions" SELECT true (metadata providers)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated read sessions" ON zapp.provider_sessions;

-- ============================================================
-- GAP 6: zapp.profiles — authenticated_read_profiles SELECT true (PII global); DELETE table-level
-- Novo: user_id próprio OR admin OR visíveis (get_visible_agent_ids); DELETE revogado
-- ============================================================
DROP POLICY IF EXISTS "authenticated_read_profiles" ON zapp.profiles;
CREATE POLICY auth_secure_135 ON zapp.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor()
         OR user_id IN (SELECT zapp.get_visible_agent_ids(auth.uid())));
REVOKE DELETE ON zapp.profiles FROM authenticated;

-- ============================================================
-- GAP 7: zapp.whatsapp_connections — auth_secure_123 ALL permitia agent DELETAR conexões (USING p/ DELETE)
-- Novo: SELECT agent/admin; escrita via whatsapp_connections_admin_write + wconn_insert_auth
-- ============================================================
DROP POLICY IF EXISTS auth_secure_123 ON zapp.whatsapp_connections;
CREATE POLICY auth_secure_123 ON zapp.whatsapp_connections FOR SELECT TO authenticated
  USING (zapp.has_role(auth.uid(), 'agent') OR zapp.is_admin_or_supervisor());

-- ============================================================
-- GAP 8: zapp.sessions — auth_access ALL true (sessões de todos); sem uso no front
-- ============================================================
DROP POLICY IF EXISTS "auth_access" ON zapp.sessions;
CREATE POLICY auth_secure_136 ON zapp.sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor());

-- ============================================================
-- GAP 9: zapp.webhook_endpoints — auth_access ALL true; sem uso no front
-- ============================================================
DROP POLICY IF EXISTS "auth_access" ON zapp.webhook_endpoints;
CREATE POLICY auth_secure_137 ON zapp.webhook_endpoints FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor());

-- ============================================================
-- GAP 10-14: infra/admin (sem uso no front) — webhook_events, dead_letter_queue,
-- message_queue, forensic_snapshots, queue_items
-- ============================================================
DROP POLICY IF EXISTS "auth_full_access" ON zapp.webhook_events;
CREATE POLICY auth_secure_138 ON zapp.webhook_events FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

DROP POLICY IF EXISTS "auth_full_access" ON zapp.dead_letter_queue;
CREATE POLICY auth_secure_139 ON zapp.dead_letter_queue FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

DROP POLICY IF EXISTS "auth_rw" ON zapp.message_queue;
CREATE POLICY auth_secure_140 ON zapp.message_queue FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

DROP POLICY IF EXISTS "auth_full_access" ON zapp.forensic_snapshots;
CREATE POLICY auth_secure_141 ON zapp.forensic_snapshots FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

DROP POLICY IF EXISTS "auth_full_access" ON zapp.queue_items;
CREATE POLICY auth_secure_142 ON zapp.queue_items FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

-- ============================================================
-- GAP 15: zapp.search_insights — search_term bruto; página admin sem guard no hook
-- ============================================================
DROP POLICY IF EXISTS "auth_select_search_insights" ON zapp.search_insights;
CREATE POLICY auth_secure_143 ON zapp.search_insights FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

-- ============================================================
-- GAP 16: zapp.colaboradores — chave_pix (dado financeiro) legível por todos
-- ============================================================
DROP POLICY IF EXISTS "auth_full_access" ON zapp.colaboradores;
CREATE POLICY auth_secure_144 ON zapp.colaboradores FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

-- ============================================================
-- GAP 17: zapp.empresas — leitura ampla (escrita já tinha guard admin/supervisor)
-- ============================================================
DROP POLICY IF EXISTS "empresas_select" ON zapp.empresas;
CREATE POLICY auth_secure_145 ON zapp.empresas FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());

-- ============================================================
-- GAP 18: zapp.rpc_dispatch_error_stats — REVOKE (sem uso no front; coluna acao corrompida no CSV)
-- ============================================================
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION zapp.rpc_dispatch_error_stats(p_hours integer) FROM authenticated;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'zapp.rpc_dispatch_error_stats(integer) não existe neste ambiente — REVOKE ignorado';
END $$;
