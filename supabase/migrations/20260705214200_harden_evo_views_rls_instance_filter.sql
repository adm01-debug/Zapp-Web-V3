-- ============================================================
-- Migration: harden_evo_views_rls_instance_filter
-- Data: 2026-07-05
-- Audit: Fix 1/5 — Endurecer views auxiliares evo sem RLS
-- ============================================================

-- 1. Revogar acesso de authenticated/anon em views evo sem RLS própria
--    Essas views não têm proteção de linha própria — apenas herdam da tabela base.
--    Via PostgREST, authenticated podia lê-las sem filtro de instância.
--    Guarded: views são production-only (não criadas por nenhuma migration de CI).
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['active_messages','active_webhook_events','evolution_messages_v2','v_messages_unified']
  LOOP
    IF EXISTS (
      SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='evo' AND c.relname=v
    ) THEN
      EXECUTE format('REVOKE ALL ON evo.%I FROM authenticated, anon', v);
    END IF;
  END LOOP;
END $$;

-- 2. Endurecer policy authenticated_read em tabelas base
--    Antes: qual = 'true' (sem filtro de instância)
--    Depois: qual = instance_name = 'wpp2' (só instância produção)
DROP POLICY IF EXISTS authenticated_read ON evo.evolution_messages;
CREATE POLICY authenticated_read ON evo.evolution_messages
  FOR SELECT TO authenticated
  USING (instance_name = 'wpp2');

DROP POLICY IF EXISTS authenticated_read ON evo.evolution_webhook_events_v2;
CREATE POLICY authenticated_read ON evo.evolution_webhook_events_v2
  FOR SELECT TO authenticated
  USING (instance_name = 'wpp2');

-- 3. Validação inline
DO $$ BEGIN
  -- Views devem estar revogadas
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants g
    WHERE g.table_schema='evo'
      AND g.table_name IN ('active_messages','active_webhook_events','evolution_messages_v2','v_messages_unified')
      AND g.grantee IN ('authenticated','anon')
  ), 'FALHA: views auxiliares ainda acessíveis!';

  -- Policies devem ter filtro de instância
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='evo' AND tablename='evolution_messages'
      AND policyname='authenticated_read'
      AND qual LIKE '%wpp2%'
  ), 'FALHA: policy evolution_messages sem filtro de instância!';

  RAISE NOTICE 'OK: evo views hardening validado em 2 checks.';
END $$;
