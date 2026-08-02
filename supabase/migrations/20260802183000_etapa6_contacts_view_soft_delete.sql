-- =============================================================================
-- Etapa 6: View zapp.contacts e triggers (CORREÇÃO CRÍTICA)
-- Achados: F5-01, F5-02, F5-03, F5-27, F5-29
-- Risco: MUITO ALTO — 20.445 contatos em produção
-- Backup: evo._backup_evolution_contacts_20260802 (20.445 rows)
-- =============================================================================
-- ROLLBACK:
--   CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_delete_handler()
--   RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
--   SET search_path TO 'zapp', 'evo'
--   AS $$ BEGIN DELETE FROM evo.evolution_contacts WHERE id = OLD.id; RETURN OLD; END; $$;
--
-- VERIFICAÇÃO PRÉ-APLICAÇÃO (2026-08-02):
--   - fn_contacts_view_delete_handler: DELETE FROM evo.evolution_contacts (hard delete!)
--   - fn_contacts_view_update_handler: propaga 15 campos, não propaga deleted_at/lgpd*/workspace_id
--   - fn_contacts_view_insert_handler: funcional, fallback instance 'wpp2'
--   - View: cpf=NULL, is_blocked=false, is_favorite=false (defaults de API)
-- =============================================================================

-- F5-03: DELETE trigger — HARD DELETE → SOFT DELETE (CRÍTICO)
-- Antes: DELETE FROM evo.evolution_contacts WHERE id = OLD.id;
-- Depois: UPDATE evo.evolution_contacts SET deleted_at = NOW()
-- Requisito LGPD: 30 dias de undo antes da exclusão permanente
CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_delete_handler()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo'
AS $$
BEGIN
  UPDATE evo.evolution_contacts
  SET deleted_at = NOW(),
      deleted_reason = COALESCE(NEW.deleted_reason, 'user_request')
  WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

-- NOTAS:
-- F5-01: View defaults (cpf=NULL etc.) são API intencional do frontend — não alterar
-- F5-02: UPDATE handler não propaga lgpd_* — campos de consentimento gerenciados separadamente
-- F5-27: Fallback '@s.whatsapp.net' no INSERT — minor, não quebra funcionalidade
-- F5-29: sem FKs em empresas — confirmado, não é bug
