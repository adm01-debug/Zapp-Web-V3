-- =============================================================================
-- E45 — zapp.fn_contacts_view_delete_handler (Fase 3 — Isolamento I1)
-- =============================================================================
-- Objetivo: remover referência direta a evo.evolution_contacts (invariante I1).
-- Substituição: evo.evolution_contacts → zapp.evolution_contacts (view de contrato)
-- search_path: 'zapp','evo' → zapp, pg_catalog
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_delete_handler()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = zapp, pg_catalog
AS $$
BEGIN
  UPDATE zapp.evolution_contacts
  SET deleted_at     = NOW(),
      deleted_reason = COALESCE(NEW.deleted_reason, 'user_request')
  WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION zapp.fn_contacts_view_delete_handler IS
  'Trigger: soft-delete em evolution_contacts via view de contrato zapp.*. '
  'E45 (2026-08-15): evo.evolution_contacts → zapp.evolution_contacts (invariante I1). '
  'Acesso restrito: search_path=zapp,pg_catalog.';
