-- Migration: 20260711_security_revoke_anon_secdef
-- Autor: Claude (validacao exaustiva 2026-07-11)
-- Prioridade: ALTA
--
-- PROBLEMA ENCONTRADO:
-- Funcoes SECURITY DEFINER owned por postgres (rolbypassrls=true) estavam
-- expostas ao anon via PUBLIC DEFAULT EXECUTE. Qualquer requisicao nao-autenticada
-- via PostgREST RPC poderia:
--   fn_update_instance_health -> UPDATE evo.evolution_instance_credentials (manipular health_status)
--   fn_sync_messages_to_v2   -> INSERT evo.evolution_webhook_events_v2 (injetar eventos)
--   fn_detect_401_bursts     -> INSERT public.warroom_alerts (criar alertas falsos)
--   fn_alert_ghost_message_events -> INSERT zapp.warroom_alerts
--   fn_guard_qa_instances    -> leitura bypassando RLS
--   fn_sync_instance_registry_status -> UPDATE zapp.instance_registry
--
-- EXPLORAÇÃO POSSÍVEL:
--   POST /rest/v1/rpc/fn_update_instance_health (sem auth)
--   -> Roda como postgres (bypassrls=true)
--   -> UPDATE evolution_instance_credentials SET health_status='unhealthy'
--   -> Causa alertas falsos e degradação do health score
--
-- FIX: REVOKE PUBLIC + GRANT explícito apenas para postgres e supabase_admin
-- Os crons pg_cron que chamam essas funções rodam como postgres → não afetados
-- Verificação pós-revoke: anon=false, pg=true, supa=true para todas

-- === SCHEMA evo ===
REVOKE EXECUTE ON FUNCTION evo.fn_update_instance_health() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION evo.fn_sync_messages_to_v2() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION evo.fn_detect_401_bursts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION evo.fn_update_instance_health() TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION evo.fn_sync_messages_to_v2() TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION evo.fn_detect_401_bursts() TO postgres, supabase_admin;

-- === SCHEMA zapp ===
REVOKE EXECUTE ON FUNCTION zapp.fn_alert_ghost_message_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.fn_guard_qa_instances() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.fn_sync_instance_registry_status() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zapp.fn_alert_ghost_message_events() TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION zapp.fn_guard_qa_instances() TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION zapp.fn_sync_instance_registry_status() TO postgres, supabase_admin;

-- NOTA: schemas financeiro (27 fns), artes (15 fns), vendas (11 fns) têm o
-- mesmo padrão mas são SCHEMAS LEGADOS — requerem aprovação de Joaquim antes
-- de qualquer modificação. Documentado como pendência em SECURITY_AUDIT_LEGADOS.md

-- === VERIFICAÇÃO ===
-- SELECT p.proname, n.nspname,
--   has_function_privilege('anon', p.oid, 'execute') AS anon,
--   has_function_privilege('postgres', p.oid, 'execute') AS pg
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname IN ('evo','zapp')
--   AND p.proname IN (
--     'fn_update_instance_health','fn_sync_messages_to_v2','fn_detect_401_bursts',
--     'fn_alert_ghost_message_events','fn_guard_qa_instances','fn_sync_instance_registry_status'
--   )
-- ORDER BY nspname, proname;
-- Resultado esperado: anon=false, pg=true em todas
