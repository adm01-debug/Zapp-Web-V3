-- 2026-07-23 — E2E cleanup RPC (schema zapp)
-- Aplicar na VPS via: ./scripts/apply-vps-migrations.sh
-- ou:  psql "$SUPABASE_DB_URL" -f docs/migrations/2026-07-23_e2e_cleanup_rpc.sql
--
-- Consumido por e2e/utils/supabase.ts::cleanupTestData() após cada suite de CRM.

CREATE OR REPLACE FUNCTION zapp.rpc_e2e_cleanup(
  p_instance   text DEFAULT 'wpp2-test',
  p_remote_jid text DEFAULT '5511999999999@s.whatsapp.net',
  p_phone      text DEFAULT '5511999999999',
  p_name_like  text DEFAULT 'E2E %',
  p_email_like text DEFAULT '%@zappweb.test'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, evo, public
AS $$
DECLARE
  v_contacts_del int := 0;
  v_messages_del int := 0;
  v_evo_contacts_del int := 0;
  v_audit_del int := 0;
  v_notes_del int := 0;
  v_deals_del int := 0;
  v_user_ids uuid[];
BEGIN
  -- Guarda anti-produção: parâmetros vazios ou padrões amplos são rejeitados.
  IF p_instance IS NULL OR length(p_instance) < 4
     OR p_name_like NOT LIKE 'E2E%'
     OR p_email_like NOT LIKE '%@zappweb.test' THEN
    RAISE EXCEPTION 'rpc_e2e_cleanup: parametros invalidos (protecao anti-producao)';
  END IF;

  SELECT array_agg(user_id) INTO v_user_ids
    FROM zapp.profiles
   WHERE email LIKE p_email_like;

  BEGIN
    DELETE FROM zapp.contact_notes cn
     USING zapp.contacts c
     WHERE cn.contact_id = c.id
       AND (c.phone = p_phone OR c.name LIKE p_name_like OR c.remote_jid = p_remote_jid);
    GET DIAGNOSTICS v_notes_del = ROW_COUNT;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_notes_del := 0;
  END;

  BEGIN
    DELETE FROM zapp.sales_deals d
     USING zapp.contacts c
     WHERE d.contact_id = c.id
       AND (c.phone = p_phone OR c.name LIKE p_name_like);
    GET DIAGNOSTICS v_deals_del = ROW_COUNT;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_deals_del := 0;
  END;

  BEGIN
    DELETE FROM evo.evolution_messages
     WHERE instance = p_instance OR remote_jid = p_remote_jid;
    GET DIAGNOSTICS v_messages_del = ROW_COUNT;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_messages_del := 0;
  END;

  BEGIN
    DELETE FROM evo.evolution_contacts
     WHERE instance = p_instance OR remote_jid = p_remote_jid;
    GET DIAGNOSTICS v_evo_contacts_del = ROW_COUNT;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_evo_contacts_del := 0;
  END;

  BEGIN
    DELETE FROM zapp.contacts
     WHERE phone = p_phone
        OR remote_jid = p_remote_jid
        OR name LIKE p_name_like;
    GET DIAGNOSTICS v_contacts_del = ROW_COUNT;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_contacts_del := 0;
  END;

  IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
    BEGIN
      DELETE FROM zapp.audit_logs
       WHERE user_id = ANY(v_user_ids)
         AND created_at > now() - interval '7 days';
      GET DIAGNOSTICS v_audit_del = ROW_COUNT;
    EXCEPTION WHEN undefined_table OR undefined_column THEN v_audit_del := 0;
    END;
  END IF;

  RETURN jsonb_build_object(
    'contacts_deleted',      v_contacts_del,
    'notes_deleted',         v_notes_del,
    'deals_deleted',         v_deals_del,
    'evo_messages_deleted',  v_messages_del,
    'evo_contacts_deleted',  v_evo_contacts_del,
    'audit_logs_deleted',    v_audit_del,
    'e2e_user_ids',          COALESCE(to_jsonb(v_user_ids), '[]'::jsonb),
    'ran_at',                now()
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_e2e_cleanup(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_e2e_cleanup(text, text, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION zapp.rpc_e2e_cleanup(text, text, text, text, text) IS
  'Remove dados sinteticos gerados pelas suites E2E de CRM. Escopo restrito por marcadores (nome, telefone, instancia, email).';
