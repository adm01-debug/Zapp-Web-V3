-- ============================================================================
-- 20260811160000_revoke_auth_exec_fns_novas.sql
-- FIX de segurança pós-validação (2026-08-11) — REVOKE EXECUTE de authenticated
-- ----------------------------------------------------------------------------
-- GAP encontrado na validação exaustiva: pg_default_acl dos schemas zapp/evo
-- ({authenticated=X/postgres}) concede EXECUTE a authenticated em TODA função
-- nova — as 10 funções internas criadas hoje (grupos/presença/viewed/isonwa/
-- notificações/backfill) ficaram chamáveis por qualquer usuário autenticado
-- via REST (zapp está em PGRST_DB_SCHEMAS) ou SQL direto.
-- Risco: forjar presença de contatos, criar/alterar grupos, marcar notificações
-- como entregues, marcar status como vistos.
-- Fix: REVOKE EXECUTE FROM authenticated (idempotente); service_role mantido
-- (é o caminho das edge functions). Default privileges GLOBAIS NÃO alterados
-- (outras RPCs legítimas do app dependem deles).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION zapp.zapp_upsert_group_from_event(uuid, text, text, text, text[], text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.zapp_upsert_group_participants(uuid, text[], text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.zapp_touch_contact_presence(text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.zapp_mark_status_viewed(text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.fn_process_evolution_notifications(int) FROM authenticated;
REVOKE EXECUTE ON FUNCTION evo.fn_resolve_contact_id_by_jid(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION evo.fn_upsert_group_participants(uuid, text[], text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION evo.fn_upsert_group_from_event(uuid, text, text, text, text[], text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION evo.fn_touch_contact_presence(text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION evo.fn_mark_status_viewed(text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION evo.fn_check_whatsapp_numbers(int) FROM authenticated;
REVOKE EXECUTE ON FUNCTION evo.fn_sync_groups_from_api(text, int) FROM authenticated;

-- Verificação pós-aplicação (esperado: auth_exec=false, sr_exec=true em todas):
-- SELECT n.nspname, p.proname,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
--        has_function_privilege('service_role', p.oid, 'EXECUTE') AS sr_exec
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE p.proname IN ('zapp_upsert_group_from_event','zapp_upsert_group_participants',
--        'zapp_touch_contact_presence','zapp_mark_status_viewed','fn_process_evolution_notifications',
--        'fn_upsert_group_from_event','fn_touch_contact_presence','fn_mark_status_viewed',
--        'fn_check_whatsapp_numbers','fn_sync_groups_from_api')
--  ORDER BY 1,2;

-- ----------------------------------------------------------------------------
-- Hardening da TRILHA BRUTA (achado do validador D1 pós-deploy):
-- a coluna payload (conteúdo bruto de mensagens) fica restrita a admins via
-- RLS (policy auth_secure_182 = is_admin_or_supervisor()). REVOKE column-level
-- de SELECT(payload) documentado abaixo — sem efeito prático enquanto o grant
-- de TABELA (default ACL authenticated=arwd) cobrir a coluna; mantido como
-- intenção/defesa. Decisão: NÃO revogar SELECT da tabela (quebraria a policy
-- auth_secure_182 criada anteriormente e o acesso admin a metadados).
-- NOTA: acesso real ao payload via REST = apenas admin/supervisor (RLS).
-- ----------------------------------------------------------------------------
REVOKE SELECT (payload) ON TABLE zapp.webhook_events_processed FROM authenticated;
