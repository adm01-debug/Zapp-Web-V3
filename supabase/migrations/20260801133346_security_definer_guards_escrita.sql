-- 20260801133346_security_definer_guards_escrita.sql
-- Guards de escrita em funções SECURITY DEFINER que tocam dados de outros usuários.
-- Matriz de decisão (validação adversarial Claude Code, 2026-08-01):
--   Padrão A (escrita em contato alheio — guard OBRIGATÓRIO):
--     rpc_insert_message ✓ (aplicado em produção 2026-08-01)
--     add_contact_note ✓, bulk_add_tag ✓, enrich_contact (pendente)
--   Padrão D (operação cross-base — admin genuíno):
--     find_duplicate_contacts ✓, merge_contacts ✓ (stub preservado),
--     bulk_auto_merge_duplicates, get_duplicate_report (pendente)
-- Assinaturas, defaults e colunas conferidos contra o banco em 2026-08-01.
-- APLICADO em produção em 2026-08-01 (DDL + re-grant authenticated).

-- ============================================================
-- 1. add_contact_note — escrita em nota de contato arbitrário
-- ============================================================
DROP FUNCTION IF EXISTS zapp.add_contact_note(uuid, text, text, boolean);
CREATE FUNCTION zapp.add_contact_note(
  p_contact_id uuid,
  p_content text,
  p_note_type text DEFAULT 'general'::text,
  p_is_pinned boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, public
AS $$
DECLARE v_profile_id uuid; v_id uuid;
BEGIN
  v_profile_id := zapp.get_profile_id_for_user(auth.uid());
  IF NOT (zapp.is_admin_or_supervisor()
          OR (p_contact_id IS NOT NULL AND zapp.is_contact_visible_to_user(p_contact_id, auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden: contato nao visivel' USING ERRCODE = '42501';
  END IF;
  INSERT INTO zapp.contact_notes (contact_id, author_id, content)
  VALUES (p_contact_id, v_profile_id, p_content)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'contact_id', p_contact_id);
END;
$$;
GRANT EXECUTE ON FUNCTION zapp.add_contact_note(uuid, text, text, boolean) TO authenticated;

-- ============================================================
-- 2. bulk_add_tag — mutação em massa restrita a admin/supervisor
-- ============================================================
DROP FUNCTION IF EXISTS zapp.bulk_add_tag(uuid[], text);
CREATE FUNCTION zapp.bulk_add_tag(
  p_contact_ids uuid[],
  p_tag text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, public
AS $$
DECLARE v_tag_id uuid; v_added integer := 0;
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_tag_id FROM zapp.tags WHERE name = p_tag LIMIT 1;
  IF v_tag_id IS NULL THEN
    INSERT INTO zapp.tags (name) VALUES (p_tag) RETURNING id INTO v_tag_id;
  END IF;
  INSERT INTO zapp.contact_tags (contact_id, tag_id)
  SELECT cid, v_tag_id FROM unnest(p_contact_ids) AS cid
  WHERE NOT EXISTS (SELECT 1 FROM zapp.contact_tags ct WHERE ct.contact_id = cid AND ct.tag_id = v_tag_id);
  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN jsonb_build_object('added', v_added, 'tag_id', v_tag_id);
END;
$$;
GRANT EXECUTE ON FUNCTION zapp.bulk_add_tag(uuid[], text) TO authenticated;

-- ============================================================
-- 3. find_duplicate_contacts — dedup cross-base: admin genuíno
-- ============================================================
DROP FUNCTION IF EXISTS zapp.find_duplicate_contacts(text, integer);
CREATE FUNCTION zapp.find_duplicate_contacts(
  p_workspace_id text DEFAULT NULL::text,
  p_limit integer DEFAULT 100
) RETURNS TABLE(phone text, contact_ids uuid[], instance_names text[], total integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, evo, public
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT ec.phone_number, array_agg(ec.id)::uuid[], array_agg(ec.instance_name)::text[], count(*)::integer
  FROM evo.evolution_contacts ec
  WHERE ec.phone_number IS NOT NULL AND ec.phone_number <> ''
    AND (p_workspace_id IS NULL OR ec.instance_name = p_workspace_id)
  GROUP BY ec.phone_number HAVING count(*) > 1 ORDER BY count(*) DESC LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION zapp.find_duplicate_contacts(text, integer) TO authenticated;

-- ============================================================
-- 4. merge_contacts — dedup cross-base: admin genuíno (stub preservado)
-- ============================================================
DROP FUNCTION IF EXISTS zapp.merge_contacts(uuid, uuid, jsonb);
CREATE FUNCTION zapp.merge_contacts(
  p_primary_id uuid,
  p_secondary_id uuid,
  p_merged_fields jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, evo, public
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Implementação completa em migration dedicada (etapa 30 do plano de auditoria)
  RAISE EXCEPTION 'merge_contacts: implementacao pendente (etapa 30)' USING ERRCODE = '0A000';
END;
$$;
GRANT EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, jsonb) TO authenticated;
