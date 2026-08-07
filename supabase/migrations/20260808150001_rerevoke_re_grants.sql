-- ==========================================================================
-- Fix validação 2026-08-07 (val2-01 s04a) — re-revoke das 3 RPCs re-grantadas pela
-- migration 20260806180000_fix_wa_rpc_execute_grants (aplicada após o revoke da
-- onda). exec_sql/PUBLIC já foi coberto pelo hotfix da sessão paralela
-- (20260808150000 hotfix_revoke_exec_sql_anon) — mantido aqui como defesa
-- idempotente (REVOKE sem grant = no-op).
--  1) public.exec_sql(text) da migration 20260808130000 (sessão paralela)
--     tinha EXECUTE para PUBLIC — chamável via REST como ANON com SECURITY
--     DEFINER (leitura total do banco como postgres). REVOKE completo.
--  2) Re-grants da migration 20260806180000_fix_wa_rpc_execute_grants
--     (aplicada após o revoke da onda) — REVOKE novamente (idempotente).
-- ==========================================================================
REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM anon;
REVOKE EXECUTE ON FUNCTION zapp.rpc_delete_contact(text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_resolve_instance_by_phone(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_resolve_whatsapp_instance(uuid) FROM authenticated;
