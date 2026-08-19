-- ============================================================
-- Decouple I4 (pg_net): evo.fn_notify_sicoob_on_reply
-- Elimina URL hardcoded de infra (functions:9000) -> vault secret
-- 'sicoob_bridge_edge_url' via ops.fn_get_vault_secret (com fallback).
-- Trigger ativo x3 (zapp.evolution_messages + partições) — CUIDADO.
-- Data: 2026-08-15 | Idempotente — CREATE OR REPLACE.
-- ============================================================
CREATE OR REPLACE FUNCTION evo.fn_notify_sicoob_on_reply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo'
AS $function$
DECLARE v_lead_status text; v_edge_url text;
BEGIN
  BEGIN
    v_edge_url := COALESCE(ops.fn_get_vault_secret('sicoob_bridge_edge_url'), 'http://functions:9000');
    SELECT lead_status INTO v_lead_status FROM zapp.evolution_contacts WHERE id = NEW.contact_id;
    IF v_lead_status = 'sicoob_gifts' THEN
      PERFORM net.http_post(
        url := v_edge_url || '/sicoob-bridge-reply',
        body := jsonb_build_object('contact_id', NEW.contact_id, 'content', NEW.content, 'message_id', NEW.id, 'created_at', NEW.created_at),
        headers := jsonb_build_object('Content-Type','application/json'));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $function$;
