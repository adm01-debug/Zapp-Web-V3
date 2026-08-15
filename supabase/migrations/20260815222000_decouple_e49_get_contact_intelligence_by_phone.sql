-- =============================================================================
-- E49 — zapp.get_contact_intelligence_by_phone (Fase 3 — Isolamento I1)
-- =============================================================================
-- Objetivo: corrigir search_path para eliminar resolução implícita de evo.* (I1).
-- Estratégia: ALTER FUNCTION — corrige search_path sem reescrever o corpo.
-- =============================================================================

ALTER FUNCTION zapp.get_contact_intelligence_by_phone(text)
  SET search_path = zapp, pg_catalog;

COMMENT ON FUNCTION zapp.get_contact_intelligence_by_phone IS
  'Inteligência de contato por telefone. '
  'E49 (2026-08-15): search_path corrigido para zapp, pg_catalog (invariante I1). '
  'Acesso restrito: search_path=zapp,pg_catalog.';
