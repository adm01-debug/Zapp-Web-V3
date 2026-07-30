-- =============================================================================
-- MIGRATION: add instance_name to whatsapp_connections
-- Data: 2026-07-05
-- Contexto: PR #183 adicionou instance_name ao SELECT de ConnectionStatusIndicator
-- (campo legível da Evolution API, ex: "wpp2") mas a coluna nunca foi criada no DB.
-- O types.ts gerado pelo Supabase também estava faltando o campo → TS2352 em build.
-- Esta migration adiciona a coluna (idempotente) e cria índice de busca.
-- =============================================================================

ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS instance_name TEXT;

COMMENT ON COLUMN public.whatsapp_connections.instance_name IS
  'Nome da instância na Evolution API (ex: wpp2). Complemento legível do instance_id (UUID).';

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_instance_name
  ON public.whatsapp_connections (instance_name)
  WHERE instance_name IS NOT NULL;
