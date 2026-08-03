-- =============================================================================
-- Etapa 5: SECURITY DEFINER e grants (ESCOPO REDUZIDO)
-- Achados: F2-01, F2-02, F2-03, F6-07, F6-18, F8-11, F8-17
-- =============================================================================
-- ROLLBACK:
--   R1: GRANT EXECUTE ON FUNCTION public.fn_contacts_proxy_delete() TO authenticated;
--   R2: GRANT EXECUTE ON FUNCTION public.fn_contacts_proxy_insert() TO authenticated;
--   R3: GRANT EXECUTE ON FUNCTION public.fn_contacts_proxy_update() TO authenticated;
--   R4: GRANT EXECUTE ON FUNCTION public.fn_messages_bridge_delete() TO authenticated;
--   R5: GRANT EXECUTE ON FUNCTION public.fn_messages_bridge_insert() TO authenticated;
--   R6: GRANT EXECUTE ON FUNCTION public.fn_messages_bridge_update() TO authenticated;
--
-- VERIFICAÇÃO PRÉ-APLICAÇÃO (2026-08-02):
--   - 138 SECDEF com EXECUTE para authenticated (19 public + 119 zapp)
--   - 6 proxy functions com 0 chamadas no frontend e ~0 no pg_stat_statements
--   - auth_secure_123 é parte de convenção 0-211 (não é nome de teste)
--   - search_path sem bpm já resolvido pelo ADR-004
-- =============================================================================

-- F2-01/F2-02: Revogar EXECUTE de authenticated em 6 funções proxy SECDEF
-- Estas funções são código morto: zero referências no frontend,
-- zero chamadas significativas em pg_stat_statements.
-- Mantê-las com SECDEF + EXECUTE para authenticated é risco sem benefício.
REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_delete() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_insert() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_update() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_messages_bridge_delete() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_messages_bridge_insert() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_messages_bridge_update() FROM authenticated;

-- NOTAS:
-- F2-03/F2-04/F2-05: 138 SECDEF ativos são RPCs de fachada — funcionando como desenhado.
--   Auditoria completa documentada em docs/audits/PLANO_IMPLEMENTACAO_100.md.
-- F6-07: fn_alert_* SECDEF — auditoria difere para Etapa 9 (observabilidade).
-- F6-18: auth_secure_123 é parte da convenção (0-211), não é nome de teste.
-- F8-11: users_own_preferences é subset de auth_secure_105 — design intencional.
-- F8-17: search_path sem bpm resolvido pelo ADR-004 (remoção do módulo BPM).
