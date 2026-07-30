-- MELHORIA #1: Enable RLS on vendas.parabens_enviados
-- Tabela sem workspace_id → policy conservadora: service_role bypass + authenticated pleno
-- (anon fica bloqueado por padrão com RLS enabled + sem policy para anon)

ALTER TABLE vendas.parabens_enviados ENABLE ROW LEVEL SECURITY;

-- Service role (n8n, edge functions) mantém acesso irrestrito
CREATE POLICY parabens_service_role_all ON vendas.parabens_enviados
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Usuários autenticados podem ler e registrar parabéns
CREATE POLICY parabens_authenticated_select ON vendas.parabens_enviados
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY parabens_authenticated_insert ON vendas.parabens_enviados
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Sem UPDATE/DELETE para authenticated — mutações via service_role apenas
