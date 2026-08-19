-- Runbook-2 (05/08/2026): Restrição de policies PII (item C-1)
-- ===========================================================================
-- Sync repo x DB: 16 policies de leitura foram restritas diretamente no banco
-- pelos agentes do runbook-2 em 05-06/08/2026, SEM cobertura versionada.
-- Esta migration alinha o repo ao banco canônico (repo = banco) e torna o
-- estado reproduzível.
--
-- Estado real verificado em pg_policies (2026-08-06, todas TO authenticated):
--   financeiro.colaboradores/destinatarios/emprestimos/vendas_parcelas/
--     pedido_kits/solicitacoes_alteracao_valor:
--       SELECT  -> USING (financeiro.fn_app_role() IS NOT NULL)
--   vendas.usuarios/fornecedores/coletas (SELECT; fornecedores tem tb ALL):
--       USING (EXISTS (SELECT 1 FROM vendas.usuarios u
--              WHERE u.id = auth.uid() AND u.ativo AND u.perfil IN ('admin','comprador')))
--   vendas.ordens_compra (2 policies SELECT):
--       USING (EXISTS(...) OR financeiro.fn_app_role() IS NOT NULL)
--   zapp.media_download_queue/media_quarantine/media_security_alerts/sla_violations:
--       SELECT -> USING (zapp.is_admin_or_supervisor())
--
-- Padrão idempotente: DROP POLICY IF EXISTS + CREATE POLICY (PostgreSQL não tem
-- CREATE POLICY IF NOT EXISTS). Re-aplicação é um no-op com definição idêntica.
-- ===========================================================================

-- financeiro.colaboradores
DROP POLICY IF EXISTS fin_colaboradores_auth_select ON financeiro.colaboradores;
CREATE POLICY fin_colaboradores_auth_select ON financeiro.colaboradores
  FOR SELECT TO authenticated
  USING (financeiro.fn_app_role() IS NOT NULL);

-- financeiro.destinatarios
DROP POLICY IF EXISTS anon_select ON financeiro.destinatarios;
CREATE POLICY anon_select ON financeiro.destinatarios
  FOR SELECT TO authenticated
  USING (financeiro.fn_app_role() IS NOT NULL);

-- financeiro.emprestimos
DROP POLICY IF EXISTS fin_emprestimos_auth_select ON financeiro.emprestimos;
CREATE POLICY fin_emprestimos_auth_select ON financeiro.emprestimos
  FOR SELECT TO authenticated
  USING (financeiro.fn_app_role() IS NOT NULL);

-- financeiro.vendas_parcelas
DROP POLICY IF EXISTS vp_select ON financeiro.vendas_parcelas;
CREATE POLICY vp_select ON financeiro.vendas_parcelas
  FOR SELECT TO authenticated
  USING (financeiro.fn_app_role() IS NOT NULL);

-- financeiro.pedido_kits
DROP POLICY IF EXISTS anon_select_pedido_kits ON financeiro.pedido_kits;
CREATE POLICY anon_select_pedido_kits ON financeiro.pedido_kits
  FOR SELECT TO authenticated
  USING (financeiro.fn_app_role() IS NOT NULL);

-- financeiro.solicitacoes_alteracao_valor
DROP POLICY IF EXISTS p_sav_select ON financeiro.solicitacoes_alteracao_valor;
CREATE POLICY p_sav_select ON financeiro.solicitacoes_alteracao_valor
  FOR SELECT TO authenticated
  USING (financeiro.fn_app_role() IS NOT NULL);

-- vendas.usuarios
DROP POLICY IF EXISTS p_usuarios_anon_select ON vendas.usuarios;
CREATE POLICY p_usuarios_anon_select ON vendas.usuarios
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendas.usuarios u
      WHERE u.id = auth.uid() AND u.ativo AND u.perfil IN ('admin','comprador')
    )
  );

-- vendas.fornecedores (SELECT)
DROP POLICY IF EXISTS p_fornecedores_select ON vendas.fornecedores;
CREATE POLICY p_fornecedores_select ON vendas.fornecedores
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendas.usuarios u
      WHERE u.id = auth.uid() AND u.ativo AND u.perfil IN ('admin','comprador')
    )
  );

-- vendas.fornecedores (ALL)
DROP POLICY IF EXISTS p_fornecedores_write ON vendas.fornecedores;
CREATE POLICY p_fornecedores_write ON vendas.fornecedores
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendas.usuarios u
      WHERE u.id = auth.uid() AND u.ativo AND u.perfil IN ('admin','comprador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vendas.usuarios u
      WHERE u.id = auth.uid() AND u.ativo AND u.perfil IN ('admin','comprador')
    )
  );

-- vendas.coletas
DROP POLICY IF EXISTS coletas_select_all ON vendas.coletas;
CREATE POLICY coletas_select_all ON vendas.coletas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vendas.usuarios u
      WHERE u.id = auth.uid() AND u.ativo AND u.perfil IN ('admin','comprador')
    )
  );

-- vendas.ordens_compra (2 policies: anon + authenticated, mesma expressão)
DROP POLICY IF EXISTS p_ordens_anon_select ON vendas.ordens_compra;
CREATE POLICY p_ordens_anon_select ON vendas.ordens_compra
  FOR SELECT TO authenticated
  USING (
    (
      EXISTS (
        SELECT 1 FROM vendas.usuarios u
        WHERE u.id = auth.uid() AND u.ativo AND u.perfil IN ('admin','comprador')
      )
    )
    OR (financeiro.fn_app_role() IS NOT NULL)
  );

DROP POLICY IF EXISTS p_ordens_authenticated_select ON vendas.ordens_compra;
CREATE POLICY p_ordens_authenticated_select ON vendas.ordens_compra
  FOR SELECT TO authenticated
  USING (
    (
      EXISTS (
        SELECT 1 FROM vendas.usuarios u
        WHERE u.id = auth.uid() AND u.ativo AND u.perfil IN ('admin','comprador')
      )
    )
    OR (financeiro.fn_app_role() IS NOT NULL)
  );

-- zapp.media_download_queue
DROP POLICY IF EXISTS mdq_select ON zapp.media_download_queue;
CREATE POLICY mdq_select ON zapp.media_download_queue
  FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor());

-- zapp.media_quarantine
DROP POLICY IF EXISTS authenticated_read_only ON zapp.media_quarantine;
CREATE POLICY authenticated_read_only ON zapp.media_quarantine
  FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor());

-- zapp.media_security_alerts
DROP POLICY IF EXISTS authenticated_read_only ON zapp.media_security_alerts;
CREATE POLICY authenticated_read_only ON zapp.media_security_alerts
  FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor());

-- zapp.sla_violations
DROP POLICY IF EXISTS slav_select ON zapp.sla_violations;
CREATE POLICY slav_select ON zapp.sla_violations
  FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor());
