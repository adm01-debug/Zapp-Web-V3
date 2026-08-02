-- =============================================================================
-- Etapa 7: RPCs de contatos dependentes da view
-- Achados: F5-04 (merge_contacts), F5-05 (bulk_soft_delete), F5-09 (add_contact_note)
--           F5-10 (hook bypass), F5-11 (contact_notes=0), F5-30 (tags)
-- Depende de: Etapa 6 (view soft-delete)
-- =============================================================================
-- ROLLBACK:
--   R1: refazer add_contact_note sem note_type/is_pinned
--   R2: refazer bulk_soft_delete_contacts com referencia a workspace_id em profiles
--
-- VERIFICAÇÃO PRÉ-APLICAÇÃO (2026-08-02):
--   - add_contact_note: INSERT só com (contact_id, author_id, content) — sem note_type
--   - bulk_soft_delete_contacts: referencia workspace_id em profiles (coluna inexistente!)
--   - merge_contacts: stub com RAISE EXCEPTION 'implementacao pendente'
--   - contact_notes: 0 rows
-- =============================================================================

-- F5-09: add_contact_note descartava note_type e is_pinned no INSERT
CREATE OR REPLACE FUNCTION zapp.add_contact_note(
  p_contact_id uuid, p_content text,
  p_note_type text DEFAULT 'general'::text, p_is_pinned boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'zapp', 'public'
AS $$
DECLARE v_profile_id uuid; v_id uuid;
BEGIN
  v_profile_id := zapp.get_profile_id_for_user(auth.uid());
  IF NOT (zapp.is_admin_or_supervisor()
          OR (p_contact_id IS NOT NULL AND zapp.is_contact_visible_to_user(p_contact_id, auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO zapp.contact_notes (contact_id, author_id, content, note_type, is_pinned)
  VALUES (p_contact_id, v_profile_id, p_content, p_note_type, p_is_pinned)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'contact_id', p_contact_id,
    'note_type', p_note_type, 'is_pinned', p_is_pinned);
END; $$;

-- F5-05: bulk_soft_delete_contacts referenciava workspace_id em profiles (coluna inexistente)
CREATE OR REPLACE FUNCTION zapp.bulk_soft_delete_contacts(
  p_contact_ids uuid[], p_reason text DEFAULT 'bulk_deletion'::text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'monitoring'
AS $$
DECLARE v_count integer;
BEGIN
  IF array_length(p_contact_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Maximum 500 contacts per bulk operation. Got: %', array_length(p_contact_ids, 1);
  END IF;
  UPDATE evo.evolution_contacts
  SET deleted_at = now(), deleted_reason = p_reason, updated_at = now()
  WHERE id = ANY(p_contact_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

-- F5-04: merge_contacts — PENDENTE (requer implementação completa)
--   Stub mantido: RAISE EXCEPTION 'implementacao pendente (etapa 30)'
--   Bloqueio documentado em RELATORIO_CORRECAO.md
