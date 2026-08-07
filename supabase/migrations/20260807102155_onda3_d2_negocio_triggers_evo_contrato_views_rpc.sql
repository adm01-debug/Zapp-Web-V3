-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
CREATE OR REPLACE FUNCTION evo.fn_auto_assign_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE v_connection_id uuid; v_agent uuid;
BEGIN
  BEGIN
    SELECT wc.id INTO v_connection_id FROM public.whatsapp_connections wc
    WHERE wc.instance_name = NEW.instance_name::text AND wc.is_active = true
    ORDER BY wc.last_connected_at DESC NULLS LAST LIMIT 1;
    SELECT r.agent_id INTO v_agent FROM public.client_wallet_rules r
    WHERE r.is_active = true AND (r.whatsapp_connection_id IS NULL OR r.whatsapp_connection_id = v_connection_id)
    ORDER BY r.priority DESC, r.created_at ASC LIMIT 1;
    IF v_agent IS NOT NULL THEN NEW.assigned_to := v_agent::text; END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION evo.fn_log_assignment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'zapp'
AS $function$
BEGIN
  BEGIN
    PERFORM zapp.rpc_log_assignment_change(
      NEW.id,
      evo.fn_uuid_safe(OLD.assigned_to),
      evo.fn_uuid_safe(NEW.assigned_to),
      CASE WHEN OLD.assigned_to IS NULL THEN 'assign'
           WHEN NEW.assigned_to IS NULL THEN 'unassign'
           ELSE 'transfer' END,
      COALESCE(evo.fn_uuid_safe(NEW.assigned_to), evo.fn_uuid_safe(OLD.assigned_to))
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION evo.sync_contact_intelligence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo'
AS $function$
BEGIN
  -- INSERT ou UPDATE relevante (lead_score, total_purchases, lead_status mudou)
  IF TG_OP = 'DELETE' THEN
    -- ON DELETE CASCADE ja remove; nada a fazer
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.lead_score      IS NOT DISTINCT FROM OLD.lead_score
    AND NEW.total_purchases IS NOT DISTINCT FROM OLD.total_purchases
    AND NEW.lead_status     IS NOT DISTINCT FROM OLD.lead_status
    AND NEW.last_message_at IS NOT DISTINCT FROM OLD.last_message_at
    AND NEW.total_messages  IS NOT DISTINCT FROM OLD.total_messages
    AND NEW.deleted_at      IS NOT DISTINCT FROM OLD.deleted_at
    THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    -- Contato soft-deleted -> remove da CI (via RPC de contrato)
    PERFORM zapp.rpc_purge_contact_intelligence(NEW.id);
    RETURN NEW;
  END IF;

  -- Executa upsert assincrono (pos-commit) via trigger AFTER
  PERFORM zapp.upsert_contact_intelligence(NEW.id);
  RETURN NEW;
END;
$function$

-- ADR-DB-002 (D2 negocio): 3 funcoes trigger evo repontadas para contrato:
--   fn_auto_assign_contact: leituras via views public.* (whatsapp_connections, client_wallet_rules)
--   fn_log_assignment_change: escrita via zapp.rpc_log_assignment_change (RPC de contrato)
--   sync_contact_intelligence: purge via zapp.rpc_purge_contact_intelligence (RPC de contrato)
-- RPCs de contrato (defs acima em /tmp/defs_ag05.json): rpc_log_assignment_change, rpc_purge_contact_intelligence.
