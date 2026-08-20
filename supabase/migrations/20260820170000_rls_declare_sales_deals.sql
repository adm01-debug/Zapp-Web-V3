-- ============================================================================
-- 20260820170000_rls_declare_sales_deals.sql
-- Tema: declarar ENABLE ROW LEVEL SECURITY de zapp.sales_deals no repo
-- Data/versão: 2026-08-20 · autor: Hermes (validação CP-3 / quality-gate E34)
--
-- Objetivo: o DB de produção já tem RLS ativo em zapp.sales_deals
-- (relrowsecurity=true), mas NENHUM arquivo de migration declara o
-- ENABLE ROW LEVEL SECURITY — o auditor estático E34
-- (scripts/audit-rls-coverage.mjs) varre apenas supabase/migrations/ e
-- falhava (exit 1) com: "zapp.sales_deals — add ALTER TABLE ... ENABLE RLS".
-- A tabela foi criada pelo canônico/snapshot sem a declaracao inline, e o
-- RLS entrou no DB por outro caminho (fix RLS subset). Esta migration
-- alinha repo x DB (regra 5 do AGENTS: corpo correto que JÁ roda no DB).
--
-- Idempotência: ALTER TABLE ... ENABLE ROW LEVEL SECURITY é idempotente
-- (re-executar não apaga policies nem dá erro).
-- Rollback: não aplicável (somente habilita RLS; desabilitar exigiria
-- decisão explícita de segurança).
-- ============================================================================

ALTER TABLE zapp.sales_deals ENABLE ROW LEVEL SECURITY;

-- Verificação (falha o apply se o RLS não estiver ativo)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'sales_deals' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'FK: zapp.sales_deals sem RLS ativo apos 20260820170000';
  END IF;
END $$;