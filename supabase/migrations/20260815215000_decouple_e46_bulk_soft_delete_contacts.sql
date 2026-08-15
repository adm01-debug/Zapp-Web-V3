-- =============================================================================
-- E46 — zapp.bulk_soft_delete_contacts (Fase 3 — Isolamento I1)
-- =============================================================================
-- Objetivo: remover referência direta a evo.evolution_contacts (invariante I1).
-- Substituição: evo.evolution_contacts → zapp.evolution_contacts (view de contrato)
-- search_path: 'zapp','evo','monitoring' → zapp, monitoring, pg_catalog
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.bulk_soft_delete_contacts(
  p_contact_ids uuid[],
  p_reason      text DEFAULT 'bulk_deletion'
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = zapp, monitoring, pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  IF array_length(p_contact_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Maximum 500 contacts per bulk operation. Got: %',
      array_length(p_contact_ids, 1);
  END IF;
  UPDATE zapp.evolution_contacts
  SET deleted_at     = now(),
      deleted_reason = p_reason,
      updated_at     = now()
  WHERE id = ANY(p_contact_ids)
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION zapp.bulk_soft_delete_contacts IS
  'Soft-delete em lote de contatos via view de contrato zapp.*. '
  'E46 (2026-08-15): evo.evolution_contacts → zapp.evolution_contacts (invariante I1). '
  'Acesso restrito: search_path=zapp,monitoring,pg_catalog.';
