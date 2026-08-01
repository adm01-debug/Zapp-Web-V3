-- ============================================================
-- R27: Security fixes + workspace isolation + RT28-31
-- Data: 2026-08-01 | Score pos-fix: 92.5/A | 31/31 PASS
-- ============================================================
-- AVISO: Este arquivo e documentacao das correcoes aplicadas diretamente.
-- As funcoes foram atualizadas via CREATE OR REPLACE no banco de producao.
-- ============================================================

-- ---------------------------------------------------------------------------
-- FIX 1: bulk_auto_merge_duplicates - guard de autorizacao (P0-4)
-- ---------------------------------------------------------------------------
-- Resultado: authenticated nao-admin recebe EXCEPTION 42501
-- service_role (auth.uid() IS NULL) passa sem restricao
-- Verificacao: SELECT prosrc LIKE '%auth.uid() IS NOT NULL AND NOT zapp.is_admin_or_supervisor%'
--   FROM pg_proc WHERE proname='bulk_auto_merge_duplicates';
-- Esperado: true

-- ---------------------------------------------------------------------------
-- FIX 2: public.purge_old_query_telemetry - REVOKE authenticated + uid guard (P2-1)
-- ---------------------------------------------------------------------------
-- Resultado: authenticated nao pode mais deletar telemetria via API
-- Verificacao: SELECT NOT has_function_privilege('authenticated', 'public.purge_old_query_telemetry(integer)', 'EXECUTE');
-- Esperado: true

-- ---------------------------------------------------------------------------
-- FIX 3: vendas sequences - REVOKE anon USAGE (P2-2)
-- ---------------------------------------------------------------------------
-- Resultado: anon nao pode mais chamar nextval nas sequences de vendas
-- Verificacao: SELECT has_sequence_privilege('anon', 'vendas.envios_cotacao_id_seq', 'USAGE');
-- Esperado: false

-- ---------------------------------------------------------------------------
-- FIX 4: get_contact_360_by_phone - workspace isolation (P0-1)
-- ---------------------------------------------------------------------------
-- Resultado: authenticated filtra por workspace_id do usuario
-- Verificacao: SELECT prosrc LIKE '%v_workspace_id IS NULL OR c.workspace_id = v_workspace_id%'
--   FROM pg_proc WHERE proname='get_contact_360_by_phone' AND pronamespace='zapp'::regnamespace;
-- Esperado: true

-- ---------------------------------------------------------------------------
-- FIX 5: public.get_contact_intelligence_by_phone - workspace membership guard (P0-2)
-- ---------------------------------------------------------------------------
-- Resultado: authenticated sem workspace membership recebe EXCEPTION 42501
-- Verificacao: SELECT prosrc LIKE '%workspace_members%'
--   FROM pg_proc WHERE proname='get_contact_intelligence_by_phone' AND pronamespace='public'::regnamespace;
-- Esperado: true

-- ---------------------------------------------------------------------------
-- FIX 6: get_companies_by_phones_batch - public wrapper + guard (P0-3)
-- ---------------------------------------------------------------------------
-- Resultado: authenticated via public wrapper, com workspace guard
-- Verificacao: SELECT NOT has_function_privilege('authenticated', 'zapp.get_companies_by_phones_batch(text[])', 'EXECUTE');
-- Esperado: false (zapp direto bloqueado)

-- ---------------------------------------------------------------------------
-- FIX 7: fn_system_health_score - wpp2 degraded nao conta como connected (P1-1)
-- ---------------------------------------------------------------------------
-- Antes: last_health_check recente + health_status=degraded = 20/20 (falso positivo)
-- Depois: health_status=degraded desqualifica criterio de recencia
-- Nova logica: v_wpp2_ok := (...last_health_check recente AND v_wpp2_health!='degraded')
-- Verificacao: SELECT prosrc LIKE '%AND v_wpp2_health!=''degraded''%'
--   FROM pg_proc WHERE proname='fn_system_health_score' AND pronamespace='zapp'::regnamespace;
-- Esperado: true

-- ---------------------------------------------------------------------------
-- FIX 8: evo._evolution_contacts_backup_20260801 - 2 RLS policies
-- ---------------------------------------------------------------------------
-- Resultado: tabela de backup nao mais em lockout total (zero policies)
-- Verificacao: SELECT count(*) FROM pg_policies WHERE schemaname='evo' AND tablename='_evolution_contacts_backup_20260801';
-- Esperado: 2

-- ---------------------------------------------------------------------------
-- FIX 9: public._grant_backup_20260730 - DROP (Regra T2)
-- ---------------------------------------------------------------------------
-- Tabela base vazia (0 bytes, 0 rows) removida do schema public
-- Verificacao: SELECT NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--   WHERE n.nspname='public' AND c.relname='_grant_backup_20260730');
-- Esperado: true

-- ---------------------------------------------------------------------------
-- NOVOS REGRESSION TESTS: RT28-RT31 adicionados a ops.fn_regression_tests()
-- ---------------------------------------------------------------------------
-- RT28: bulk_auto_merge_duplicates tem auth guard
-- RT29: purge_old_query_telemetry bloqueado para authenticated
-- RT30: sequences vendas sem anon USAGE
-- RT31: get_contact_360_by_phone tem workspace filter

-- ---------------------------------------------------------------------------
-- VERIFICACOES FINAIS
-- ---------------------------------------------------------------------------
-- SELECT test_name, status FROM ops.fn_regression_tests() ORDER BY test_name;
-- -- Esperado: 31 linhas, todos PASS
-- SELECT (zapp.fn_system_health_score()::jsonb)->>'score';
-- -- Esperado: 92.5 (wpp2 reconectando) ou 100.0 (wpp2 conectado)
