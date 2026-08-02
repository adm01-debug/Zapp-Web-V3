-- =============================================================================
-- E7 (complemento): implementação completa de merge_contacts
-- Achado: F5-04 (stub → função real)
-- =============================================================================
-- ROLLBACK:
--   CREATE OR REPLACE FUNCTION zapp.merge_contacts(...)
--   RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
--   AS $$ BEGIN RAISE EXCEPTION 'merge_contacts: implementacao pendente (etapa 30)'; END; $$;
--
-- DECISÕES DE NEGÓCIO (baseadas na arquitetura existente):
--   1. Primário sobrevive (operador escolhe qual)
--   2. Campos conflitantes: primário vence, secundário preenche vazios (COALESCE)
--   3. Ficha mesclada: soft-delete + merge_source_id → primário
--   4. Mensagens: NÃO remapeadas (link é por remote_jid, não por contact_id)
--   5. Notas/tags/atribuições: remapeadas do secundário → primário
--   6. lead_score + total_messages: somados

-- Pré-requisito: adicionar colunas que faltavam em contact_notes
ALTER TABLE zapp.contact_notes
  ADD COLUMN IF NOT EXISTS note_type text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;

-- Função merge_contacts (substitui o stub)
CREATE OR REPLACE FUNCTION zapp.merge_contacts(
  p_primary_id uuid,
  p_secondary_id uuid,
  p_merged_fields jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'public'
AS $$
DECLARE
  v_primary evo.evolution_contacts%ROWTYPE;
  v_secondary evo.evolution_contacts%ROWTYPE;
  v_notes_remapped integer := 0;
  v_tags_remapped integer := 0;
  v_assignments_remapped integer := 0;
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Apenas admin/supervisor pode mesclar contatos' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_primary FROM evo.evolution_contacts WHERE id = p_primary_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contato primario nao encontrado: %', p_primary_id; END IF;

  SELECT * INTO v_secondary FROM evo.evolution_contacts WHERE id = p_secondary_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contato secundario nao encontrado: %', p_secondary_id; END IF;

  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'Nao e possivel mesclar um contato com ele mesmo';
  END IF;

  -- Merge de campos: primário vence, secundário preenche vazios
  UPDATE evo.evolution_contacts SET
    full_name       = COALESCE(NULLIF(v_primary.full_name, ''), NULLIF(v_secondary.full_name, '')),
    email           = COALESCE(v_primary.email, v_secondary.email),
    company         = COALESCE(NULLIF(v_primary.company, ''), NULLIF(v_secondary.company, '')),
    role_title      = COALESCE(NULLIF(v_primary.role_title, ''), NULLIF(v_secondary.role_title, '')),
    notes           = CASE WHEN v_primary.notes IS NOT NULL AND v_secondary.notes IS NOT NULL
      THEN v_primary.notes || E'\n\n--- Mesclado de ' || COALESCE(v_secondary.full_name, v_secondary.push_name, 'sem nome') || ' ---\n' || v_secondary.notes
      ELSE COALESCE(v_primary.notes, v_secondary.notes) END,
    whatsapp_labels = COALESCE(v_primary.whatsapp_labels, v_secondary.whatsapp_labels),
    tags            = COALESCE(v_primary.tags, v_secondary.tags),
    lead_score      = COALESCE(v_primary.lead_score, 0) + COALESCE(v_secondary.lead_score, 0),
    total_messages  = COALESCE(v_primary.total_messages, 0) + COALESCE(v_secondary.total_messages, 0),
    total_purchases = COALESCE(v_primary.total_purchases, 0) + COALESCE(v_secondary.total_purchases, 0),
    first_contact_at = LEAST(v_primary.first_contact_at, v_secondary.first_contact_at),
    last_message_at  = GREATEST(v_primary.last_message_at, v_secondary.last_message_at),
    lgpd_consent_at  = COALESCE(v_primary.lgpd_consent_at, v_secondary.lgpd_consent_at),
    lgpd_marketing_consent = v_primary.lgpd_marketing_consent OR v_secondary.lgpd_marketing_consent,
    updated_at = NOW()
  WHERE id = p_primary_id;

  -- Remapear dados relacionados
  UPDATE zapp.contact_notes SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  GET DIAGNOSTICS v_notes_remapped = ROW_COUNT;

  UPDATE zapp.contact_tags SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  GET DIAGNOSTICS v_tags_remapped = ROW_COUNT;

  UPDATE zapp.contact_assignments SET contact_id = p_primary_id WHERE contact_id = p_secondary_id;
  GET DIAGNOSTICS v_assignments_remapped = ROW_COUNT;

  -- Soft-delete secundário com rastreabilidade
  UPDATE evo.evolution_contacts SET
    deleted_at = NOW(),
    deleted_reason = 'merged_into:' || p_primary_id::text,
    merge_source_id = p_primary_id,
    updated_at = NOW()
  WHERE id = p_secondary_id;

  -- Registrar auditoria
  INSERT INTO zapp.contact_notes (contact_id, author_id, content, note_type)
  VALUES (p_primary_id, zapp.get_profile_id_for_user(auth.uid()),
    format('Contato mesclado: %s → %s. Notas: %s, Tags: %s, Atribuições: %s.',
      COALESCE(v_secondary.full_name, v_secondary.push_name, 'sem nome'),
      COALESCE(v_primary.full_name, v_primary.push_name, 'sem nome'),
      v_notes_remapped, v_tags_remapped, v_assignments_remapped),
    'system');

  RETURN jsonb_build_object(
    'merged', true,
    'primary_id', p_primary_id,
    'secondary_id', p_secondary_id,
    'notes_remapped', v_notes_remapped,
    'tags_remapped', v_tags_remapped,
    'assignments_remapped', v_assignments_remapped
  );
END;
$$;
