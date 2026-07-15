-- ============================================================
-- ZAPP schema bridges — evolution_instance_credentials + evolution_retry_metrics
-- APLICAR NA VPS supabase.atomicabr.com.br
-- ------------------------------------------------------------
-- Contexto: cliente Supabase do frontend está fixado em
--   db: { schema: 'zapp' }
-- e essas duas tabelas continuam vivendo em `public`, o que
-- gera PGRST205 nas telas /admin/integrations/evolution-api e
-- painéis de retry metrics.
--
-- Este script cria views-bridge em `zapp` com security_invoker
-- (RLS herda da tabela base) + GRANTs para authenticated e
-- service_role, mantendo o guardrail check-schema-usage feliz.
-- ============================================================

BEGIN;

-- 1) evolution_instance_credentials (RW no admin)
CREATE OR REPLACE VIEW zapp.evolution_instance_credentials
  WITH (security_invoker = on)
  AS SELECT * FROM public.evolution_instance_credentials;

GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.evolution_instance_credentials TO authenticated;
GRANT ALL                             ON zapp.evolution_instance_credentials TO service_role;

-- 2) evolution_retry_metrics (leitura em painéis; escrita pelas edge functions via service_role)
CREATE OR REPLACE VIEW zapp.evolution_retry_metrics
  WITH (security_invoker = on)
  AS SELECT * FROM public.evolution_retry_metrics;

GRANT SELECT ON zapp.evolution_retry_metrics TO authenticated;
GRANT ALL    ON zapp.evolution_retry_metrics TO service_role;

COMMIT;

-- Recarrega o schema cache do PostgREST.
NOTIFY pgrst, 'reload schema';
