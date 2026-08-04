-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260805140000_fix_contact_editing_rpcs.sql
-- Purpose  : Fix CRITICAL gap found by 5-agent exhaustive audit (2026-08-04):
--            (1) zapp.update_contact_versioned() quebrava com 42703 em TODA
--                chamada — a view zapp.contacts não tem colunas version/updated_by
--                (a RPC lia da VIEW; corrigida para ler da BASE evo.evolution_contacts
--                que tem version) e usava guard workspace_id inexistente em profiles.
--            (2) zapp.rpc_set_whatsapp_mode() existe em produção mas NÃO estava
--                em nenhuma migration do repo (drift repo↔DB — removida na limpeza
--                ebf9558d5 e ausente do canônico/restore_orphaned_rpcs).
-- Verified : pg_proc + pg_get_functiondef + information_schema em produção.
-- Idempotent: CREATE OR REPLACE.
-- Rollback  : restaurar defs anteriores (ver git history / backup).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. update_contact_versioned — reescrita para a tabela BASE
--    (evo.evolution_contacts TEM version; a view zapp.contacts NÃO)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.update_contact_versioned(p_contact_id uuid, p_expected_version integer, p_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_current_version integer;
  v_result          jsonb;
BEGIN
  -- Guard de visibilidade (padrão do repo — ver add_contact_note)
  IF NOT (zapp.is_admin_or_supervisor()
          OR (p_contact_id IS NOT NULL AND zapp.is_contact_visible_to_user(p_contact_id, auth.uid()))) THEN
    RAISE EXCEPTION 'forbidden: contato nao visivel' USING ERRCODE = '42501';
  END IF;

  SELECT ec.version INTO v_current_version
  FROM evo.evolution_contacts ec
  WHERE ec.id = p_contact_id
    AND ec.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTACT_NOT_FOUND: Contact % not found', p_contact_id;
  END IF;

  IF v_current_version IS DISTINCT FROM p_expected_version THEN
    SELECT jsonb_build_object(
      'error',            'CONFLICT',
      'message',          'Este contato foi modificado por outro usuário. Recarregue e tente novamente.',
      'current_version',  ec.version,
      'your_version',     p_expected_version,
      'last_updated_at',  ec.updated_at
    ) INTO v_result
    FROM evo.evolution_contacts ec WHERE ec.id = p_contact_id;
    RETURN v_result;
  END IF;

  -- Versions match — update via view (INSTEAD OF trigger mantém a base em sync)
  UPDATE zapp.contacts
  SET
    name    = COALESCE((p_updates->>'name')::text,    name),
    phone   = COALESCE((p_updates->>'phone')::text,   phone),
    email   = COALESCE((p_updates->>'email')::text,   email),
    company = COALESCE((p_updates->>'company')::text, company),
    notes   = COALESCE((p_updates->>'notes')::text,   notes),
    tags    = CASE WHEN p_updates ? 'tags' THEN
                ARRAY(SELECT jsonb_array_elements_text(p_updates->'tags'))
              ELSE tags END,
    custom_fields = CASE WHEN p_updates ? 'custom_fields' THEN
                      p_updates->'custom_fields'
                    ELSE custom_fields END
  WHERE id = p_contact_id;

  UPDATE evo.evolution_contacts
  SET version = version + 1
  WHERE id = p_contact_id;

  SELECT jsonb_build_object(
    'success', true,
    'version', ec.version,
    'updated_at', ec.updated_at
  ) INTO v_result
  FROM evo.evolution_contacts ec WHERE ec.id = p_contact_id;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION zapp.update_contact_versioned(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.update_contact_versioned(uuid, integer, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_set_whatsapp_mode — reconciliada de produção (drift repo↔DB)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_set_whatsapp_mode(p_mode text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT zapp.is_admin_or_supervisor(v_uid) THEN
    RAISE EXCEPTION 'forbidden: only admin/supervisor can change whatsapp_mode';
  END IF;

  IF p_mode NOT IN ('official', 'unofficial') THEN
    RAISE EXCEPTION 'invalid mode: % (allowed: official, unofficial)', p_mode;
  END IF;

  INSERT INTO zapp.global_settings (key, value, updated_by)
  VALUES ('whatsapp_mode', p_mode, v_uid)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  RETURN p_mode;
END;
$function$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_set_whatsapp_mode(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_set_whatsapp_mode(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. trg_validate_whatsapp_connection_url — trigger reconciliado de produção
--    (função fn_validate_whatsapp_connection_url criada na delta 05000000,
--    mas o TRIGGER nunca foi versionado — ambiente limpo teria a função órfã
--    e F6-12 inerte. Achado ALTO da auditoria 5 agentes.)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_validate_whatsapp_connection_url ON zapp.whatsapp_connections;
CREATE TRIGGER trg_validate_whatsapp_connection_url
  BEFORE INSERT OR UPDATE OF api_url ON zapp.whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_validate_whatsapp_connection_url();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. contact_notes_delete — policy DELETE com guard de ownership
--    (o frontend useContactNotes.deleteNote usa .delete() direto; sem policy
--    o RLS negava silenciosamente — excluir nota quebrado em produção.
--    Guard: autor OU admin/supervisor.)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS contact_notes_delete ON zapp.contact_notes;
CREATE POLICY contact_notes_delete ON zapp.contact_notes
  FOR DELETE TO authenticated
  USING (
    author_id = zapp.get_profile_id_for_user(auth.uid())
    OR zapp.is_admin_or_supervisor()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v1 BOOLEAN; v2 BOOLEAN; v3 BOOLEAN; v4 BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'update_contact_versioned'
     AND p.proargnames = ARRAY['p_contact_id','p_expected_version','p_updates']
  ) INTO v1;
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'rpc_set_whatsapp_mode'
     AND p.proargnames = ARRAY['p_mode']
  ) INTO v2;
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zapp' AND c.relname = 'whatsapp_connections'
     AND t.tgname = 'trg_validate_whatsapp_connection_url' AND NOT t.tgisinternal
  ) INTO v3;
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
   WHERE schemaname = 'zapp' AND tablename = 'contact_notes'
     AND policyname = 'contact_notes_delete' AND cmd = 'DELETE'
     AND roles @> ARRAY['authenticated']
  ) INTO v4;

  IF NOT v1 THEN RAISE EXCEPTION 'VERIFICATION FAILED: update_contact_versioned'; END IF;
  IF NOT v2 THEN RAISE EXCEPTION 'VERIFICATION FAILED: rpc_set_whatsapp_mode'; END IF;
  IF NOT v3 THEN RAISE EXCEPTION 'VERIFICATION FAILED: trg_validate_whatsapp_connection_url'; END IF;
  IF NOT v4 THEN RAISE EXCEPTION 'VERIFICATION FAILED: contact_notes_delete'; END IF;
END $$;

COMMIT;
