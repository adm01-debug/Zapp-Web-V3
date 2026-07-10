-- Migration: public.system_connections
-- Bug #1 Fix: Connections.tsx consultava public.system_connections mas a tabela
-- não existia, causando 404 ao carregar a página /admin/connections.
-- Criada em produção via Supabase Self-Hosted MCP em 2026-07-09.

-- Tabela principal
CREATE TABLE IF NOT EXISTS public.system_connections (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  provider    text        NOT NULL DEFAULT 'supabase_external',
  config      jsonb       NOT NULL DEFAULT '{}',
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.system_connections IS
  'Armazena configurações de conexões externas (ex: Supabase FATOR X). '
  'Gerenciada pela UI em /admin/connections. '
  'Criada em 2026-07-09 como fix para Bug#1 (404 na página de Conexões).';

-- Índices de busca
CREATE INDEX IF NOT EXISTS idx_system_connections_provider
  ON public.system_connections(provider);
CREATE INDEX IF NOT EXISTS idx_system_connections_name
  ON public.system_connections(name);

-- Trigger updated_at (função set_updated_at() já existe no projeto)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_system_connections_updated_at'
  ) THEN
    CREATE TRIGGER set_system_connections_updated_at
      BEFORE UPDATE ON public.system_connections
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Row Level Security
ALTER TABLE public.system_connections ENABLE ROW LEVEL SECURITY;

-- Policy: leitura para usuários autenticados
CREATE POLICY IF NOT EXISTS "system_connections_read_authenticated"
  ON public.system_connections FOR SELECT
  TO authenticated
  USING (true);

-- Policy: escrita somente para admin/dev
CREATE POLICY IF NOT EXISTS "system_connections_write_admin"
  ON public.system_connections FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'dev')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'dev')
    )
  );

-- Grants para PostgREST
GRANT SELECT ON public.system_connections TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.system_connections TO authenticated;
