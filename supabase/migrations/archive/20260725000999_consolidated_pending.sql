-- ============================================================
-- MIGRATIONS CONSOLIDADAS PARA SELF-HOSTED
-- Gerado: 2026-07-25
-- Origem: PR #525, #527, #529
-- ============================================================
--
-- INSTRUÇÕES:
-- 1. Faça BACKUP do banco antes de aplicar
-- 2. Aplique em ordem cronológica (use o script bash abaixo)
-- 3. Após aplicar, re-deploy as Edge Functions:
--    supabase functions deploy evolution-api
--    supabase functions deploy evolution-webhook
--    supabase functions deploy connection-health-check
-- 4. Force rebuild no Vercel (ou aguarde auto-deploy)
--
-- COMANDO BASH PARA APLICAR:
-- for f in $(ls supabase/migrations/2026072*.sql | sort); do
--   echo "Aplicando $f..."
--   psql -h supabase.atomicabr.com.br -U postgres -d zapp -f "$f"
-- done
-- ============================================================

-- Este arquivo é apenas documentação. As migrations reais estão em
-- supabase/migrations/202607*.sql e devem ser aplicadas em ordem.

SELECT
  'PR #525' AS source,
  'AuthProvider/useContactIntelligence/useAutomationSuggestions/useAutomationManagement' AS scope,
  'auth.role_permissions join, automation_executions join, contact_intelligence UUID filter, evolution_messages remote_jid, evolution-api graceful degradation' AS fixes,
  count(*) AS migrations_count
FROM pg_class
WHERE relkind = 'r'
  AND relname LIKE '%permission%';
